"""Images du site, dessinées avec Pillow et les polices du site (fonts/).

python scripts/image_partage.py            images de partage partage-fr.png et partage-en.png (1200 x 630),
                                           à partir de data/instantane.json (écrit par scripts/pages.mjs --instantane)
python scripts/image_partage.py --icones   favicon.ico, favicon-48.png, apple-touch-icon.png et logo.png, d'après favicon.svg

Une image n'est réécrite que si son contenu change : le dépôt ne grossit pas d'une image par jour.
"""
import io
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RACINE = Path(__file__).resolve().parent.parent
BLEU = (0, 63, 163)  # --color-blue
BLANC = (255, 255, 255)
NIVEAUX = {  # --risk-* de styles.css, et la forme qui double la couleur sur la page
    'calme': ((46, 125, 140), 'rond'),
    'vigilance': ((160, 138, 30), 'triangle'),
    'tension': ((201, 106, 18), 'losange'),
    'crise': ((179, 38, 30), 'carre'),
}
TEXTES = {
    'fr': {'indice': 'Indice Vigie', 'pied': 'vigiedette.com · mis à jour chaque jour'},
    'en': {'indice': 'Vigie Index', 'pied': 'vigiedette.com · updated every day'},
}
LARGEUR, HAUTEUR, MARGE = 1200, 630, 72


def police(nom, taille, graisse):
    f = ImageFont.truetype(str(RACINE / 'fonts' / nom), taille)
    f.set_variation_by_axes([graisse if a['name'] == b'Weight' else a['default'] for a in f.get_variation_axes()])
    return f


def titre(taille, graisse=700):
    return police('BricolageGrotesque-Variable.ttf', taille, graisse)


def texte(taille, graisse=400):
    return police('Roboto-Variable.ttf', taille, graisse)


def lignes(d, phrase, f, largeur):
    sortie, courante = [], ''
    for mot in phrase.split():
        essai = f'{courante} {mot}'.strip()
        if d.textlength(essai, font=f) <= largeur:
            courante = essai
        else:
            sortie.append(courante)
            courante = mot
    return sortie + [courante]


def forme(d, nom, cx, cy, r, couleur):
    if nom == 'rond':
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=couleur)
    elif nom == 'triangle':
        d.polygon([(cx, cy - r), (cx + r, cy + r * 0.8), (cx - r, cy + r * 0.8)], fill=couleur)
    elif nom == 'losange':
        d.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], fill=couleur)
    else:
        d.rectangle([cx - r * 0.8, cy - r * 0.8, cx + r * 0.8, cy + r * 0.8], fill=couleur)


def partage(inst, lang):
    t = TEXTES[lang]
    img = Image.new('RGB', (LARGEUR, HAUTEUR), BLEU)
    d = ImageDraw.Draw(img)
    d.text((MARGE, 64), 'Vigie Dette France', font=titre(44, 700), fill=BLANC)

    y = 150
    if inst.get('indice') is not None:
        couleur, nom_forme = NIVEAUX[inst['niveau']]
        f_num, f_sur = titre(200, 800), titre(56, 600)
        d.text((MARGE - 8, y), str(inst['indice']), font=f_num, fill=BLANC)
        x = MARGE + d.textlength(str(inst['indice']), font=f_num) + 4
        d.text((x, y + 128), '/100', font=f_sur, fill=(214, 226, 247))
        # Nom de l'indice et pastille du niveau, à droite du chiffre
        x += d.textlength('/100', font=f_sur) + 48
        d.text((x, y + 44), t['indice'], font=titre(36, 600), fill=(214, 226, 247))
        f_niv = titre(38, 700)
        libelle = inst['niveauTexte'][lang]
        h, pad = 64, 26
        larg = pad + 28 + 14 + d.textlength(libelle, font=f_niv) + pad
        d.rounded_rectangle([x, y + 100, x + larg, y + 100 + h], radius=h // 2, fill=BLANC)
        forme(d, nom_forme, x + pad + 13, y + 100 + h / 2, 13, couleur)
        d.text((x + pad + 42, y + 100 + h / 2), libelle, font=f_niv, fill=couleur, anchor='lm')
        y += 250

    f_verdict = texte(38, 500)
    for i, ligne in enumerate(lignes(d, inst['verdict'][lang], f_verdict, LARGEUR - 2 * MARGE)[:3]):
        d.text((MARGE, y + i * 52), ligne, font=f_verdict, fill=BLANC)

    d.text((MARGE, HAUTEUR - 64), t['pied'], font=texte(28, 400), fill=(214, 226, 247), anchor='ls')
    return img


def icone(taille):
    """Le V blanc sur carré bleu arrondi de favicon.svg, dessiné quatre fois plus grand puis réduit."""
    k = taille * 4 / 64
    img = Image.new('RGBA', (taille * 4, taille * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, taille * 4 - 1, taille * 4 - 1], radius=round(14 * k), fill=BLEU)
    points = [(18 * k, 20 * k), (32 * k, 46 * k), (46 * k, 20 * k)]
    epaisseur = round(7 * k)
    d.line(points, fill=BLANC, width=epaisseur, joint='curve')
    for px, py in (points[0], points[2]):
        d.ellipse([px - epaisseur / 2, py - epaisseur / 2, px + epaisseur / 2, py + epaisseur / 2], fill=BLANC)
    return img.resize((taille, taille), Image.LANCZOS)


def enregistrer(img, nom):
    """Écrit l'image seulement si ses pixels changent ; renvoie True si le fichier a été (ré)écrit."""
    chemin = RACINE / nom
    if chemin.exists():
        with Image.open(chemin) as ancienne:
            if ancienne.mode == img.mode and ancienne.size == img.size and ancienne.tobytes() == img.tobytes():
                return False
    tampon = io.BytesIO()
    img.save(tampon, 'PNG', optimize=True)
    chemin.write_bytes(tampon.getvalue())
    return True


def main(args):
    if '--icones' in args:
        for nom, taille in (('favicon-48.png', 48), ('apple-touch-icon.png', 180), ('logo.png', 512)):
            print(nom, 'écrit' if enregistrer(icone(taille), nom) else 'inchangé')
        # favicon.ico, lu par défaut à la racine par certains robots et navigateurs : 16, 32 et 48 px
        icone(48).save(RACINE / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
        print('favicon.ico écrit')
        return
    inst = json.loads((RACINE / 'data' / 'instantane.json').read_text(encoding='utf-8'))
    for lang in ('fr', 'en'):
        nom = f'partage-{lang}.png'
        print(nom, 'écrit' if enregistrer(partage(inst, lang), nom) else 'inchangé')


if __name__ == '__main__':
    main(sys.argv[1:])
