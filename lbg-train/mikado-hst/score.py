#!/usr/bin/env python3
"""Звук для тура: синтез на стандартной библиотеке. Моменты берутся из той же шкалы времени, что и кадры (FP в main.js)."""
import math, random, struct, sys, wave

SR = 48000
DUR = 24.0
N = int(SR * DUR)
random.seed(7)
L = [0.0] * N
R = [0.0] * N

def add(t0, dur, fn, gain=1.0, pan=0.0):
    i0 = int(t0 * SR)
    n = int(dur * SR)
    gl, gr = gain * (1 - max(0, pan)), gain * (1 + min(0, pan))
    for k in range(n):
        i = i0 + k
        if i >= N: break
        v = fn(k / SR)
        L[i] += v * gl
        R[i] += v * gr

def clank(freq, decay, noise=0.35):
    return lambda t: math.exp(-t * decay) * (math.sin(2 * math.pi * freq * t) * 0.7 + math.sin(2 * math.pi * freq * 2.76 * t) * 0.3 + noise * (random.random() * 2 - 1))

def thud(freq, decay):
    return lambda t: math.exp(-t * decay) * math.sin(2 * math.pi * freq * (1 - 0.5 * min(t * 6, 1)) * t)

def whoosh(dur, f0, f1):
    st = {'y': 0.0}
    def fn(t):
        a = math.sin(math.pi * t / dur) ** 2
        f = f0 + (f1 - f0) * t / dur
        c = math.exp(-2 * math.pi * f / SR)
        st['y'] = c * st['y'] + (1 - c) * (random.random() * 2 - 1)
        return st['y'] * a * 6
    return fn

# 1. паровоз стоит и работает: низкий гул и шипение
add(0.0, 2.8, lambda t: 0.10 * math.sin(2 * math.pi * 55 * t) * min(t * 2, 1), 1.0)
for i in range(6):
    add(0.2 + i * 0.4, 0.25, lambda t: 0.25 * (random.random() * 2 - 1) * math.exp(-t * 12), 0.5)
# 2. раскрытие и складывание: щелчки и удары, всё чаще
for t in (2.6, 3.0, 3.3, 3.55, 3.8, 4.0, 4.2, 4.4, 4.55):
    add(t, 0.5, clank(random.choice([420, 520, 640, 760]), 9), 0.45, random.uniform(-0.7, 0.7))
for t in (4.8, 5.2, 5.5, 5.8, 6.1, 6.4, 6.7):
    add(t, 0.7, thud(random.choice([55, 62, 70]), 7), 0.8)
add(4.5, 2.6, whoosh(2.6, 400, 3000), 0.5)
# 3. сжатая масса: низкий гул и дрожь
add(7.0, 1.6, lambda t: 0.22 * math.sin(2 * math.pi * (46 + 6 * math.sin(t * 22)) * t) * math.sin(math.pi * t / 1.6), 1.0)
# 4. раскрытие в вагоны: размах и посадка
add(8.2, 3.0, whoosh(3.0, 300, 4500), 0.7)
for t in (9.0, 9.5, 10.0, 10.4, 10.9, 11.3, 11.8, 12.2, 12.8, 13.3, 13.9, 14.5, 15.0, 15.6, 16.2):
    add(t, 0.6, clank(random.choice([300, 380, 470, 590, 700]), 8), 0.4, random.uniform(-0.8, 0.8))
for t in (10.2, 12.0, 13.6, 15.2, 16.6):
    add(t, 0.8, thud(random.choice([48, 54, 60]), 6), 0.8)
add(16.4, 2.4, whoosh(2.4, 600, 6000), 0.6)
# 5. замки и разгон: удар, затем нарастающий гул и стук стыков
add(17.2, 1.2, thud(40, 4), 1.0)
add(17.2, 0.8, clank(900, 10, 0.2), 0.5)
def spd(t):
    x = min(max((t - 17.6) / 2.0, 0), 1)
    return x * x * (3 - 2 * x)
add(17.6, 6.4, lambda t: 0.16 * math.sin(2 * math.pi * (90 + 190 * spd(17.6 + t)) * t) * min(t * 2, 1), 1.0)
ph = 0.0
for k in range(int(17.6 * SR), N):
    s = spd(k / SR)
    ph += s * 9.0 / SR * 6  # стыки: частота растёт со скоростью
    if int(ph) != int(ph - s * 9.0 / SR * 6):
        for j in range(int(0.04 * SR)):
            if k + j < N:
                v = 0.22 * math.exp(-j / SR * 90) * (random.random() * 2 - 1)
                L[k + j] += v; R[k + j] += v
# 6. хвост
fade = int(0.8 * SR)
for i in range(N):
    if i > N - fade:
        g = (N - i) / fade
        L[i] *= g; R[i] *= g
peak = max(max(abs(x) for x in L), max(abs(x) for x in R)) or 1.0
out = sys.argv[1] if len(sys.argv) > 1 else 'score.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<hh', int(L[i] / peak * 0.8 * 32767), int(R[i] / peak * 0.8 * 32767)) for i in range(N)))
print('score', out)
