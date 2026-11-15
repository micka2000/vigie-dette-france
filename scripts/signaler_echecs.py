"""Annotations GitHub pour les séries en échec, France puis Canada : ::error:: si l'échec bloque,
::warning:: pour une panne passagère (voir update_data.py).

Un meta.json illisible (le 10/11/2026, des marqueurs de conflit de rebase) est signalé comme tel,
au lieu d'interrompre l'étape sur une JSONDecodeError qui masquait les vraies erreurs.
"""
import json
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
FICHIERS = (("data/meta.json", ""), ("data/canada/meta.json", "Canada "))


def annotations(racine=RACINE):
    lignes = []
    for chemin, pays in FICHIERS:
        try:
            echecs = json.loads((racine / chemin).read_text(encoding="utf-8"))["echecs"]
        except FileNotFoundError:
            continue
        except (ValueError, KeyError, TypeError) as e:
            lignes.append(f"::error::{chemin} illisible ({e.__class__.__name__})")
            continue
        lignes += [f"::warning::{pays}{e['serie']} : panne passagère, nouvel essai au prochain passage ({e['erreur']})"
                   if e.get("passager") else f"::error::{pays}{e['serie']} : {e['erreur']}" for e in echecs]
    return lignes


if __name__ == "__main__":
    print("\n".join(annotations()))
    sys.exit(0)
