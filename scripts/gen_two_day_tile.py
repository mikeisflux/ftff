#!/usr/bin/env python3
"""Generate the 2-Day Pass ticket tile to match the existing tiles in
client/public/tickets/ (friday, saturday, sunday, digital, three_day).

Recipe matched from the existing art:
  - 800x320 canvas
  - diagonal two-color gradient (teal -> emerald for the 2-day variant)
  - soft central radial glow
  - faint diagonal hairlines
  - inset rounded-rect hairline border
  - heavy white centered title with a soft drop shadow
  - letter-spaced uppercase subtitle
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

W, H = 800, 320
OUT = "client/public/tickets/two_day.png"

FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"

# --- gradient colors (teal -> emerald), distinct from the other five ---
TOP_LEFT = (26, 165, 178)      # teal
BOTTOM_RIGHT = (43, 196, 132)  # emerald-green


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def build_gradient():
    # diagonal gradient: project each pixel onto the TL->BR axis
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = (xx / W + yy / H) / 2.0  # 0 at top-left, 1 at bottom-right
    t = np.clip(t, 0.0, 1.0)
    base = np.zeros((H, W, 3), dtype=np.float32)
    for i in range(3):
        base[..., i] = TOP_LEFT[i] + (BOTTOM_RIGHT[i] - TOP_LEFT[i]) * t
    return base


def add_radial_glow(arr):
    # brighten an elliptical region in the center
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W * 0.5, H * 0.46
    rx, ry = W * 0.46, H * 0.55
    d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    glow = np.clip(1.0 - d, 0.0, 1.0) ** 1.6
    glow = glow[..., None] * np.array([34, 36, 30], dtype=np.float32)  # additive light
    return np.clip(arr + glow, 0, 255)


def add_hairlines(img):
    # faint diagonal lines like the other tiles
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    spacing = 70
    col = (255, 255, 255, 16)
    for off in range(-H, W + H, spacing):
        d.line([(off, 0), (off + H, H)], fill=col, width=1)
    img.alpha_composite(overlay)


def add_border(img):
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    m = 12
    d.rounded_rectangle([m, m, W - m, H - m], radius=18,
                        outline=(255, 255, 255, 60), width=2)
    img.alpha_composite(overlay)


def draw_text_spaced(draw, text, font, cx, y, fill, spacing=0, anchor_mm=False):
    # measure total width with letter spacing
    widths = []
    for ch in text:
        bbox = font.getbbox(ch)
        widths.append(bbox[2] - bbox[0])
    total = sum(widths) + spacing * (len(text) - 1)
    x = cx - total / 2
    for ch, w in zip(text, widths):
        bbox = font.getbbox(ch)
        draw.text((x - bbox[0], y), ch, font=font, fill=fill)
        x += w + spacing
    return total


def main():
    arr = build_gradient()
    arr = add_radial_glow(arr)
    img = Image.fromarray(arr.astype(np.uint8), "RGB").convert("RGBA")

    add_hairlines(img)
    add_border(img)

    title_font = ImageFont.truetype(FONT_BOLD, 92)
    sub_font = ImageFont.truetype(FONT_BOLD, 26)

    title = "2-DAY PASS"
    subtitle = "ANY TWO DAYS · GREAT VALUE"

    cx = W / 2

    # --- title with soft drop shadow ---
    tb = title_font.getbbox(title)
    tw = tb[2] - tb[0]
    th = tb[3] - tb[1]
    tx = cx - tw / 2 - tb[0]
    ty = 92

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.text((tx, ty + 5), title, font=title_font, fill=(10, 40, 45, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(4))
    img.alpha_composite(shadow)

    d = ImageDraw.Draw(img)
    d.text((tx, ty), title, font=title_font, fill=(255, 255, 255, 255))

    # --- subtitle, letter-spaced ---
    sy = ty + th + 34
    draw_text_spaced(d, subtitle, sub_font, cx, sy,
                     (255, 255, 255, 235), spacing=6)

    img.convert("RGB").save(OUT)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
