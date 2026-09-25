# -*- coding: utf-8 -*-
"""Генератор концепций приглашения «СВОЙ ПУТЬ» (A4, HTML -> PDF через Chromium)."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
URL = "https://amplua.ru/events/svoi-put"

LEFT = ["Марк Кукушкин", "Филипп Гузенюк", "Евгений Мачнев",
        "Любовь Гвоздилина", "Андрей Теслинов", "Наталья Толстая"]
RIGHT = ["Владимир Соловьёв", "Юлия Пшеницына", "Александр Сорокин",
         "Юлия Ужакина", "Марк Розин", "Айрат Хафизов"]

T = dict(
    greet="Уважаемый Андрей Анатольевич!",
    intro="Приглашаем Вас стать спикером уникального комплексного мероприятия: "
          "форсайта, конференции и&nbsp;премии в&nbsp;области управления персоналом «СВОЙ&nbsp;ПУТЬ».",
    members="<b>Участники:</b> Руководители служб персонала и&nbsp;лица, принимающие решения "
            "в&nbsp;разработке стратегии развития персонала организации.",
    fs_title="Форсайт – сессия. Ведущий Игорь Браиловский.",
    fs_text="Участники Форсайта с&nbsp;помощью своих данных и&nbsp;опыта приглашённых экспертов будут "
            "прогнозировать развитие отрасли управления персоналом на&nbsp;ближайшие годы. "
            "В&nbsp;результате работы у&nbsp;них будут сценарии и&nbsp;прогнозы на&nbsp;1&#8209;3&#8209;5&nbsp;лет.",
    spk_lead="Среди спикеров конференции признанные лидеры HR-рынка:",
    out1="Они поделятся своей экспертизой и&nbsp;видением текущей ситуации. "
         "И&nbsp;получат награды за&nbsp;приверженность своим темам и&nbsp;проектам.",
    out2="Участники смогут задать каждому спикеру вопросы в&nbsp;формате Open&nbsp;Space "
         "и&nbsp;обсудить свои впечатления с&nbsp;коллегами.",
)


def names(lst):
    return "".join(f"<li>{n}</li>" for n in lst)


BASE_CSS = """
@page { size: 210mm 297mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
:root { --or:#F26522; --ink:#1E1E1F; --mute:#5B5B5E; --warm:#FFF7F1; }
html, body { width: 210mm; height: 297mm; background:#fff; }
body { font-family: Arial, "Liberation Sans", Helvetica, sans-serif; color: var(--ink);
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { position: relative; width: 794px; height: 1123px; overflow: hidden; background: #fff; }
b { font-weight: 700; }
ul { list-style: none; }
a { color: inherit; text-decoration: none; }
.logo { display:block; height: 34px; }
.label { font-size: 11.5px; font-weight: 700; letter-spacing: .22em; color: var(--or); text-transform: uppercase; }
.cta { display:inline-flex; align-items:center; gap:14px; background: var(--or); color:#fff;
       font-weight:700; font-size: 18px; padding: 15px 26px 15px 28px; border-radius: 999px; }
.cta .arr { font-size: 20px; }
.url { font-size: 13px; color: var(--mute); margin-top: 9px; }
.url a { color: var(--ink); border-bottom: 1px solid rgba(242,101,34,.55); }
"""


def page(css, body):
    return f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>СВОЙ ПУТЬ — приглашение спикеру</title>
<style>{BASE_CSS}{css}</style></head><body><div class="page">{body}</div></body></html>"""


# ---------------------------------------------------------------- A. Созвездие
A_CSS = """
.gal { position:absolute; width: 1400px; left: 110px; top: 110px; transform: rotate(-62deg); opacity: .82; }
.glow { position:absolute; right:-260px; top: -60px; width: 760px; height: 1240px;
        background: radial-gradient(closest-side, rgba(242,101,34,.13), rgba(242,101,34,0)); }
.veil2 { position:absolute; left:0; right:0; bottom:0; height:170px; background: linear-gradient(0deg, rgba(255,255,255,.92) 35%, rgba(255,255,255,0)); }
.veil { position:absolute; left:0; top:0; bottom:0; width: 794px;
        background: linear-gradient(90deg, rgba(255,255,255,.97) 0, rgba(255,255,255,.93) 56%, rgba(255,255,255,0) 80%); }
.wrap { position:absolute; inset: 0; padding: 40px 56px 38px 56px; display:flex; flex-direction:column; }
.top { display:flex; justify-content:space-between; align-items:center; }
.title { margin-top: 12px; font-weight:700; font-size: 104px; line-height: .86; letter-spacing: -4px; }
.title span { display:block; }
.title .b { color: var(--or); }
.greet { margin-top: 24px; font-size: 27px; font-weight:700; letter-spacing:-.3px; }
.intro { margin-top: 9px; font-size: 15.5px; line-height: 1.45; width: 600px; }
.when { margin-top: 18px; display:flex; width: 540px; border-top: 2px solid var(--ink); padding-top: 13px; }
.when .d { width: 270px; font-size: 25px; font-weight:700; line-height:1.1; letter-spacing:-.4px; }
.when .d small { display:block; font-size: 14px; font-weight:400; color:var(--mute); margin-top:5px; letter-spacing:0; }
.when .p { font-size: 14px; line-height: 1.4; }
.when .p .city { font-size: 25px; font-weight:700; letter-spacing: .03em; line-height:1.1; display:block; margin-bottom:5px; }
.members { margin-top: 14px; font-size: 14px; line-height:1.45; width: 560px; }
.prog { margin-top: 16px; display:grid; grid-template-columns: 350px 250px; gap: 28px; }
.day { font-size: 12px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color: var(--or); margin-bottom: 7px; }
.fs { font-size: 13.5px; line-height: 1.45; }
.fs .k { font-weight:700; display:block; margin-bottom: 3px; }
.hi { border-left: 5px solid var(--or); padding: 2px 0 2px 16px;
      font-size: 23px; font-weight: 700; line-height: 1.2; letter-spacing:-.3px; }
.hi em { font-style: normal; color: var(--or); }
.spk { margin-top: 18px; }
.spk .lead { font-size: 14px; color: var(--mute); }
.cols { margin-top: 9px; display:flex; gap: 30px; }
.cols ul li { font-size: 17px; font-weight:700; line-height: 1.42; width: 230px; }
.out { margin-top: 10px; width: 600px; font-size: 13.5px; line-height: 1.45; }
.out p + p { margin-top: 5px; }
.foot { margin-top: auto; display:flex; align-items:flex-end; justify-content:space-between; }
.sign { text-align:right; font-size: 13px; line-height:1.45; color: var(--mute); }
.sign b { color: var(--ink); font-size: 15px; display:block; }
"""

A_BODY = f"""
<div class="glow"></div>
<img class="gal" src="assets/galaxy.png" alt="">
<div class="veil"></div><div class="veil2"></div>
<div class="wrap">
  <div class="top"><img class="logo" src="assets/amplua-logo.png" alt="Амплуа"></div>
  <div class="label" style="margin-top:30px">Приглашение спикеру</div>
  <h1 class="title"><span>СВОЙ</span><span class="b">ПУТЬ</span></h1>
  <div class="greet">{T['greet']}</div>
  <p class="intro">{T['intro']}</p>
  <div class="when">
    <div class="d">30 ноября –<br>1 декабря<small>2026 года</small></div>
    <div class="p"><span class="city">МОСКВА</span>гостиница СтандАрт<br>Страстной бульвар, 2</div>
  </div>
  <p class="members">{T['members']}</p>
  <div class="prog">
    <div><div class="day">30 ноября</div><p class="fs"><span class="k">{T['fs_title']}</span>{T['fs_text']}</p></div>
    <div><div class="day">1 декабря</div><div class="hi">Ваше выступление и&nbsp;награждение планируется <em>1&nbsp;декабря.</em></div></div>
  </div>
  <div class="spk"><div class="lead">{T['spk_lead']}</div>
    <div class="cols"><ul>{names(LEFT)}</ul><ul>{names(RIGHT)}</ul></div></div>
  <div class="out"><p>{T['out1']}</p><p>{T['out2']}</p></div>
  <div class="foot">
    <div><a class="cta" href="{URL}">Подробнее о мероприятии <span class="arr">→</span></a>
      <div class="url"><a href="{URL}">{URL}</a></div></div>
    <div class="sign">Готова ответить на все вопросы<b>Наталья Толстая</b>генеральный директор «Амплуа»</div>
  </div>
</div>
"""

CONCEPTS = {"A-sozvezdie": (A_CSS, A_BODY)}

if __name__ == "__main__":
    import sys
    sys.path.insert(0, HERE)
    try:
        import extra  # noqa: F401  (концепции B/C)
        CONCEPTS.update(extra.CONCEPTS)
    except ImportError:
        pass
    for name, (css, body) in CONCEPTS.items():
        with open(os.path.join(HERE, f"{name}.html"), "w", encoding="utf-8") as f:
            f.write(page(css, body))
        print("wrote", name)
