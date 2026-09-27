#!/usr/bin/env python3
"""Synthesize the few brand sounds that no library covers. Deterministic (fixed seeds).

usage: python3 pipeline/synth_sfx.py            → audio/sfx/synth/*.wav

  liquid_swell_soft  1.4 s  soft liquid fill: low-passed noise swell that opens up + rising bubble blips
  glitch_tick_soft   0.22 s tiny clean data ticks for scrambled-letter reveals
"""
import os
import wave

import numpy as np

SR = 48000
OUT = os.path.join(os.path.dirname(__file__), "..", "audio", "sfx", "synth")


def write(name, x):
    os.makedirs(OUT, exist_ok=True)
    x = np.clip(x / (np.abs(x).max() + 1e-9) * 0.7, -1, 1)  # peak −3 dBFS, the mix sets the level
    st = np.stack([x, np.roll(x, 7)], 1)  # hint of width
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((st * 32767).astype(np.int16).tobytes())
    print(f"synth {name}: {len(x) / SR:.2f}s")


def onepole_lp(x, fc):
    """One-pole low-pass with a per-sample cutoff array (Hz)."""
    y = np.zeros_like(x)
    a = np.exp(-2 * np.pi * np.asarray(fc) / SR) * np.ones_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def liquid_swell_soft(dur=1.4, seed=7):
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    p = t / dur
    # body: noise through a low-pass that opens from 250 Hz to 1.6 kHz (the pour), swell envelope
    body = onepole_lp(onepole_lp(rng.standard_normal(n), 250 + 1350 * p**1.5), 250 + 1350 * p**1.5)
    env = np.sin(np.pi * np.clip(p, 0, 1)) ** 1.3 * (0.35 + 0.65 * p)
    x = body * env * 0.9
    # bubbles: short upward sine chirps, density and pitch rising with the fill
    k = 0
    tb = 0.05
    while tb < dur - 0.08:
        f0 = 380 + 700 * (tb / dur) + rng.uniform(-60, 120)
        L = rng.uniform(0.018, 0.045)
        m = int(L * SR)
        tt = np.arange(m) / SR
        f = f0 * (1 + 1.6 * tt / L)  # upward chirp = bubble
        blip = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / (L * 0.35)) * rng.uniform(0.25, 0.6)
        s = int(tb * SR)
        x[s : s + m] += blip[: max(0, min(m, n - s))] * (0.4 + 0.6 * np.sin(np.pi * tb / dur))
        tb += rng.uniform(0.03, 0.11) * (1.2 - 0.6 * tb / dur)
        k += 1
    fade = np.minimum(1, np.minimum(t / 0.02, (dur - t) / 0.15))
    return x * fade


def glitch_tick_soft(dur=0.22, seed=3):
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    x = np.zeros(n)
    for tk in [0.0, 0.035, 0.06, 0.105, 0.14, 0.18]:
        m = int(rng.uniform(0.0015, 0.004) * SR)
        s = int(tk * SR)
        burst = rng.standard_normal(m)
        burst = np.diff(np.concatenate([[0], burst]))  # high-passed click
        burst = np.round(burst * 6) / 6  # light bit-crush = "digital"
        x[s : s + m] += burst * np.exp(-np.arange(m) / (m * 0.4)) * rng.uniform(0.4, 1.0)
    return x


if __name__ == "__main__":
    write("liquid_swell_soft", liquid_swell_soft())
    write("glitch_tick_soft", glitch_tick_soft())
