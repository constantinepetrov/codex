# -*- coding: utf-8 -*-
"""Концепции B («Типографика») и C («Орбита»)."""
from build import T, URL, LEFT, RIGHT, names

# ---------------------------------------------------------------- B. Типографика
B_CSS = """
.gal { position:absolute; width: 760px; left: 300px; top: -40px; transform: rotate(-10deg); opacity: .6; }
.veilb { position:absolute; left:0; right:0; top:200px; height:300px; background: linear-gradient(180deg, rgba(255,255,255,0), #fff 55%); }
.wrap { position:absolute; inset:0; padding: 40px 56px 38px; display:flex; flex-direction:column; }
.top { display:flex; justify-content:space-between; align-items:center; }
.title { margin-top: 58px; font-weight:700; font-size: 124px; line-height:.8; letter-spacing:-6px; white-space:nowrap; margin-left:-6px; }
.title .b { color: var(--or); }
.rule { height: 3px; background: var(--ink); margin-top: 26px; }
.row { display:grid; grid-template-columns: 200px 1fr; gap: 26px; }
.k { font-size: 11.5px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color: var(--mute); padding-top: 6px; }
.greet { font-size: 28px; font-weight:700; letter-spacing:-.6px; line-height:1.15; white-space:nowrap; }
.intro { font-size: 16px; line-height: 1.45; margin-top: 8px; }
.facts { margin-top: 22px; display:grid; grid-template-columns: 200px 1fr; gap: 26px; align-items:end; }
.dates { font-size: 40px; font-weight: 700; letter-spacing:-1.2px; line-height:1; }
.dates small { display:block; font-size: 15px; letter-spacing:0; color: var(--mute); font-weight:400; margin-top: 8px; }
.place { font-size: 15px; line-height:1.4; }
.place b { display:block; font-size: 40px; letter-spacing:-.5px; line-height:1; margin-bottom: 8px; }
.band { margin: 24px -56px 0; background: var(--or); color:#fff; padding: 20px 56px 22px; display:grid; grid-template-columns: 200px 1fr; gap:26px; align-items:center; }
.band .k { color: rgba(255,255,255,.85); padding:0; }
.band .t { font-size: 27px; font-weight:700; line-height:1.15; letter-spacing:-.4px; }
.cols2 { margin-top: 22px; display:grid; grid-template-columns: 1fr 1fr; gap: 30px; }
.p { font-size: 13.5px; line-height:1.45; }
.p + .p { margin-top: 10px; }
.p .h { display:block; font-weight:700; font-size: 14px; margin-bottom: 3px; }
.p .h span { color: var(--or); }
.lead { font-size: 13.5px; color: var(--mute); line-height:1.35; }
.names { margin-top: 10px; display:grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(6, auto); grid-auto-flow: column; column-gap: 14px; }
.names li { font-size: 15.5px; font-weight:700; line-height:1.55; white-space:nowrap; }
.out { margin-top: 10px; font-size: 13.5px; line-height:1.45; }
.foot { margin-top:auto; display:flex; justify-content:space-between; align-items:flex-end; border-top: 1px solid #DADADA; padding-top: 18px; }
.sign { text-align:right; font-size: 13px; line-height:1.45; color: var(--mute); }
.sign b { color: var(--ink); font-size: 15px; display:block; }
"""

B_BODY = f"""
<img class="gal" src="assets/galaxy.png" alt="">
<div class="veilb"></div>
<div class="wrap">
  <div class="top"><img class="logo" src="assets/amplua-logo.png" alt="Амплуа"><span class="label">Приглашение спикеру</span></div>
  <h1 class="title">СВОЙ <span class="b">ПУТЬ</span></h1>
  <div class="rule"></div>
  <div class="row" style="margin-top:20px"><div class="k">Персонально</div>
    <div><div class="greet">{T['greet']}</div><p class="intro">{T['intro']}</p></div></div>
  <div class="facts">
    <div class="dates">30.11–<br>01.12<small>30 ноября – 1 декабря<br>2026 года</small></div>
    <div class="place"><b>МОСКВА</b>гостиница СтандАрт, Страстной бульвар, 2</div>
  </div>
  <div class="band"><div class="k">Ваш день</div><div class="t">Ваше выступление и&nbsp;награждение планируется 1&nbsp;декабря.</div></div>
  <div class="cols2">
    <div>
      <p class="p">{T['members']}</p>
      <p class="p"><span class="h"><span>30 ноября</span> {T['fs_title']}</span>{T['fs_text']}</p>
    </div>
    <div>
      <div class="lead">{T['spk_lead']}</div>
      <ul class="names">{names(LEFT)}{names(RIGHT)}</ul>
    </div>
  </div>
  <p class="out">{T['out1']} {T['out2']}</p>
  <div class="foot">
    <div><a class="cta" href="{URL}">Подробнее о мероприятии <span class="arr">→</span></a>
      <div class="url"><a href="{URL}">{URL}</a></div></div>
    <div class="sign">Готова ответить на все вопросы<b>Наталья Толстая</b>генеральный директор «Амплуа»</div>
  </div>
</div>
"""

# ---------------------------------------------------------------- C. Орбита
C_CSS = """
.bg { position:absolute; inset:0; background: radial-gradient(90% 60% at 50% 18%, #FFF4EC 0, #fff 70%); }
.gal { position:absolute; width: 1500px; left: -300px; top: 560px; transform: rotate(32deg); opacity: .16; }
.galtop { position:absolute; width: 860px; left: -33px; top: 60px; opacity: .75; }
.veilc { position:absolute; left:0; right:0; top:300px; height:230px; background: radial-gradient(60% 55% at 50% 60%, rgba(255,255,255,.95), rgba(255,255,255,0)); }
.wrap { position:absolute; inset:0; padding: 40px 64px 38px; display:flex; flex-direction:column; align-items:center; text-align:center; }
.logo { height: 32px; }
.label { margin-top: 30px; }
.title { margin-top: 14px; font-weight:700; font-size: 96px; line-height:.9; letter-spacing:-3px; }
.title .a { font-weight:400; letter-spacing: -1px; }
.title .b { color: var(--or); }
.greet { margin-top: 150px; font-size: 28px; font-weight:700; }
.intro { margin-top: 10px; font-size: 16px; line-height:1.45; width: 590px; }
.when { margin-top: 22px; display:flex; align-items:stretch; }
.when > div { padding: 0 26px; }
.when > div + div { border-left: 1.5px solid var(--or); }
.when .big { font-size: 25px; font-weight:700; line-height:1.15; }
.when .sm { font-size: 14px; color: var(--mute); margin-top: 4px; line-height:1.35; }
.members { margin-top: 18px; font-size: 14px; line-height:1.45; width: 600px; }
.hi { margin-top: 20px; font-size: 26px; font-weight:700; line-height:1.2; letter-spacing:-.3px; }
.hi em { font-style:normal; color: var(--or); }
.star { color: var(--or); font-size: 14px; letter-spacing: .6em; margin-top: 16px; }
.grid { margin-top: 16px; display:grid; grid-template-columns: 1fr 1fr; gap: 34px; text-align:left; width: 100%; }
.p { font-size: 13.5px; line-height:1.45; }
.p .h { display:block; font-weight:700; font-size: 14px; margin-bottom: 3px; }
.p .h span { color: var(--or); }
.lead { font-size: 13.5px; color: var(--mute); }
.names { margin-top: 8px; display:grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(6, auto); grid-auto-flow: column; column-gap: 12px; }
.names li { font-size: 15.5px; font-weight:700; line-height:1.55; white-space:nowrap; }
.out { margin-top: 12px; font-size: 13.5px; line-height:1.45; width: 620px; }
.foot { margin-top:auto; display:flex; flex-direction:column; align-items:center; }
.url { margin-top: 8px; }
.sign { margin-top: 14px; font-size: 13px; color: var(--mute); line-height:1.45; }
.sign b { color: var(--ink); }
"""

C_BODY = f"""
<div class="bg"></div>
<img class="gal" src="assets/galaxy.png" alt="">
<img class="galtop" src="assets/galaxy.png" alt="">
<div class="veilc"></div>
<div class="wrap">
  <img class="logo" src="assets/amplua-logo.png" alt="Амплуа">
  <div class="label">Приглашение спикеру</div>
  <h1 class="title"><span class="a">СВОЙ</span> <span class="b">ПУТЬ</span></h1>
  <div class="greet">{T['greet']}</div>
  <p class="intro">{T['intro']}</p>
  <div class="when">
    <div><div class="big">30 ноября – 1 декабря</div><div class="sm">2026 года</div></div>
    <div><div class="big">МОСКВА</div><div class="sm">гостиница СтандАрт<br>Страстной бульвар, 2</div></div>
  </div>
  <p class="members">{T['members']}</p>
  <div class="hi">Ваше выступление и&nbsp;награждение<br>планируется <em>1&nbsp;декабря.</em></div>
  <div class="grid">
    <div><p class="p"><span class="h"><span>30 ноября</span> {T['fs_title']}</span>{T['fs_text']}</p></div>
    <div><div class="lead">{T['spk_lead']}</div><ul class="names">{names(LEFT)}{names(RIGHT)}</ul></div>
  </div>
  <p class="out">{T['out1']} {T['out2']}</p>
  <div class="foot">
    <a class="cta" href="{URL}">Подробнее о мероприятии <span class="arr">→</span></a>
    <div class="url"><a href="{URL}">{URL}</a></div>
    <div class="sign">Готова ответить на все вопросы<br><b>Наталья Толстая</b> — генеральный директор «Амплуа»</div>
  </div>
</div>
"""

CONCEPTS = {"B-tipografika": (B_CSS, B_BODY), "C-orbita": (C_CSS, C_BODY)}
