"""Crée ou met à jour la fiche data.gouv.fr de Vigie Dette, à partir de docs/data-gouv-fiche.md.

python scripts/publier_data_gouv.py            affiche ce qui serait envoyé, sans rien envoyer
python scripts/publier_data_gouv.py --envoyer  crée la fiche si elle n'existe pas, sinon la met à jour :
                                               champs, ressources (par URL : ajout, mise à jour, retrait) et ordre

La clé d'API (data.gouv.fr, Paramètres du profil) est lue dans DATAGOUV_API_KEY ou dans ~/.config/vigie/datagouv_key.
La fiche reste en brouillon (private: true) tant que le champ « Brouillon » de la fiche vaut oui : l'API rend
publique toute fiche modifiée sans private: true.
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
MIME = {'csv': 'text/csv', 'json': 'application/json', 'html': 'text/html'}


def bloc(texte):
    return re.search(r'^````markdown\n(.*?)\n````$', texte, re.M | re.S).group(1)


def fiche():
    texte = (RACINE / 'docs' / 'data-gouv-fiche.md').read_text(encoding='utf-8')
    tete, ressources_md = texte.split('\n## Ressources\n', 1)
    champs = dict(re.findall(r'^- \*\*(.+?)\*\* : (.+)$', tete, re.M))
    ressources = []
    for partie in ressources_md.split('\n## ', 1)[0].split('\n### ')[1:]:
        r = dict(re.findall(r'^- \*\*(.+?)\*\* : (.+)$', partie, re.M))
        ressources.append({
            'title': partie.split('\n', 1)[0].strip(), 'url': r['URL'], 'format': r['Format'], 'type': r['Type'],
            'filetype': 'remote', 'mime': MIME[r['Format']], 'description': bloc(partie),
        })
    return champs, bloc(tete.split('\n## Description\n', 1)[1]), ressources


def jeu_de_donnees(champs, description):
    debut = re.match(r'du (\d\d)/(\d\d)/(\d{4})', champs['Couverture temporelle'])
    return {
        'title': champs['Titre'],
        'acronym': champs['Acronyme'],
        'description_short': champs['Description courte'],
        'description': description,
        'license': 'lov2',  # Licence Ouverte / Open Licence version 2.0
        'frequency': 'daily',
        'tags': [m.strip() for m in champs['Mots-clés'].split(',')],
        'temporal_coverage': {'start': f'{debut[3]}-{debut[2]}-{debut[1]}'},
        'spatial': {'zones': ['country:fr'], 'granularity': 'country'},
        'private': champs['Brouillon'].strip() == 'oui',
    }


def appel(methode, chemin, cle, corps=None):
    requete = urllib.request.Request(
        f'{API}{chemin}', data=None if corps is None else json.dumps(corps).encode(), method=methode,
        headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'X-API-KEY': cle},
    )
    try:
        with urllib.request.urlopen(requete, timeout=60) as reponse:
            contenu = reponse.read()
            return json.loads(contenu) if contenu else None
    except urllib.error.HTTPError as e:
        sys.exit(f'Erreur {e.code} sur {methode} {chemin} : {e.read().decode(errors="replace")}')


def main(args):
    champs, description, ressources = fiche()
    jeu = jeu_de_donnees(champs, description)
    if '--envoyer' not in args:
        print(json.dumps({**jeu, 'description': f'{description[:100]}… ({len(description)} caractères)'}, ensure_ascii=False, indent=2))
        for r in ressources:
            print(f"ressource ({r['type']}, {r['format']}) : {r['title']} | {r['url']} | {len(r['description'])} caractères")
        print('\nRien n\'a été envoyé. Relancer avec --envoyer pour créer ou mettre à jour la fiche.')
        return
    cle = os.environ.get('DATAGOUV_API_KEY') or (CLE.read_text().strip() if CLE.exists() else '')
    if not cle:
        sys.exit(f'Clé d\'API absente : DATAGOUV_API_KEY ou {CLE}')

    existants = appel('GET', '/me/datasets/', cle)
    existant = next((d for d in existants if d['title'] == jeu['title']), None)
    if existant:
        ds = appel('PUT', f"/datasets/{existant['id']}/", cle, jeu)
        print('Fiche mise à jour :', ds['page'])
    else:
        ds = appel('POST', '/datasets/', cle, jeu)
        print('Fiche créée :', ds['page'])

    actuelles = {r['url']: r for r in ds.get('resources', [])}
    voulues = {r['url'] for r in ressources}
    for url, r in actuelles.items():
        if url not in voulues:
            appel('DELETE', f"/datasets/{ds['id']}/resources/{r['id']}/", cle)
            print('ressource retirée :', r['title'])
    ids = []
    for r in ressources:
        if r['url'] in actuelles:
            rid = actuelles[r['url']]['id']
            appel('PUT', f"/datasets/{ds['id']}/resources/{rid}/", cle, r)
            print('ressource mise à jour :', r['title'])
        else:
            rid = appel('POST', f"/datasets/{ds['id']}/resources/", cle, r)['id']
            print('ressource ajoutée :', r['title'])
        ids.append(rid)
    appel('PUT', f"/datasets/{ds['id']}/resources/", cle, ids)  # ordre de la fiche
    print(f"\n{'Brouillon' if jeu['private'] else 'Fiche publique'} : {ds['page']}")


if __name__ == '__main__':
    main(sys.argv[1:])
