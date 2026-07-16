"""Generate bespoke pixel-art PNGs for the Minecraft demo wiki pages.

Each sprite is drawn on a 16x16 logical grid (Minecraft's native texture
resolution) and scaled to 256x256 with hard edges. Deterministic — re-running
regenerates identical art (seeded jitter), so media hashes stay stable across
publishes unless the art itself changes.

Run: python gen-media.py   (writes into ./minecraft-demo/media/)
"""
import random
from pathlib import Path

from PIL import Image

OUT = Path(__file__).parent / "minecraft-demo" / "media"
OUT.mkdir(parents=True, exist_ok=True)
S = 16  # logical grid
SCALE = 16  # 16*16 = 256px output


def canvas(bg=(0, 0, 0, 0)):
    return Image.new("RGBA", (S, S), bg)


def px(img, x, y, c):
    if 0 <= x < S and 0 <= y < S:
        img.putpixel((x, y), c if len(c) == 4 else (*c, 255))


def rect(img, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px(img, x, y, c)


def jitter(c, amt, rnd):
    return tuple(max(0, min(255, v + rnd.randint(-amt, amt))) for v in c[:3]) + (255,)


def textured(img, x0, y0, x1, y1, base, amt, seed):
    rnd = random.Random(seed)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px(img, x, y, jitter(base, amt, rnd))


def save(img, name):
    img.resize((S * SCALE, S * SCALE), Image.NEAREST).save(OUT / name)
    print("wrote", name)


# ── minecraft.png — the icon: a grass block ──────────────────────────────────
img = canvas((146, 187, 227, 255))  # sky
textured(img, 2, 6, 13, 13, (121, 85, 58), 12, "dirt")       # dirt body
textured(img, 2, 4, 13, 6, (95, 159, 53), 10, "grass-top")   # grass cap
rnd = random.Random("grass-lip")
for x in range(2, 14):  # grass drips down the side
    if rnd.random() < 0.5:
        px(img, x, 7, jitter((95, 159, 53), 10, rnd))
save(img, "minecraft-grass-block.png")

# ── villager.png — the big-nosed merchant ────────────────────────────────────
img = canvas((62, 39, 35, 255))  # dim hut interior
textured(img, 4, 1, 11, 6, (188, 152, 98), 6, "head")        # head
rect(img, 4, 1, 11, 2, (94, 57, 42))                          # unibrow hair
px(img, 6, 4, (63, 45, 35)); px(img, 9, 4, (63, 45, 35))      # eyes
rect(img, 7, 4, 8, 8, (166, 123, 74))                         # THE nose
textured(img, 3, 7, 12, 14, (99, 74, 57), 8, "robe")          # brown robe
rect(img, 7, 9, 8, 14, (74, 53, 40))                          # robe seam
save(img, "villager.png")

# ── the-end.png — end stone island, obsidian pillar, ender eyes ─────────────
img = canvas((14, 10, 20, 255))  # void
rnd = random.Random("end-stars")
for _ in range(14):
    px(img, rnd.randrange(S), rnd.randrange(8), (120, 90, 160, 255))
textured(img, 2, 11, 13, 13, (221, 223, 165), 8, "endstone")  # island
rect(img, 10, 4, 12, 11, (25, 16, 34))                        # obsidian pillar
rect(img, 10, 3, 12, 3, (200, 120, 220))                      # crystal glow
px(img, 4, 8, (216, 108, 236)); px(img, 5, 8, (216, 108, 236))  # dragon eyes
save(img, "the-end.png")

# ── netherite.png — the ingot ────────────────────────────────────────────────
img = canvas((26, 16, 16, 255))
textured(img, 3, 6, 12, 10, (68, 58, 59), 5, "ingot")         # ingot body
rect(img, 3, 6, 12, 6, (110, 98, 100))                        # top sheen
px(img, 4, 7, (240, 200, 120)); px(img, 11, 9, (240, 200, 120))  # gold flecks
px(img, 8, 8, (240, 200, 120))
save(img, "netherite.png")

# ── mining.png — iron pickaxe striking stone ─────────────────────────────────
img = canvas((51, 51, 54, 255))  # cave dark
textured(img, 0, 10, 15, 15, (108, 108, 112), 9, "stone")     # stone floor
for i in range(5):                                             # wooden haft
    px(img, 4 + i, 10 - i, (146, 104, 60))
for x, y in [(7, 4), (8, 4), (9, 4), (10, 5), (11, 6), (6, 5), (5, 6)]:  # iron head
    px(img, x, y, (196, 196, 200))
px(img, 12, 8, (255, 240, 160)); px(img, 13, 9, (255, 240, 160))  # spark
save(img, "mining.png")

# ── enchanting.png — the enchanting table + floating book ───────────────────
img = canvas((30, 22, 42, 255))
rect(img, 4, 10, 11, 13, (30, 30, 34))                        # obsidian base
rect(img, 4, 9, 11, 9, (200, 60, 70))                         # red cloth top
rect(img, 6, 4, 9, 6, (120, 84, 48))                          # book
rect(img, 7, 4, 8, 6, (240, 234, 214))                        # pages
rnd = random.Random("glyphs")
for _ in range(8):                                             # galactic glyphs
    px(img, rnd.randrange(2, 14), rnd.randrange(1, 9), (170, 230, 190, 255))
save(img, "enchanting.png")

# ── diamond.png — the gem ────────────────────────────────────────────────────
img = canvas((40, 44, 52, 255))
gem = [(8, 3), (6, 4), (7, 4), (8, 4), (9, 4), (5, 5), (6, 5), (7, 5), (8, 5), (9, 5), (10, 5),
       (5, 6), (6, 6), (7, 6), (8, 6), (9, 6), (10, 6), (6, 7), (7, 7), (8, 7), (9, 7),
       (7, 8), (8, 8), (8, 9)]
for x, y in gem:
    px(img, x, y, (92, 219, 213))
for x, y in [(6, 4), (5, 5), (6, 5), (6, 6)]:                  # facet highlight
    px(img, x, y, (180, 245, 240))
for x, y in [(9, 6), (10, 6), (9, 7), (8, 8)]:                 # facet shadow
    px(img, x, y, (48, 160, 158))
save(img, "diamond.png")

# ── brewing.png — potion bottle over a brewing stand ────────────────────────
img = canvas((36, 26, 30, 255))
rect(img, 7, 2, 8, 3, (150, 120, 90))                          # cork
rect(img, 6, 4, 9, 5, (200, 220, 235))                         # bottle neck
rect(img, 5, 6, 10, 9, (200, 220, 235))                        # bottle body
rect(img, 6, 7, 9, 9, (214, 60, 110))                          # potion liquid
px(img, 6, 6, (255, 255, 255))                                 # glass glint
rect(img, 4, 12, 11, 12, (120, 120, 124))                      # stand bar
rect(img, 7, 10, 8, 13, (90, 90, 94))                          # stand rod
px(img, 3, 5, (255, 220, 120)); px(img, 12, 4, (255, 220, 120))  # bubbles
save(img, "brewing.png")

# ── the-nether.png — a nether portal ─────────────────────────────────────────
img = canvas((60, 24, 24, 255))  # netherrack red haze
textured(img, 0, 13, 15, 15, (96, 40, 40), 10, "netherrack")
rect(img, 4, 2, 11, 12, (25, 16, 34))                          # obsidian frame
rnd = random.Random("portal")
for y in range(3, 12):                                         # swirling purple
    for x in range(5, 11):
        px(img, x, y, jitter((120, 40, 190), 25, rnd))
save(img, "the-nether.png")

# ── crafting.png — the crafting table ────────────────────────────────────────
img = canvas((146, 187, 227, 255))
textured(img, 3, 5, 12, 13, (156, 122, 74), 8, "table-side")   # table body
rect(img, 3, 4, 12, 5, (182, 146, 90))                         # top surface
for x in (7, 8):                                               # 2x2 grid lines
    for y in range(4, 6):
        px(img, x, y, (110, 84, 52))
rect(img, 5, 7, 10, 10, (120, 90, 56))                         # saw + tools panel
px(img, 6, 8, (196, 196, 200)); px(img, 9, 9, (196, 196, 200))
save(img, "crafting.png")
