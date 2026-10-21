"""Récupère les séries publiques (BCE, Banque de France, Bundesbank, Eurostat) et écrit les fichiers JSON du dashboard.

Lancé chaque jour par la GitHub Action `update-data.yml`.
Les adjudications et les notations sont tenues à la main dans data/adjudications.json
et data/notations.json (l'AFT ne publie pas d'API ouverte).

Chaque série est collectée à part : une panne garde l'ancien fichier et s'inscrit dans
data/meta.json (`echecs`). Le script se termine en erreur s'il y a des échecs, après
avoir écrit tout ce qui pouvait l'être.
"""

import calendar
import csv
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
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
CLE_WEBSTAT = Path.home() / ".config" / "vigie" / "webstat_key"
UA = {"User-Agent": "vigie-dette-france (github.com/micka2000/vigie-dette-france)"}

# Âge maximal de la dernière donnée, en jours depuis la fin de sa période (D3).
# Chaque limite couvre le décalage de publication de la série, plus une marge.
LIMITES_JOURS = {
    "spread.json": 7,  # quotidien : un long week-end férié, plus une marge
    "target.json": 100,  # mensuel, publié 7 à 8 semaines après la fin du mois
    "ciss.json": 10,  # quotidien
    "dette_pib.json": 230,  # trimestriel, publié environ 4 mois après le trimestre
    "non_residents_eurostat.json": 550,  # annuel, publié en avril de l'année suivante
}
LIGNES_MIN_NOUVEAU_FICHIER = 12
COUVERTURE_ALERTE_MOIS = 2  # un mois avant la sortie du calcul (péremption à 3 mois, D10)
ERREURS = (urllib.error.URLError, TimeoutError, KeyError, ValueError, ZeroDivisionError)


def get(url, headers=None):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8-sig")


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


def serie_target():
    target = ecb_series("TGB/M.FR.N.A094T.U2.EUR.E", "2008-01")
    return [{"mois": m, "solde_mds": round(v / 1000, 1), "solde_meur": v} for m, v in sorted(target.items())]


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
    "ciss.json": serie_ciss,
    "non_residents_eurostat.json": serie_non_residents,
    "dette_pib.json": serie_dette_pib,
}


# ---------- Contrôle de forme ----------


def lignes(payload):
    return payload.get("mensuel", []) if isinstance(payload, dict) else payload


def fin_de_periode(payload):
    """Date de fin de la période de la dernière donnée (jour, mois, trimestre ou année)."""
    if isinstance(payload, dict):
        return date.fromisoformat(payload["quotidien"][-1]["jour"])
    r = payload[-1]
    if "jour" in r:
        return date.fromisoformat(r["jour"])
    if "mois" in r:
        a, m = map(int, r["mois"].split("-"))
        return date(a, m, calendar.monthrange(a, m)[1])
    if "trimestre" in r:
        a, q = int(r["trimestre"][:4]), int(r["trimestre"][-1])
        return date(a, 3 * q, calendar.monthrange(a, 3 * q)[1])
    return date(int(r["annee"]), 12, 31)


def controle_forme(nom, payload, ancien, aujourd_hui):
    """Renvoie None si la série est acceptable, sinon la raison du refus."""
    n = len(lignes(payload))
    if n == 0 or (isinstance(payload, dict) and not payload.get("quotidien")):
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
    avec = [l for l in adj["lignes"] if l.get("adjuge_mds") and l.get("demande_mds") is not None]
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
