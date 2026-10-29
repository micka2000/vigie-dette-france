"""Images du site, dessinées avec Pillow et les polices du site (fonts/).

python scripts/image_partage.py            images de partage partage-fr.png et partage-en.png (1200 x 630) :
                                           accroche, spread France-Allemagne depuis 2004 et échelle des niveaux,
                                           à partir de data/spread.json (moyennes des semaines complètes)
python scripts/image_partage.py --icones   favicon.ico, favicon-48.png, apple-touch-icon.png et logo.png, d'après favicon.svg

Une image n'est réécrite que si son contenu change : la courbe ne bouge qu'à chaque semaine complète,
le dépôt grossit donc d'une image par semaine, pas par jour.
"""
import io
import json
import sys
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

RACINE = Path(__file__).resolve().parent.parent
BLEU = (0, 63, 163)  # --color-blue
BLANC = (255, 255, 255)
CIEL = (177, 195, 230)
NIVEAUX = [  # teintes de --risk-* éclaircies pour le fond bleu, et la forme qui double la couleur sur la page
    ((79, 176, 192), 'rond'), ((208, 182, 64), 'triangle'), ((240, 138, 58), 'losange'), ((240, 100, 90), 'carre'),
]
TEXTES = {
    'fr': dict(titre='Le risque de la dette publique française, mesuré chaque jour.',
               sous='5 signaux officiels réunis dans un indice de 0 à 100',
               courbe='Écart de taux France-Allemagne à 10 ans, depuis 2004',
               pic='2011 · crise de la zone euro', auj="aujourd'hui",
               niveaux=['Calme', 'Vigilance', 'Tension', 'Crise'],
               signaux='Spread · AFT · non-résidents · notes · TARGET2'),
    'en': dict(titre='The risk on French public debt, measured every day.',
               sous='5 official signals combined into a 0 to 100 index',
               courbe='France-Germany 10-year yield spread, since 2004',
               pic='2011 · euro area crisis', auj='today',
               niveaux=['Calm', 'Watch', 'Stress', 'Crisis'],
               signaux='Spread · AFT · foreign holdings · ratings · TARGET2'),
}
LARGEUR, HAUTEUR = 1200, 630
K = 2  # dessin à 2x puis réduction


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


def s(v):
    return round(v * K)


def semaines(spread):
    """Moyenne du spread par semaine ISO, sans la semaine en cours : la courbe change une fois par semaine."""
    groupes = {}
    for r in spread:
        groupes.setdefault(date.fromisoformat(r['jour']).isocalendar()[:2], []).append(r['spread_pb'])
    return [sum(v) / len(v) for _, v in sorted(groupes.items())[:-1]]


def fond(w, h):
    """Dégradé du bleu nuit (en bas à gauche) au bleu du site (en haut à droite)."""
    img = Image.new('RGB', (w, h))
    px = img.load()
    a, b = (0, 26, 84), BLEU
    for y in range(h):
        for x in range(w):
            t = min(1, max(0, (x / w) * 0.55 + (1 - y / h) * 0.45))
            px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return img


def partage(serie, lang):
    t = TEXTES[lang]
    W, H = LARGEUR * K, HAUTEUR * K
    img = fond(W, H).convert('RGBA')
    calque = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(calque)

    # Courbe du spread, sur toute la largeur, en bas
    x0, x1, yb, yh = s(40), s(1160), s(480), s(330)
    vmax = 230
    pts = [(x0 + (x1 - x0) * i / (len(serie) - 1), yb - (yb - yh) * max(v, 0) / vmax) for i, v in enumerate(serie)]
    for g in range(0, vmax, 50):  # repères horizontaux discrets
        y = yb - (yb - yh) * g / vmax
        d.line([(x0, y), (x1, y)], fill=(255, 255, 255, 18), width=s(1))
    d.polygon(pts + [(x1, yb), (x0, yb)], fill=(*CIEL, 40))
    lueur = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(lueur).line(pts, fill=(140, 180, 255, 170), width=s(12), joint='curve')
    calque = Image.alpha_composite(calque, lueur.filter(ImageFilter.GaussianBlur(s(6))))
    d = ImageDraw.Draw(calque)
    d.line(pts, fill=(235, 242, 255, 255), width=s(4), joint='curve')

    # Pic de 2011 et point du jour
    px, py = pts[max(range(len(serie)), key=lambda i: serie[i])]
    d.line([(px + s(10), py), (px + s(34), py)], fill=(255, 255, 255, 170), width=s(2))
    d.text((px + s(42), py), t['pic'], font=texte(s(26), 600), fill=CIEL, anchor='lm')
    ex, ey = pts[-1]
    for r, a in ((s(16), 50), (s(10), 90)):
        d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=(240, 138, 58, a))
    d.ellipse([ex - s(5.5), ey - s(5.5), ex + s(5.5), ey + s(5.5)], fill=BLANC)
    d.text((ex - s(20), ey - s(20)), t['auj'], font=texte(s(26), 700), fill=BLANC, anchor='rs')
    d.text((x0 + s(24), yb + s(34)), t['courbe'], font=texte(s(22), 500), fill=CIEL, anchor='ls')
    d.text((W - s(64), yb + s(34)), t['signaux'], font=texte(s(22), 600), fill=CIEL, anchor='rs')

    img = Image.alpha_composite(img, calque)
    d = ImageDraw.Draw(img)

    # En-tête : logo et nom
    d.rounded_rectangle([s(62), s(50), s(122), s(110)], radius=s(14), outline=(255, 255, 255, 90), width=s(2))
    img.alpha_composite(icone(s(56)), (s(64), s(52)))
    d.text((s(136), s(80)), 'Vigie Dette France', font=titre(s(38), 700), fill=BLANC, anchor='lm')
    d.text((W - s(64), s(80)), 'vigiedette.com', font=texte(s(28), 600), fill=CIEL, anchor='rm')

    # Accroche
    f = titre(s(46), 800)
    y = s(140)
    for ligne in lignes(d, t['titre'], f, s(860)):
        d.text((s(64), y), ligne, font=f, fill=BLANC)
        y += s(54)
    d.text((s(64), y + s(8)), t['sous'], font=texte(s(28), 500), fill=CIEL)

    # Échelle des niveaux
    y, x = s(566), s(64)
    fn = titre(s(27), 700)
    for (couleur, nom_forme), nom in zip(NIVEAUX, t['niveaux']):
        larg = s(22) + s(22) + s(12) + d.textlength(nom, font=fn) + s(22)
        d.rounded_rectangle([x, y - s(26), x + larg, y + s(26)], radius=s(26), fill=BLANC)
        forme(d, nom_forme, x + s(22) + s(11), y, s(11), couleur)
        d.text((x + s(56), y), nom, font=fn, fill=tuple(round(c * 0.72) for c in couleur), anchor='lm')
        x += larg + s(16)

    return img.convert('RGB').resize((LARGEUR, HAUTEUR), Image.LANCZOS)


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
    serie = semaines(json.loads((RACINE / 'data' / 'spread.json').read_text(encoding='utf-8')))
    for lang in ('fr', 'en'):
        nom = f'partage-{lang}.png'
        print(nom, 'écrit' if enregistrer(partage(serie, lang), nom) else 'inchangé')


if __name__ == '__main__':
    main(sys.argv[1:])
