"""Polices du site en WOFF2, allégées, à partir des TTF de fonts/ (gardés pour scripts/image_partage.py).

python scripts/polices.py   (demande fonttools et brotli : pip install fonttools brotli)

Les axes inutilisés sont figés (largeur 100) et les graisses limitées à celles de styles.css ; seuls les caractères
latins, la ponctuation, les flèches, les fractions et les formes des niveaux (● ▲ ◆ ■) sont gardés.
Gain mesuré le 27/10/2026 : 522 Ko de TTF pour 150 Ko de WOFF2.
"""
import io
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

FONTS = Path(__file__).resolve().parent.parent / 'fonts'
POLICES = {
    'BricolageGrotesque-Variable': {'wdth': 100, 'wght': (400, 800)},
    'Roboto-Variable': {'wdth': 100, 'wght': (400, 700)},
}
CARACTERES = [(0x20, 0x7E), (0xA0, 0x17F), (0x192, 0x192), (0x2C6, 0x2C6), (0x2DA, 0x2DA), (0x2DC, 0x2DC),
              (0x2000, 0x206F), (0x20AC, 0x20AC), (0x2122, 0x2122), (0x2150, 0x215F), (0x2190, 0x2199),
              (0x2212, 0x2212), (0x2215, 0x2215), (0x2248, 0x2248), (0x2260, 0x2260), (0x2264, 0x2265),
              (0x25A0, 0x25FF)]

for nom, axes in POLICES.items():
    tampon = io.BytesIO()
    instantiateVariableFont(TTFont(FONTS / f'{nom}.ttf'), axes).save(tampon)
    tampon.seek(0)
    police = TTFont(tampon)  # rechargée : le découpage échoue sur une police instanciée en mémoire
    options = Options()
    options.flavor = 'woff2'
    options.layout_features = ['*']
    sub = Subsetter(options)
    sub.populate(unicodes=[c for a, b in CARACTERES for c in range(a, b + 1)])
    sub.subset(police)
    police.flavor = 'woff2'
    police.save(FONTS / f'{nom}.woff2')
    print(nom, round((FONTS / f'{nom}.woff2').stat().st_size / 1024), 'Ko')
