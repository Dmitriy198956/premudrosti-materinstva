# -*- coding: utf-8 -*-
"""Генерация карточек продуктов VK для проекта «Премудрости материнства»."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SIZE = 1080
ASSETS = "/home/user/inba4/assets"
OUT = "/home/user/inba4/vk-cards"
os.makedirs(OUT, exist_ok=True)

F_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
F_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def font(path, size):
    return ImageFont.truetype(path, size)

INK = "#3a2f2a"
MUTED = "#6b5b50"
GRAY = "#8a7a70"
CREAM = (255, 252, 247, 238)

ACCENTS = {
    "digital": (79, 143, 139),     # teal
    "live": (217, 122, 95),        # terracotta
    "mixed": (201, 151, 59),       # gold
    "free": (95, 156, 109),        # green
}

def wrap(text, f, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if f.getlength(t) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines

def pill(draw, xy, text, f, bg, fg, pad_x=22):
    w = f.getlength(text) + pad_x * 2
    h = int(f.size * 1.9)
    x0, y0 = xy
    draw.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=h // 2, fill=bg)
    draw.text((x0 + w / 2, y0 + h / 2 + 1), text, font=f, fill=fg, anchor="mm")
    return x0 + w, y0 + h

def card(bg_path, name, badge_text, badge_kind, title, sub, cta, price, out):
    img = Image.open(bg_path).convert("RGBA")
    # обрезка по центру до квадрата
    w, h = img.size
    s = min(w, h)
    img = img.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2)).resize((SIZE, SIZE), Image.LANCZOS)

    # лёгкое затемнение верхней части для бейджей
    shade = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for i in range(120):
        sd.line([(0, i), (SIZE, i)], fill=(60, 40, 30, int(90 * (1 - i / 120))))
    img = Image.alpha_composite(img, shade)

    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # бренд-плашка слева сверху
    f_brand = font(F_BOLD, 27)
    pill(d, (44, 40), "Премудрости материнства", f_brand, (255, 255, 255, 215), (180, 92, 73))

    # бейдж формата справа сверху
    f_badge = font(F_BOLD, 26)
    ac = ACCENTS[badge_kind]
    txt_w = f_badge.getlength(badge_text) + 44
    d.rounded_rectangle([SIZE - 44 - txt_w, 42, SIZE - 44, 42 + 54], radius=27, fill=ac + (238,))
    d.text((SIZE - 44 - txt_w / 2, 69 + 1), badge_text, font=f_badge, fill=(255, 255, 255, 255), anchor="mm")

    # панель с текстом
    PX0, PY0, PX1, PY1 = 52, 640, SIZE - 52, SIZE - 52
    pan = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pan)
    pd.rounded_rectangle([PX0, PY0, PX1, PY1], radius=34, fill=CREAM, outline=(240, 228, 214, 255), width=2)
    pan = pan.filter(ImageFilter.GaussianBlur(0.4))
    layer = Image.alpha_composite(layer, pan)
    d = ImageDraw.Draw(layer)

    cx = PX0 + 34
    cw = (PX1 - 34) - cx

    # подпись-бренд
    d.text((cx, PY0 + 26), "Елена Шуленина · консультант по ГВ · vk.com/ok_gv", font=font(F_REG, 24), fill=GRAY)

    # заголовок
    f_title = font(F_BOLD, 56)
    title_lines = wrap(title, f_title, cw)
    if len(title_lines) > 2:
        f_title = font(F_BOLD, 46)
        title_lines = wrap(title, f_title, cw)
    ty = PY0 + 64
    for ln in title_lines[:2]:
        d.text((cx, ty), ln, font=f_title, fill=INK)
        ty += int(f_title.size * 1.22)

    # подзаголовок
    f_sub = font(F_REG, 33)
    sub_lines = wrap(sub, f_sub, cw)
    if len(sub_lines) > 2:
        f_sub = font(F_REG, 30)
        sub_lines = wrap(sub, f_sub, cw)
    ty += 6
    for ln in sub_lines[:2]:
        d.text((cx, ty), ln, font=f_sub, fill=MUTED)
        ty += int(f_sub.size * 1.34)

    # разделитель
    ty += 12
    d.line([(cx, ty), (cx + 190, ty)], fill=ac + (255,), width=4)

    # строка: CTA слева + цена-плашка справа
    f_cta = font(F_REG, 27)
    cta_lines = wrap(cta, f_cta, cw - 330)
    cty = ty + 24
    for ln in cta_lines[:2]:
        d.text((cx, cty), ln, font=f_cta, fill=(77, 64, 56, 255))
        cty += int(f_cta.size * 1.45)

    f_price = font(F_BOLD, 44)
    pw = f_price.getlength(price) + 56
    ph = 76
    d.rounded_rectangle([PX1 - 34 - pw, PY1 - 34 - ph, PX1 - 34, PY1 - 34], radius=38, fill=ac + (255,))
    d.text((PX1 - 34 - pw / 2, PY1 - 34 - ph / 2 + 1), price, font=f_price, fill=(255, 255, 255, 255), anchor="mm")

    img = Image.alpha_composite(img, layer).convert("RGB")
    path = os.path.join(OUT, out)
    img.save(path, "PNG")
    print("saved", out)

cards = [
    ("bg-newborn.jpg", "gaid.png", "ЦИФРОВОЙ · PDF", "free",
     "Почему плачет новорождённый",
     "10 причин плача и что делать: шпаргалка для мам",
     "Напишите «ХОЧУ ГАЙД» — пришлю бесплатно", "БЕСПЛАТНО"),
    ("bg-breastfeeding.jpg", "shpargalki.png", "ЦИФРОВОЙ · PDF", "digital",
     "Шпаргалки по ГВ",
     "Прикладывание · позы · сцеживание · набор веса",
     "PDF на телефон — всегда под рукой", "490 ₽"),
    ("bg-online.jpg", "course.png", "ЦИФРОВОЙ · ВИДЕОКУРС", "digital",
     "Мягкий старт",
     "Первые 6 недель с малышом: 5 видеоуроков + шпаргалки + эфир",
     "На запуске ранняя цена — 990 ₽", "1990 ₽"),
    ("bg-newborn.jpg", "express.png", "ЖИВАЯ · ОНЛАЙН 30 МИН", "live",
     "Экспресс-консультация",
     "30 минут онлайн: разберём ваш главный вопрос по ГВ",
     "Подходит, если нужен быстрый ответ", "1500 ₽"),
    ("bg-breastfeeding.jpg", "online-consult.png", "ЖИВАЯ ВСТРЕЧА · ОНЛАЙН", "live",
     "Консультация по ГВ — онлайн",
     "60–90 минут: прикладывание, молоко, сон. План на 7 дней",
     "+ 7 дней сопровождения в чате", "3500 ₽"),
    ("bg-newborn.jpg", "viezd.png", "ЖИВАЯ ВСТРЕЧА · ВЫЕЗД", "live",
     "Консультация с выездом",
     "Челябинск: помощь у вас дома — прикладывание, уход, сон",
     "+ план действий и шпаргалка в подарок", "5000 ₽"),
    ("bg-picnic.jpg", "paket.png", "ЖИВОЙ + ЦИФРОВОЙ", "mixed",
     "Пакет «Спокойное ГВ»",
     "2 недели: консультация + чат 14 дней + мини-курс + шпаргалки",
     "Ценность 9500 ₽ — вы экономите 1600 ₽", "7900 ₽"),
    ("bg-picnic.jpg", "club.png", "ЦИФРОВОЙ · ПОДПИСКА", "digital",
     "Клуб «Премудрости материнства»",
     "Эфир с ответами раз в неделю + библиотека шпаргалок + чат мам",
     "Отмена в любой момент", "390 ₽/мес"),
    ("bg-online.jpg", "premium.png", "ЖИВОЙ + ЦИФРОВОЙ", "mixed",
     "С мамой от родов до года",
     "30 дней: 2 консультации + курс + связь каждый день + приоритет",
     "Для тех, кто хочет спокойно, с экспертом рядом", "15000 ₽"),
]

for bg, out, badge, kind, title, sub, cta, price in cards:
    card(os.path.join(ASSETS, bg), out, badge, kind, title, sub, cta, price, out)

# монтаж 3x3 для быстрого просмотра
cell = 1060
gap = 30
M = Image.new("RGB", (cell * 3 + gap * 4, cell * 3 + gap * 4), (250, 245, 239))
for i, c in enumerate([c[1] for c in cards]):
    im = Image.open(os.path.join(OUT, c)).resize((cell, cell), Image.LANCZOS)
    r, col = divmod(i, 3)
    M.paste(im, (gap + col * (cell + gap), gap + r * (cell + gap)))
mont = os.path.join(OUT, "montage.png")
M.save(mont)
print("saved", mont)
