"""Crée la fiche data.gouv.fr de Vigie Dette en brouillon, à partir de docs/data-gouv-fiche.md.

python scripts/publier_data_gouv.py            affiche ce qui serait envoyé, sans rien envoyer
python scripts/publier_data_gouv.py --envoyer  crée le jeu de données (brouillon) et ses 8 ressources distantes

La clé d'API (data.gouv.fr, Paramètres du profil) est lue dans DATAGOUV_API_KEY ou dans ~/.config/vigie/datagouv_key.
Le jeu de données reste en brouillon (private: true) : on le relit sur data.gouv.fr, puis on le publie depuis l'interface.
"""
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
API = 'https://www.data.gouv.fr/api/1'
CLE = Path.home() / '.config' / 'vigie' / 'datagouv_key'


def fiche():
    texte = (RACINE / 'docs' / 'data-gouv-fiche.md').read_text(encoding='utf-8')
    champs = dict(re.findall(r'^- \*\*(.+?)\*\* : (.+)$', texte, re.M))
    description = re.search(r'^````markdown\n(.*?)\n````$', texte, re.M | re.S).group(1)
    tableau = texte.split('## Ressources', 1)[1].split('\n## ', 1)[0]
    ressources = [
        dict(zip(('title', 'url', 'description'), (c.strip() for c in ligne.strip('|').split('|'))))
        for ligne in tableau.splitlines() if ligne.startswith('| ') and 'https://' in ligne
    ]
    return champs, description, ressources


def jeu_de_donnees(champs, description):
    debut = re.match(r'du (\d\d)/(\d\d)/(\d{4})', champs['Couverture temporelle'])
    return {
        'title': champs['Titre'],
        'acronym': champs['Acronyme'],
        'description': description,
        'license': 'lov2',  # Licence Ouverte / Open Licence version 2.0
        'frequency': 'daily',
        'tags': [m.strip() for m in champs['Mots-clés'].split(',')],
        'temporal_coverage': {'start': f'{debut[3]}-{debut[2]}-{debut[1]}'},
        'spatial': {'zones': ['country:fr'], 'granularity': 'country'},
        'private': True,  # brouillon
    }


def appel(methode, chemin, corps, cle):
    requete = urllib.request.Request(
        f'{API}{chemin}', data=json.dumps(corps).encode(), method=methode,
        headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'X-API-KEY': cle},
    )
    try:
        with urllib.request.urlopen(requete, timeout=60) as reponse:
            return json.load(reponse)
    except urllib.error.HTTPError as e:
        sys.exit(f'Erreur {e.code} sur {methode} {chemin} : {e.read().decode(errors="replace")}')


def main(args):
    champs, description, ressources = fiche()
    jeu = jeu_de_donnees(champs, description)
    if len(ressources) != 8:
        sys.exit(f'{len(ressources)} ressources lues dans la fiche au lieu de 8')
    if '--envoyer' not in args:
        print(json.dumps({**jeu, 'description': f'{description[:120]}… ({len(description)} caractères)'}, ensure_ascii=False, indent=2))
        for r in ressources:
            print('ressource :', r['title'], '|', r['url'])
        print('\nRien n\'a été envoyé. Relancer avec --envoyer pour créer le brouillon.')
        return
    cle = os.environ.get('DATAGOUV_API_KEY') or (CLE.read_text().strip() if CLE.exists() else '')
    if not cle:
        sys.exit(f'Clé d\'API absente : DATAGOUV_API_KEY ou {CLE}')
    cree = appel('POST', '/datasets/', jeu, cle)
    print('Brouillon créé :', cree['page'])
    for r in reversed(ressources):  # data.gouv.fr affiche la dernière ressource ajoutée en premier
        appel('POST', f'/datasets/{cree["id"]}/resources/',
              {**r, 'type': 'main', 'filetype': 'remote', 'format': 'json', 'mime': 'application/json'}, cle)
        print('ressource ajoutée :', r['title'])
    print(f'\nÀ relire puis publier depuis : {cree["page"]}')


if __name__ == '__main__':
    main(sys.argv[1:])
