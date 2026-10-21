"""Tests de la collecte : python3 -m unittest scripts/test_update_data.py"""

import json
import shutil
import sys
import tempfile
import unittest
import urllib.error
from datetime import date, datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import update_data as u  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "data"
SAISIES = Path(__file__).resolve().parent.parent / "test" / "fixtures" / "saisies"
LE_20_OCTOBRE = date(2026, 10, 20)


def mensuel(debut_annee, fin_mois, champ="solde_mds"):
    a, m = map(int, fin_mois.split("-"))
    mois = [f"{y}-{k:02d}" for y in range(debut_annee, a + 1) for k in range(1, 13) if (y, k) <= (a, m)]
    return [{"mois": x, champ: -100.0} for x in mois]


class ControleForme(unittest.TestCase):
    def test_vrais_fichiers_du_20_octobre_sans_echec(self):
        for nom in ["spread.json", "target.json", "dette_pib.json", "non_residents_eurostat.json", "non_residents_bdf.json"]:
            payload = json.loads((DATA / nom).read_text(encoding="utf-8"))
            self.assertIsNone(u.controle_forme(nom, payload, payload, LE_20_OCTOBRE), nom)

    def test_target_80_jours_accepte_mais_pas_au_dela_de_100(self):
        serie = mensuel(2008, "2026-08")
        self.assertIsNone(u.controle_forme("target.json", serie, serie, LE_20_OCTOBRE))
        self.assertIn("vieille", u.controle_forme("target.json", serie, serie, date(2026, 12, 15)))

    def test_serie_vide(self):
        self.assertEqual(u.controle_forme("spread.json", [], mensuel(1999, "2026-09"), LE_20_OCTOBRE), "série vide")
        self.assertEqual(u.controle_forme("ciss.json", {"mensuel": [], "quotidien": []}, None, LE_20_OCTOBRE), "série vide")

    def test_serie_raccourcie(self):
        hier = mensuel(2008, "2026-08")
        self.assertIn("lignes contre", u.controle_forme("target.json", hier[:-5], hier, LE_20_OCTOBRE))
        self.assertIsNone(u.controle_forme("target.json", hier[1:], hier, LE_20_OCTOBRE))  # une ligne de moins : toléré

    def test_premier_passage_d_un_fichier_neuf(self):
        ciss = {"mensuel": [{"mois": f"2026-{k:02d}", "max": 0.1} for k in range(1, 11)],
                "quotidien": [{"jour": "2026-10-19", "valeur": 0.04}]}
        self.assertIn("premier passage", u.controle_forme("ciss.json", ciss, None, LE_20_OCTOBRE))
        ciss["mensuel"] = [{"mois": f"{y}-{k:02d}", "max": 0.1} for y in (2025, 2026) for k in range(1, 11)]
        self.assertIsNone(u.controle_forme("ciss.json", ciss, None, LE_20_OCTOBRE))

    def test_ciss_trop_ancien(self):
        ciss = {"mensuel": [{"mois": "2026-09", "max": 0.1}] * 20, "quotidien": [{"jour": "2026-10-05", "valeur": 0.04}]}
        self.assertIn("15 jours", u.controle_forme("ciss.json", ciss, ciss, LE_20_OCTOBRE))

    def test_spread_quotidien_7_jours_accepte_mais_pas_8(self):
        serie = [{"jour": "2026-10-13", "spread_pb": 120.0}] * 20
        self.assertIsNone(u.controle_forme("spread.json", serie, serie, LE_20_OCTOBRE))
        self.assertIn("8 jours", u.controle_forme("spread.json", serie, serie, date(2026, 10, 21)))

    def test_fin_de_periode(self):
        self.assertEqual(u.fin_de_periode([{"jour": "2026-10-20"}]), date(2026, 10, 20))
        self.assertEqual(u.fin_de_periode({"points": [{"date": "2026-06", "part": 59.7}]}), date(2026, 6, 30))
        self.assertEqual(u.fin_de_periode([{"trimestre": "2026-Q1"}]), date(2026, 3, 31))
        self.assertEqual(u.fin_de_periode([{"annee": 2025}]), date(2025, 12, 31))
        self.assertEqual(u.fin_de_periode([{"mois": "2026-02"}]), date(2026, 2, 28))


class Spread(unittest.TestCase):
    WEBSTAT = "\ufefftime_period;obs_value\r\n2026-10-16;4.794\r\n2026-10-17;\r\n2026-10-19;4.853\r\n2026-10-20;4.928\r\n"
    BUNDESBANK = (
        '"";BBSIS.D.I.ZAR;BBSIS.D.I.ZAR_FLAGS\n"";Renditen / RLZ 10 Jahre;\nDezimalstellen;2;\n'
        "2026-10-16;3,45;\n2026-10-17;.;Kein Wert vorhanden\n2026-10-19;3,46;\n"
    )

    def get(self, url, headers=None):
        if url.startswith(u.WEBSTAT):
            self.assertEqual(headers, {"Authorization": "Apikey cle-de-test"})
            return self.WEBSTAT.lstrip("\ufeff")
        return self.BUNDESBANK

    def test_seances_communes_aux_deux_taux_sans_moyenne(self):
        with mock.patch.dict(u.os.environ, {"WEBSTAT_API_KEY": "cle-de-test"}), mock.patch.object(u, "get", self.get):
            serie = u.serie_spread()
        # Le 20 octobre manque encore à la Bundesbank : la dernière séance commune est le 19.
        self.assertEqual(serie, [
            {"jour": "2026-10-16", "fr10": 4.794, "de10": 3.45, "spread_pb": 134.4},
            {"jour": "2026-10-19", "fr10": 4.853, "de10": 3.46, "spread_pb": 139.3},
        ])

    def test_cle_webstat_absente(self):
        with mock.patch.dict(u.os.environ, {"WEBSTAT_API_KEY": ""}), mock.patch.object(u, "CLE_WEBSTAT", Path("/nexiste/pas")):
            with self.assertRaisesRegex(ValueError, "clé Webstat absente"):
                u.serie_spread()


class NonResidents(unittest.TestCase):
    def test_trimestres_en_fin_de_mois(self):
        texte = "time_period;obs_value\r\n2025-Q4;56.07\r\n2026-Q1;57.5\r\n2026-Q2;59.66\r\n"
        with mock.patch.dict(u.os.environ, {"WEBSTAT_API_KEY": "cle"}), mock.patch.object(u, "get", lambda url, headers=None: texte):
            serie = u.serie_non_residents_bdf()
        self.assertEqual(serie["points"], [
            {"date": "2025-12", "part": 56.1}, {"date": "2026-03", "part": 57.5}, {"date": "2026-06", "part": 59.7},
        ])

    def test_series_a_points_controlees(self):
        serie = {"points": [{"date": f"{a}-{m:02d}", "part": 55.0} for a in range(2008, 2027) for m in (3, 6, 9, 12) if (a, m) <= (2026, 6)]}
        self.assertIsNone(u.controle_forme("non_residents_bdf.json", serie, serie, LE_20_OCTOBRE))
        self.assertEqual(u.controle_forme("non_residents_bdf.json", {"points": []}, serie, LE_20_OCTOBRE), "série vide")
        self.assertIn("vieille", u.controle_forme("non_residents_bdf.json", serie, serie, date(2027, 2, 1)))


class Couverture(unittest.TestCase):
    def adj(self, jour):
        return {"lignes": [{"date": jour, "adjuge_mds": 6.0, "demande_mds": 12.0}, {"date": "2026-10-15", "taux": 3.5}]}

    def test_couverture_recente(self):
        self.assertIsNone(u.alerte_couverture(self.adj("2026-08-06"), LE_20_OCTOBRE))

    def test_couverture_a_saisir_a_plus_de_2_mois(self):
        self.assertIn("couverture à saisir", u.alerte_couverture(self.adj("2026-07-02"), LE_20_OCTOBRE))


class Collecte(unittest.TestCase):
    def setUp(self):
        self.dossier = Path(tempfile.mkdtemp())
        for f in DATA.glob("*.json"):
            shutil.copy(f, self.dossier)
        self.addCleanup(shutil.rmtree, self.dossier)
        sans_reseau = mock.patch.dict(u.SAISIES, {nom: (lambda f: (f, [])) for nom in u.SAISIES}, clear=True)
        sans_reseau.start()
        self.addCleanup(sans_reseau.stop)

    def series(self, **remplace):
        ok = {nom: (lambda nom=nom: json.loads((DATA / nom).read_text(encoding="utf-8"))) for nom in u.SERIES if (DATA / nom).exists()}
        if "ciss.json" not in ok:  # avant le premier passage de la collecte du CISS
            ok["ciss.json"] = lambda: {"mensuel": [{"mois": "2026-09", "max": 0.1}] * 20, "quotidien": [{"jour": "2026-10-19", "valeur": 0.044}]}
        ok.update(remplace)
        return ok

    def test_une_serie_en_panne_les_autres_sont_ecrites(self):
        def panne():
            raise urllib.error.URLError("BCE injoignable")
        (self.dossier / "ciss.json").unlink(missing_ok=True)
        with mock.patch.dict(u.SERIES, self.series(**{"spread.json": panne}), clear=True):
            echecs = u.main(self.dossier, datetime(2026, 10, 20, 6, 30, tzinfo=timezone.utc))
        self.assertEqual([e["serie"] for e in echecs], ["spread.json"])
        self.assertIn("URLError", echecs[0]["erreur"])
        self.assertTrue((self.dossier / "ciss.json").exists())
        meta = json.loads((self.dossier / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(meta["echecs"], echecs)

    def test_cle_manquante_dans_la_reponse(self):
        def forme_changee():
            raise KeyError("OBS_VALUE")
        with mock.patch.dict(u.SERIES, self.series(**{"target.json": forme_changee}), clear=True):
            echecs = u.main(self.dossier, datetime(2026, 10, 20, 6, 30, tzinfo=timezone.utc))
        self.assertEqual([e["serie"] for e in echecs], ["target.json"])
        self.assertEqual(json.loads((self.dossier / "target.json").read_text(encoding="utf-8")),
                         json.loads((DATA / "target.json").read_text(encoding="utf-8")))

    def test_aucun_echec_avec_les_series_du_jour(self):
        with mock.patch.dict(u.SERIES, self.series(), clear=True):
            self.assertEqual(u.main(self.dossier, datetime(2026, 10, 20, 6, 30, tzinfo=timezone.utc)), [])


class Adjudications(unittest.TestCase):
    """Dépêche Reuters du 6 août 2026 sur Boursorama (extrait réel) : la saisie manuelle disait 6,34 / 14,791 / 3,90 %."""

    def setUp(self):
        self.page = (SAISIES / "adjudication-2026-08-06.html").read_text(encoding="utf-8")

    def test_ligne_de_reference_et_non_la_plus_proche_de_10_ans(self):
        jour, lignes_oat = u.lire_adjudication(self.page)
        self.assertEqual(jour, "2026-08-06")
        self.assertEqual([l["maturite"] for l in lignes_oat], ["2036-05-25", "2036-11-25", "2037-06-25", "2044-06-25"])
        l = u.ligne_dix_ans(jour, lignes_oat)  # 25/05/36 (2 Md€) est plus proche de 10 ans que 25/11/36 (6,3 Md€)
        self.assertEqual((l["maturite"], l["coupon"], l["adjuge_mds"], l["demande_mds"], l["taux"]), ("2036-11-25", "3,70", 6.34, 14.791, 3.9))

    def test_adjudication_a_moyen_terme_ignoree(self):
        lignes_oat = [{"maturite": "2031-02-25", "adjuge_mds": 2.0}, {"maturite": "2032-02-25", "adjuge_mds": 3.7}]
        self.assertIsNone(u.ligne_dix_ans("2026-10-15", lignes_oat))

    def maj(self, adj, pages):
        with mock.patch.object(u, "articles_adjudication", lambda: sorted(pages)), mock.patch.object(u, "get", lambda url, headers=None: pages[url]):
            return u.maj_adjudications(adj)

    def test_ajoute_puis_ne_rajoute_pas(self):
        url = "https://www.boursorama.com/bourse/actualites/details-de-l-adjudication-d-oat-d72247235c68"
        adj = {"lignes": [{"date": "2026-07-02", "ligne": "OAT 25/11/2036", "adjuge_mds": 7.025, "demande_mds": 16.686, "taux": 3.73}]}
        nouveau, alertes = self.maj(adj, {url: self.page})
        self.assertEqual(alertes, [])
        self.assertEqual(nouveau["lignes"][-1], {"date": "2026-08-06", "ligne": "OAT 3,70 % 25/11/2036", "adjuge_mds": 6.34,
                                                 "demande_mds": 14.791, "taux": 3.9, "source": url})
        self.assertEqual(len(adj["lignes"]), 1)  # le fichier d'origine n'est pas modifié
        self.assertEqual(self.maj(nouveau, {url: self.page})[0], nouveau)

    def test_complete_une_couverture_manquante(self):
        url = "https://www.boursorama.com/bourse/actualites/details-de-l-adjudication-d-oat-d72247235c68"
        adj = {"lignes": [{"date": "2026-08-06", "ligne": "OAT 10 ans", "taux": 3.9}]}
        self.assertEqual(self.maj(adj, {url: self.page})[0]["lignes"][0]["demande_mds"], 14.791)

    def test_valeurs_incoherentes_refusees(self):
        page = self.page.replace("14,791", "147,91")
        with self.assertRaises(ValueError):
            self.maj({"lignes": []}, {"https://www.boursorama.com/bourse/actualites/details-de-l-adjudication-d-oat-0": page})


class Notations(unittest.TestCase):
    """Extraits réels de Wikipédia et countryeconomy.com au 21/10/2026 (tous deux en retard sur une agence)."""

    def setUp(self):
        self.wiki = u.notes_wikipedia((SAISIES / "wikipedia.txt").read_text(encoding="utf-8"))
        self.ce = u.notes_countryeconomy((SAISIES / "countryeconomy.html").read_text(encoding="utf-8"))
        self.ratings = json.loads((DATA / "notations.json").read_text(encoding="utf-8"))

    def test_lecture_des_deux_sources(self):
        self.assertEqual(self.wiki["S&P"], ("A+", "stable", "2025-10-17"))
        self.assertEqual(self.wiki["Fitch"], ("A+", "stable", "2026-03-06"))
        self.assertEqual(self.ce["Moody's"], ("Aa3", "négative", "2025-10-24"))  # changement de perspective seul
        self.assertEqual(self.ce["S&P"], ("A+", "stable", "2025-10-17"))

    def sources(self, wiki, ce):
        return {"Wikipédia": (wiki, "https://en.wikipedia.org/wiki/x"), "countryeconomy.com": (ce, "https://countryeconomy.com/x")}

    def test_sources_en_retard_sans_alerte(self):
        self.assertEqual(u.maj_notations(self.ratings, self.sources(self.wiki, self.ce)), (self.ratings, []))

    def test_degradation_confirmee_par_les_deux_sources(self):
        wiki = {**self.wiki, "S&P": ("A", "stable", "2026-11-27")}
        ce = {**self.ce, "S&P": ("A", "stable", "2026-11-28")}
        nouveau, alertes = u.maj_notations(self.ratings, self.sources(wiki, ce))
        self.assertEqual(alertes, [])
        sp = next(a for a in nouveau["agences"] if a["agence"] == "S&P")
        self.assertEqual((sp["note"], sp["perspective"], sp["derniere"]), ("A", "stable", "2026-11-27"))
        self.assertEqual(sp["historique"][-1], {"date": "2026-11-27", "note": "A", "source": "https://en.wikipedia.org/wiki/x"})

    def test_une_seule_source_alerte_sans_modifier(self):
        wiki = {**self.wiki, "Fitch": ("A", "négative", "2026-11-20")}
        nouveau, alertes = u.maj_notations(self.ratings, self.sources(wiki, self.ce))
        self.assertEqual(nouveau, self.ratings)
        self.assertEqual(alertes, ["note à vérifier : Fitch A (négative) le 2026-11-20 selon Wikipédia"])

    def test_sources_en_desaccord(self):
        wiki = {**self.wiki, "S&P": ("A", "stable", "2026-11-27")}
        ce = {**self.ce, "S&P": ("A", "négative", "2026-11-27")}
        nouveau, alertes = u.maj_notations(self.ratings, self.sources(wiki, ce))
        self.assertEqual(nouveau, self.ratings)
        self.assertEqual(len(alertes), 2)


class CommitDeMeta(unittest.TestCase):
    def test_panne_resolue_fait_commiter_meta(self):
        avant = {"mis_a_jour": "x", "echecs": [{"serie": "ciss.json", "date": "2026-10-19", "erreur": "série vide"}]}
        apres = {"mis_a_jour": "y", "echecs": []}
        self.assertTrue(u.echecs_changes(avant, apres))

    def test_meme_panne_le_lendemain_ne_commite_pas_pour_la_date(self):
        a = {"echecs": [{"serie": "ciss.json", "date": "2026-10-19", "erreur": "série vide"}]}
        b = {"echecs": [{"serie": "ciss.json", "date": "2026-10-20", "erreur": "série vide"}]}
        self.assertFalse(u.echecs_changes(a, b))

    def test_ancien_meta_sans_echecs(self):
        self.assertFalse(u.echecs_changes({"mis_a_jour": "x"}, {"echecs": []}))
        self.assertFalse(u.echecs_changes(None, {"echecs": []}))


if __name__ == "__main__":
    unittest.main()
