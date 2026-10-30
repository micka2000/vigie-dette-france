"""Reconstitue l'historique des adjudications à 10 ans depuis 2004 : python3 scripts/reconstituer_couverture.py

Source : historique officiel des adjudications d'OAT à moyen et long terme de l'AFT, de janvier 1999 à septembre 2026
(data/sources/aft_2026-10_hist_mlt.xlsx, téléchargé depuis un navigateur le 29/10/2026, le site de l'AFT bloquant
les robots), puis data/adjudications.json pour les séances suivantes (dépêches Reuters, collecte quotidienne).
Pour mettre à jour : télécharger le dernier AAAA-MM_hist_mlt.xlsx de l'AFT, changer SOURCE et URL_SOURCE, relancer.

Même règle que la collecte quotidienne (update_data.ligne_dix_ans) : dans chaque séance d'OAT non indexées,
la ligne de 8,5 à 11,5 ans au plus gros volume adjugé. Les séances d'août et de décembre sont gardées dans le
fichier mais écartées du calcul par score.mjs (adjudications mixtes, voir docs/designs/indice-vigie.md).
Couverture = volume demandé / volume adjugé (hors offres non compétitives), définition de l'AFT, identique chez Reuters.
"""

import json
import re
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "data" / "sources" / "aft_2026-10_hist_mlt.xlsx"
URL_SOURCE = ("https://www.aft.gouv.fr/files/medias-aft/"
              "3_Dette/3.2_OATMLT/3.2.1_OAT/Principaux%20chiffres/2026-10_hist_mlt.xlsx")
DEBUT = date(2004, 1, 1)
MOIS = {m: i + 1 for i, m in enumerate(["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
                                        "septembre", "octobre", "novembre", "décembre"])}
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def lignes_xlsx(chemin):
    """Lignes de la première feuille d'un .xlsx, sans dépendance (zip + XML)."""
    z = zipfile.ZipFile(chemin)
    partages = ["".join(t.text or "" for t in si.iter(NS + "t"))
                for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(NS + "si")]
    feuille = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    out = []
    for row in feuille.iter(NS + "row"):
        vals = {}
        for c in row.findall(NS + "c"):
            v = c.find(NS + "v")
            if v is None:
                continue
            col = 0
            for ch in re.match(r"[A-Z]+", c.get("r")).group(0):
                col = col * 26 + ord(ch) - 64
            vals[col - 1] = partages[int(v.text)] if c.get("t") == "s" else v.text
        out.append([vals.get(i, "") for i in range(max(vals) + 1)] if vals else [])
    return out


def echeance(ligne):
    m = re.search(r"(\d{1,2})(?:er)? (\w+) (\d{4})", ligne)
    return date(int(m.group(3)), MOIS[m.group(2).lower()], int(m.group(1)))


def taux_pourcent(v, tec10):
    """La colonne mélange % (3,81) et fraction (0,0385). Sous 0,2, on garde l'écriture la plus proche du TEC 10 du jour."""
    v = float(v)
    if abs(v) >= 0.2:
        return round(v, 2) + 0.0
    if tec10 is None:
        return round(v * 100, 2) + 0.0
    return round(min((v, v * 100), key=lambda x: abs(x - tec10)), 2) + 0.0  # + 0.0 : pas de « -0.0 »


def nom_ligne(ligne, ech):
    coupon = re.search(r"([\d,]+)\s*%", ligne).group(1)
    entier, _, dec = coupon.partition(",")
    return f"OAT {entier},{(dec + '00')[:2]} % {ech:%d/%m/%Y}"


def historique_aft(tec10):
    rows = lignes_xlsx(SOURCE)[1:]
    seances = {}
    for r in rows:
        if len(r) < 13 or r[0] not in ("adju_LT", "adju_MLT", "adju_MT"):
            continue  # adju_I : OAT indexées, hors périmètre
        jour = date(1899, 12, 30) + timedelta(days=int(float(r[1])))
        if jour < DEBUT:
            continue
        ech = echeance(r[6])
        if not 8.5 <= (ech - jour).days / 365.25 <= 11.5:
            continue
        adjuge, demande = float(r[8]) / 1000, float(r[7]) / 1000
        cand = {"date": jour.isoformat(), "ligne": nom_ligne(r[6], ech), "adjuge_mds": round(adjuge, 3),
                "demande_mds": round(demande, 3), "taux": taux_pourcent(r[12], tec10.get(jour.isoformat())),
                "source": URL_SOURCE}
        if jour not in seances or adjuge > seances[jour]["adjuge_mds"]:
            seances[jour] = cand
    return [seances[j] for j in sorted(seances)]


def main():
    spread = json.loads((RACINE / "data" / "spread.json").read_text(encoding="utf-8"))
    tec10 = {r["jour"]: r["fr10"] for r in spread}
    chemin = RACINE / "data" / "adjudications.json"
    actuel = json.loads(chemin.read_text(encoding="utf-8"))
    hist = historique_aft(tec10)
    fin_aft = hist[-1]["date"]
    apres = [l for l in actuel["lignes"] if l["date"] > fin_aft]
    lignes = hist + apres
    actuel["lignes"] = lignes
    actuel["description"] = (
        "Adjudications d'OAT : par séance, la ligne de 8,5 à 11,5 ans au plus gros volume adjugé. "
        "Couverture = volume demandé / volume adjugé (définition de l'AFT). "
        f"De 2004 à {fin_aft} : historique officiel de l'AFT ({SOURCE.relative_to(RACINE)}, "
        "reconstitué par scripts/reconstituer_couverture.py) ; ensuite : "
        "dépêches Reuters publiées par Boursorama, collectées chaque matin. Les séances d'août et de décembre "
        "(adjudications mixtes) sont gardées mais écartées du calcul."
    )
    actuel.pop("a_completer", None)
    chemin.write_text(json.dumps(actuel, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(hist)} séances AFT ({hist[0]['date']} à {fin_aft}), {len(apres)} séances Reuters")


if __name__ == "__main__":
    main()
