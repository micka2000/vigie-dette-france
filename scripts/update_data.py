"""Récupère les séries publiques (BCE, Banque de France, Bundesbank, Eurostat) et écrit les fichiers JSON du dashboard.

Lancé chaque jour par la GitHub Action `update-data.yml`.
L'AFT bloque les robots et les agences de notation n'ont pas d'API gratuite :
- les adjudications viennent des dépêches Reuters « Détails de l'adjudication d'OAT » publiées par Boursorama,
  trouvées par son plan de site (news.rss, environ 36 heures, et les archives d'environ 3 mois) ;
- un changement de note n'est appliqué que si Wikipédia et countryeconomy.com le donnent tous deux,
  sinon il est signalé dans `echecs` pour vérification.

Chaque série est collectée à part : une panne garde l'ancien fichier et s'inscrit dans
data/meta.json (`echecs`). Le script se termine en erreur s'il y a des échecs, après
avoir écrit tout ce qui pouvait l'être.
"""

import calendar
import csv
import io
import json
import html
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
ECB = "https://data-api.ecb.europa.eu/service/data/"
EUROSTAT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
WEBSTAT = "https://webstat.banque-france.fr/api/explore/v2.1/catalog/datasets/observations/exports/csv"
BUNDESBANK = "https://api.statistiken.bundesbank.de/rest/data/BBSIS/"
# Taux de l'échéance constante à 10 ans (TEC 10), clôture de chaque séance, depuis le 3 novembre 2004.
OAT10 = "FM.D.FR.EUR.FR2.BB.FRMOYTEC10.HSTA"
# Rendement à 10 ans des titres fédéraux, au pair avec coupon annuel, tiré de la courbe des taux (comparable au TEC 10).
BUND10 = "D.I.ZAR.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A"
# Part des titres de l'État (court et long terme) détenue par les non-résidents, en %, fin de trimestre, depuis 2008.
NONRES = "DET2.Q.N.FR.W1.S13111.S1.N.L.LE.F3.T._Z.PT._T.M.V.N._T"
CLE_WEBSTAT = Path.home() / ".config" / "vigie" / "webstat_key"
UA = {"User-Agent": "vigie-dette-france (github.com/micka2000/vigie-dette-france)"}
BOURSORAMA = "https://www.boursorama.com"
WIKIPEDIA = "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_countries_by_credit_rating&prop=wikitext&format=json&formatversion=2"
COUNTRYECONOMY = "https://countryeconomy.com/ratings/france"
# countryeconomy.com refuse les clients sans en-tête de navigateur.
NAVIGATEUR = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) vigie-dette-france (github.com/micka2000/vigie-dette-france)"}

# Âge maximal de la dernière donnée, en jours depuis la fin de sa période (D3).
# Chaque limite couvre le décalage de publication de la série, plus une marge.
LIMITES_JOURS = {
    "spread.json": 7,  # quotidien : un long week-end férié, plus une marge
    "target.json": 100,  # mensuel, publié 7 à 8 semaines après la fin du mois
    "bilan_bce.json": 45,  # hebdomadaire, ramené au mois : le mois en cours ou le précédent
    "ciss.json": 10,  # quotidien
    "dette_pib.json": 230,  # trimestriel, publié environ 4 mois après le trimestre
    "non_residents_eurostat.json": 550,  # annuel, publié en avril de l'année suivante
    "non_residents_bdf.json": 200,  # trimestriel, publié environ 3 mois et demi après le trimestre
}
LIGNES_MIN_NOUVEAU_FICHIER = 12
COUVERTURE_ALERTE_MOIS = 2  # un mois avant la sortie du calcul (péremption à 3 mois, D10)
ERREURS = (urllib.error.URLError, TimeoutError, KeyError, ValueError, ZeroDivisionError)


def get(url, headers=None):
    """Un second essai après une panne passagère (délai dépassé, coupure, erreur 5xx), jamais après une erreur 4xx."""
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    for essai in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8-sig")
        except (TimeoutError, urllib.error.URLError) as e:
            if essai == 2 or (isinstance(e, urllib.error.HTTPError) and e.code < 500):
                raise
            time.sleep(10)


def ecb_series(key, start="1999-01"):
    text = get(f"{ECB}{key}?format=csvdata&startPeriod={start}")
    return {
        row["TIME_PERIOD"]: float(row["OBS_VALUE"])
        for row in csv.DictReader(io.StringIO(text))
        if row["OBS_VALUE"]
    }


def cle_webstat():
    """Clé d'API Webstat : secret WEBSTAT_API_KEY dans l'Action, fichier ~/.config/vigie/webstat_key en local."""
    cle = os.environ.get("WEBSTAT_API_KEY") or (CLE_WEBSTAT.read_text().strip() if CLE_WEBSTAT.exists() else "")
    if not cle:
        raise ValueError("clé Webstat absente (WEBSTAT_API_KEY)")
    return cle


def webstat_jours(serie):
    params = urllib.parse.urlencode({"where": f'series_key="{serie}"', "select": "time_period,obs_value", "order_by": "time_period"})
    text = get(f"{WEBSTAT}?{params}", {"Authorization": f"Apikey {cle_webstat()}"})
    return {r["time_period"]: float(r["obs_value"]) for r in csv.DictReader(io.StringIO(text), delimiter=";") if r["obs_value"]}


def bundesbank_jours(serie, start="2004-01-01"):
    """Le CSV de la Bundesbank a des lignes d'en-tête, des virgules décimales et « . » les jours sans valeur."""
    text = get(f"{BUNDESBANK}{serie}?format=csv&startPeriod={start}", {"Accept": "text/csv"})
    return {
        l[0]: float(l[1].replace(",", "."))
        for l in csv.reader(io.StringIO(text), delimiter=";")
        if len(l) > 1 and len(l[0]) == 10 and l[0][4] == "-" and l[1] not in ("", ".")
    }


def eurostat(dataset, params):
    d = json.loads(get(f"{EUROSTAT}{dataset}?{params}"))
    ids, size = d["id"], d["size"]
    inv = {k: {i: c for c, i in d["dimension"][k]["category"]["index"].items()} for k in ids}
    out = {}
    for flat, value in d["value"].items():
        flat, coords = int(flat), {}
        for dim, s in zip(reversed(ids), reversed(size)):
            coords[dim] = inv[dim][flat % s]
            flat //= s
        out[tuple(coords[k] for k in ids if size[ids.index(k)] > 1)] = value
    return out


# ---------- Séries ----------


def serie_spread():
    """Spread de clôture de chaque séance où les deux taux existent. Aucune moyenne."""
    fr, de = webstat_jours(OAT10), bundesbank_jours(BUND10)
    return [
        {"jour": j, "fr10": fr[j], "de10": de[j], "spread_pb": round((fr[j] - de[j]) * 100, 1)}
        for j in sorted(fr) if j in de
    ]


def serie_non_residents_bdf():
    trimestres = webstat_jours(NONRES)
    return {
        "description": "Part des titres de l'État détenue par des non-résidents, en fin de trimestre (Banque de France).",
        "source": f"Banque de France, Webstat, série {NONRES}",
        "points": [
            {"date": f"{t[:4]}-{3 * int(t[-1]):02d}", "part": round(v, 1)}
            for t, v in sorted(trimestres.items())
        ],
    }


def serie_target():
    target = ecb_series("TGB/M.FR.N.A094T.U2.EUR.E", "2008-01")
    return [{"mois": m, "solde_mds": round(v / 1000, 1), "solde_meur": v} for m, v in sorted(target.items())]


def serie_bilan_bce():
    """Total du bilan de l'Eurosystème (BCE et banques centrales nationales), dernière semaine de chaque mois, en Md€.
    Sert de dénominateur au solde TARGET2 (méthode 2.1) : il neutralise le gonflement des soldes dû aux rachats de dette."""
    semaines = ecb_series("ILM/W.U2.C.T000000.Z5.Z01", "2008-01")
    mensuel = {}
    for s, v in sorted(semaines.items()):
        annee, num = s.split("-W")
        vendredi = date.fromisocalendar(int(annee), int(num), 5)
        mensuel[vendredi.strftime("%Y-%m")] = {"mois": vendredi.strftime("%Y-%m"), "semaine": vendredi.isoformat(), "bilan_mds": round(v / 1000, 1)}
    return [mensuel[m] for m in sorted(mensuel)]


def serie_ciss():
    jours = ecb_series("CISS/D.FR.Z0Z.4F.EC.SS_CIN.IDX")
    mensuel = {}
    for j, v in jours.items():
        mensuel[j[:7]] = max(v, mensuel.get(j[:7], v))
    return {
        "description": "Indicateur composite de stress systémique (CISS) de la BCE pour la France : maximum de chaque mois, et les 60 derniers jours.",
        "mensuel": [{"mois": m, "max": v} for m, v in sorted(mensuel.items())],
        "quotidien": [{"jour": j, "valeur": v} for j, v in sorted(jours.items())[-60:]],
    }


def serie_non_residents():
    # Dette publique (Maastricht) détenue par le reste du monde, en % du total
    holders = eurostat(
        "gov_10dd_ggd",
        "geo=FR&sector=S13&unit=PC_GDP&na_item=GD&maturity=TOTAL&sector2=S2&sector2=S1_S2&sector2=S121",
    )
    years = sorted({y for (_, y) in holders})
    return [
        {
            "annee": int(y),
            "part_nonres": round(100 * holders[("S2", y)] / holders[("S1_S2", y)], 1),
            "part_bdf": round(100 * holders[("S121", y)] / holders[("S1_S2", y)], 1) if ("S121", y) in holders else None,
            "dette_pib": holders[("S1_S2", y)],
        }
        for y in years if ("S2", y) in holders and ("S1_S2", y) in holders
    ]


def serie_dette_pib():
    debt = eurostat("gov_10q_ggdebt", "geo=FR&unit=PC_GDP&sector=S13&na_item=GD&sinceTimePeriod=2000-Q1")
    return [{"trimestre": q[0], "dette_pib": v} for q, v in sorted(debt.items())]


SERIES = {
    "spread.json": serie_spread,
    "target.json": serie_target,
    "bilan_bce.json": serie_bilan_bce,
    "ciss.json": serie_ciss,
    "non_residents_eurostat.json": serie_non_residents,
    "non_residents_bdf.json": serie_non_residents_bdf,
    "dette_pib.json": serie_dette_pib,
}


# ---------- Adjudications (dépêches Reuters sur Boursorama) ----------

ARTICLE_ADJ = re.compile(r"https://www\.boursorama\.com/bourse/actualites/(?:tableau-)?details-de-l-adjudication-d-oat-[0-9a-f]+")
# Un bloc par ligne d'OAT : on ne déborde jamais sur le bloc suivant (« OAT MATURITE »).
BLOC_OAT = re.compile(
    r"OAT\s+MATURITE\s+(\d{2})/(\d{2})/(\d{2})\s+COUPON\s+([\d,]+)\s*%\s+VOLUME ADJUGE\s+([\d,]+)\s+MDS?\s+EUROS\s+"
    r"VOLUME DEMANDE\s+([\d,]+)\s+MDS?\s+EUROS(?:(?!OAT\s+MATURITE).)*?TAUX MOYEN PONDERE\s+([\d,]+)\s*%"
)


def texte_page(page):
    """Texte brut d'une page : balises retirées, échappements JSON (\\n, \\t, \\/) et espaces réduits."""
    t = html.unescape(re.sub(r"<[^>]+>", " ", page))
    t = t.replace("\\n", " ").replace("\\t", " ").replace("\\/", "/")
    return re.sub(r"\s+", " ", t)


def lire_adjudication(page):
    """Date de l'adjudication et lignes d'OAT d'une dépêche « Détails de l'adjudication d'OAT »."""
    m = re.search(r'"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})', page)
    if not m:
        raise ValueError("date de publication introuvable")
    vu, lignes_oat = set(), []
    for j, mo, a, coupon, adjuge, demande, taux in BLOC_OAT.findall(texte_page(page)):
        ligne = {
            "maturite": f"20{a}-{mo}-{j}", "coupon": coupon,
            "adjuge_mds": float(adjuge.replace(",", ".")), "demande_mds": float(demande.replace(",", ".")),
            "taux": float(taux.replace(",", ".")),
        }
        cle = (ligne["maturite"], ligne["adjuge_mds"])
        if cle not in vu:  # le texte de la dépêche figure deux fois dans la page
            vu.add(cle)
            lignes_oat.append(ligne)
    return m.group(1), lignes_oat


def ligne_dix_ans(jour, lignes_oat):
    """La ligne de référence à 10 ans : le plus gros volume adjugé parmi les échéances de 8,5 à 11,5 ans
    (une petite ligne plus proche de 10 ans peut être émise le même jour). None pour une adjudication à moyen terme."""
    j = date.fromisoformat(jour)
    def ans(l):
        return (date.fromisoformat(l["maturite"]) - j).days / 365.25
    candidates = [l for l in lignes_oat if 8.5 <= ans(l) <= 11.5]
    return max(candidates, key=lambda l: l["adjuge_mds"]) if candidates else None


def verifier_adjudication(l):
    if not (0 < l["adjuge_mds"] <= 20 and l["adjuge_mds"] <= l["demande_mds"] <= 10 * l["adjuge_mds"] and 0 < l["taux"] < 15):
        raise ValueError(f"valeurs incohérentes pour l'adjudication du {l['date']} : {l}")


def articles_adjudication():
    """Adresses des dépêches d'adjudication dans le flux d'actualités et les archives du plan de site."""
    index = get(f"{BOURSORAMA}/sitemaps.xml")
    plans = [u for u in re.findall(r"<loc>([^<]+)</loc>", index) if "/sitemap/news.rss" in u or "/sitemap/news_long_" in u]
    return sorted({a for p in plans for a in ARTICLE_ADJ.findall(get(p))})


def maj_adjudications(adj):
    """Ajoute les adjudications à 10 ans absentes du fichier (et complète une couverture manquante). Renvoie (fichier, alertes)."""
    adj = json.loads(json.dumps(adj))
    connues = {l.get("source") for l in adj["lignes"]}
    par_date = {l["date"]: l for l in adj["lignes"]}
    for url in articles_adjudication():
        if url in connues:
            continue
        jour, lignes_oat = lire_adjudication(get(url))
        l10 = ligne_dix_ans(jour, lignes_oat)
        if not l10:
            continue
        a, mo, j = l10["maturite"].split("-")
        nouvelle = {
            "date": jour, "ligne": f"OAT {l10['coupon']} % {j}/{mo}/{a}", "adjuge_mds": l10["adjuge_mds"],
            "demande_mds": l10["demande_mds"], "taux": l10["taux"], "source": url,
        }
        verifier_adjudication(nouvelle)
        existante = par_date.get(jour)
        if existante is None:
            adj["lignes"].append(nouvelle)
            par_date[jour] = nouvelle
        elif existante.get("demande_mds") is None:
            existante.update({k: v for k, v in nouvelle.items() if k != "date"})
    adj["lignes"].sort(key=lambda l: l["date"])
    return adj, []


# ---------- Notes (Wikipédia et countryeconomy.com, recoupés) ----------

AGENCES = {"S&P": "Standard & Poor's", "Fitch": "Fitch", "Moody's": "Moody's"}
PERSPECTIVES = {"stable": "stable", "negative": "négative", "positive": "positive", "developing": "en développement"}
MOIS_EN = {m: i for i, m in enumerate(calendar.month_name) if m}


def perspective(texte):
    m = re.search(r"stable|negative|positive|developing", texte, re.I)
    return PERSPECTIVES[m.group(0).lower()] if m else None


def notes_wikipedia(wikitext):
    """{agence: (note, perspective, date)} lus dans les tableaux par agence de « List of countries by credit rating »."""
    titres = list(re.finditer(r"^(=+)\s*(.*?)\s*\1\s*$", wikitext, re.M))
    out = {}
    for i, t in enumerate(titres):
        agence = next((a for a, titre in AGENCES.items() if t.group(2) == titre), None)
        if not agence:
            continue
        section = wikitext[t.end(): titres[i + 1].start() if i + 1 < len(titres) else None]
        ligne = re.search(r"\{\{flag\|France\}\}(.*?)(?=\n\|-|\n\|\})", section, re.S)
        if not ligne:
            continue
        cellules = ligne.group(1).split("||")
        note = re.search(r"\{\{Percentage bar\|[^|]*\|[^|]*\|([^|}]+)\|", cellules[1])
        d = re.search(r"(\d{1,2}) ([A-Z][a-z]+) (\d{4})", cellules[3]) if len(cellules) > 3 else None
        if note and d and d.group(2) in MOIS_EN:
            out[agence] = (note.group(1).replace("−", "-").strip(), perspective(cellules[2]),
                           date(int(d.group(3)), MOIS_EN[d.group(2)], int(d.group(1))).isoformat())
    return out


def notes_countryeconomy(page):
    """{agence: (note, perspective, date)} : dernière ligne datée de la note long terme en devises, par agence."""
    out = {}
    for m in re.finditer(r"<table.*?</table>", page, re.S):
        avant = texte_page(page[max(0, m.start() - 600): m.start()])
        agence = max(AGENCES, key=lambda a: avant.rfind(a))
        if avant.rfind(agence) < 0 or agence in out:
            continue
        note = None
        for tr in re.findall(r"<tr.*?</tr>", m.group(0), re.S):
            c = [texte_page(x).strip() for x in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
            if len(c) < 2 or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", c[0]):
                continue
            n = re.match(r"([A-Za-z]{1,4}[0-9+\-]?)\s*\(", c[1])
            if agence not in out:
                out[agence] = [n.group(1) if n else None, perspective(c[1]), c[0]]
            if n and out[agence][0] is None:  # changement de perspective seul : la note vient de la ligne précédente
                out[agence][0] = n.group(1)
            if out[agence][0]:
                break
        if agence in out:
            out[agence] = tuple(out[agence]) if out[agence][0] else None
    return {a: v for a, v in out.items() if v}


def maj_notations(ratings, sources=None):
    """Applique un changement de note ou de perspective plus récent que le fichier quand les deux sources concordent
    (même note, même perspective, dates à 7 jours près). Sinon, une alerte par source. Renvoie (fichier, alertes)."""
    if sources is None:
        sources = {
            "Wikipédia": (notes_wikipedia(json.loads(get(WIKIPEDIA))["parse"]["wikitext"]),
                          "https://en.wikipedia.org/wiki/List_of_countries_by_credit_rating"),
            "countryeconomy.com": (notes_countryeconomy(get(COUNTRYECONOMY, NAVIGATEUR)), COUNTRYECONOMY),
        }
    ratings = json.loads(json.dumps(ratings))
    alertes = []
    for a in ratings["agences"]:
        connue = max([h["date"] for h in a["historique"]] + [a.get("derniere") or ""])
        nouveaux = {
            nom: v for nom, (notes, _) in sources.items()
            if (v := notes.get(a["agence"])) and v[2] > connue and (v[0] != a["note"] or v[1] != a.get("perspective"))
        }
        valeurs = list(nouveaux.values())
        if len(valeurs) == len(sources) and len({v[:2] for v in valeurs}) == 1 \
                and (date.fromisoformat(max(v[2] for v in valeurs)) - date.fromisoformat(min(v[2] for v in valeurs))) <= timedelta(days=7):
            note, persp, jour = valeurs[0][0], valeurs[0][1], min(v[2] for v in valeurs)
            url = sources["Wikipédia"][1] if "Wikipédia" in sources else next(iter(sources.values()))[1]
            if note != a["note"]:
                a["historique"].append({"date": jour, "note": note, "source": url})
            a.update({"note": note, "perspective": persp, "derniere": jour, "source_derniere": url})
            continue
        for nom, (note, persp, jour) in nouveaux.items():
            alertes.append(f"note à vérifier : {a['agence']} {note} ({persp}) le {jour} selon {nom}")
    return ratings, alertes


SAISIES = {"adjudications.json": maj_adjudications, "notations.json": maj_notations}


# ---------- Contrôle de forme ----------


def lignes(payload):
    return payload if isinstance(payload, list) else payload.get("mensuel") or payload.get("points", [])


def fin_de_periode(payload):
    """Date de fin de la période de la dernière donnée (jour, mois, trimestre ou année)."""
    if isinstance(payload, dict) and "quotidien" in payload:
        return date.fromisoformat(payload["quotidien"][-1]["jour"])
    r = lignes(payload)[-1]
    if "jour" in r:
        return date.fromisoformat(r["jour"])
    if "mois" in r or "date" in r:
        a, m = map(int, r.get("mois", r.get("date")).split("-"))
        return date(a, m, calendar.monthrange(a, m)[1])
    if "trimestre" in r:
        a, q = int(r["trimestre"][:4]), int(r["trimestre"][-1])
        return date(a, 3 * q, calendar.monthrange(a, 3 * q)[1])
    return date(int(r["annee"]), 12, 31)


def controle_forme(nom, payload, ancien, aujourd_hui):
    """Renvoie None si la série est acceptable, sinon la raison du refus."""
    n = len(lignes(payload))
    if n == 0 or (isinstance(payload, dict) and "quotidien" in payload and not payload["quotidien"]):
        return "série vide"
    if ancien is None:
        if n < LIGNES_MIN_NOUVEAU_FICHIER:
            return f"premier passage : {n} lignes, au moins {LIGNES_MIN_NOUVEAU_FICHIER} attendues"
    elif n < len(lignes(ancien)) - 1:
        return f"{n} lignes contre {len(lignes(ancien))} la veille"
    age = (aujourd_hui - fin_de_periode(payload)).days
    if age > LIMITES_JOURS[nom]:
        return f"dernière donnée vieille de {age} jours (limite {LIMITES_JOURS[nom]})"
    return None


def alerte_couverture(adj, aujourd_hui):
    """« couverture à saisir » quand la dernière couverture connue a plus de 2 mois (D10)."""
    # Mêmes séances que le calcul (score.mjs) : août et décembre écartés
    avec = [l for l in adj["lignes"] if l.get("adjuge_mds") and l.get("demande_mds") is not None and l["date"][5:7] not in ("08", "12")]
    if not avec:
        return "aucune couverture saisie"
    a, m = map(int, avec[-1]["date"][:7].split("-"))
    ecart = (aujourd_hui.year - a) * 12 + aujourd_hui.month - m
    if ecart > COUVERTURE_ALERTE_MOIS:
        return f"couverture à saisir : dernière adjudication 10 ans du {avec[-1]['date']}"
    return None


# ---------- Écriture ----------


def lire(dossier, nom):
    f = dossier / nom
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None


def write(dossier, nom, payload):
    (dossier / nom).write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def main(dossier=DATA, maintenant=None):
    maintenant = maintenant or datetime.now(timezone.utc)
    aujourd_hui = maintenant.date()
    echecs = []

    def echec(serie, erreur):
        echecs.append({"serie": serie, "date": aujourd_hui.isoformat(), "erreur": erreur})

    for nom, collecte in SERIES.items():
        ancien = lire(dossier, nom)
        try:
            payload = collecte()
            raison = controle_forme(nom, payload, ancien, aujourd_hui)
        except ERREURS as e:
            echec(nom, f"{type(e).__name__} : {e}")
            continue
        if raison:
            echec(nom, raison)
        else:
            write(dossier, nom, payload)

    for nom, mise_a_jour in SAISIES.items():
        ancien = lire(dossier, nom)
        try:
            nouveau, alertes = mise_a_jour(ancien)
        except (*ERREURS, TypeError, IndexError) as e:
            echec(nom, f"{type(e).__name__} : {e}")
            continue
        for alerte in alertes:
            echec(nom, alerte)
        if nouveau != ancien:
            write(dossier, nom, nouveau)

    try:
        raison = alerte_couverture(lire(dossier, "adjudications.json"), aujourd_hui)
    except (*ERREURS, TypeError) as e:
        raison = f"adjudications.json illisible : {type(e).__name__} : {e}"
    if raison:
        echec("adjudications.json", raison)

    write(dossier, "meta.json", {"mis_a_jour": maintenant.isoformat(timespec="minutes"), "echecs": echecs})
    return echecs


def echecs_changes(ancien_meta, nouveau_meta):
    """meta.json est commité dès que la liste des échecs change, y compris quand une panne se résout."""
    def cles(m):
        return [(e["serie"], e["erreur"]) for e in (m or {}).get("echecs", [])]
    return cles(ancien_meta) != cles(nouveau_meta)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--echecs-changes":
        # Compare data/meta.json à la version commitée passée en argument ; code 0 si les échecs ont changé.
        texte = Path(sys.argv[2]).read_text(encoding="utf-8")
        sys.exit(0 if echecs_changes(json.loads(texte) if texte.strip() else None, lire(DATA, "meta.json")) else 1)
    resultat = main()
    for e in resultat:
        print(f"ÉCHEC {e['serie']} : {e['erreur']}", file=sys.stderr)
    sys.exit(1 if resultat else 0)
