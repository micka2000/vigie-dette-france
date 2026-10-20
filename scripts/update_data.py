"""Récupère les séries publiques (BCE, Eurostat) et écrit les fichiers JSON du dashboard.

Lancé chaque jour par la GitHub Action `update-data.yml`.
Les adjudications et les notations sont tenues à la main dans data/adjudications.json
et data/notations.json (l'AFT ne publie pas d'API ouverte).
"""

import csv
import io
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
ECB = "https://data-api.ecb.europa.eu/service/data/"
EUROSTAT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
UA = {"User-Agent": "vigie-dette-france (github.com/micka2000/vigie-dette-france)"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8")


def ecb_series(key, start="1999-01"):
    text = get(f"{ECB}{key}?format=csvdata&startPeriod={start}")
    return {
        row["TIME_PERIOD"]: float(row["OBS_VALUE"])
        for row in csv.DictReader(io.StringIO(text))
        if row["OBS_VALUE"]
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


def write(name, payload):
    (DATA / name).write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def main():
    fr = ecb_series("IRS/M.FR.L.L40.CI.0000.EUR.N.Z")
    de = ecb_series("IRS/M.DE.L.L40.CI.0000.EUR.N.Z")
    write("spread.json", [
        {"mois": m, "fr10": fr[m], "de10": de[m], "spread_pb": round((fr[m] - de[m]) * 100, 1)}
        for m in sorted(fr) if m in de
    ])

    target = ecb_series("TGB/M.FR.N.A094T.U2.EUR.E", "2008-01")
    write("target.json", [{"mois": m, "solde_mds": round(v / 1000, 1)} for m, v in sorted(target.items())])

    # Dette publique (Maastricht) détenue par le reste du monde, en % du total
    holders = eurostat(
        "gov_10dd_ggd",
        "geo=FR&sector=S13&unit=PC_GDP&na_item=GD&maturity=TOTAL&sector2=S2&sector2=S1_S2&sector2=S121",
    )
    years = sorted({y for (_, y) in holders})
    write("non_residents_eurostat.json", [
        {
            "annee": int(y),
            "part_nonres": round(100 * holders[("S2", y)] / holders[("S1_S2", y)], 1),
            "part_bdf": round(100 * holders[("S121", y)] / holders[("S1_S2", y)], 1) if ("S121", y) in holders else None,
            "dette_pib": holders[("S1_S2", y)],
        }
        for y in years if ("S2", y) in holders and ("S1_S2", y) in holders
    ])

    debt = eurostat("gov_10q_ggdebt", "geo=FR&unit=PC_GDP&sector=S13&na_item=GD&sinceTimePeriod=2000-Q1")
    write("dette_pib.json", [{"trimestre": q[0], "dette_pib": v} for q, v in sorted(debt.items())])

    write("meta.json", {"mis_a_jour": datetime.now(timezone.utc).isoformat(timespec="minutes")})


if __name__ == "__main__":
    main()
