/*
 * TalexFX — reusable, seek-safe motion helpers for TaleX HyperFrames scenes.
 *
 * pipeline/build.mjs inlines this file into every generated root (index.html and *.solo.html),
 * so scenes can call window.TalexFX.* from inside their <template>.
 *
 * Every visual state is a pure function of timeline time (no clocks, no Math.random):
 *  - `driver()` adds a linear proxy tween whose onUpdate receives the absolute local time.
 *  - randomness comes from `hash()` (deterministic) keyed by seed + index + quantized time.
 */
(function () {
  "use strict";

  const hash = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  /** Adds a linear driver tween on `tl` from `start` for `dur`; fn(t, progress) with t = timeline-local time. */
  function driver(tl, start, dur, fn) {
    const proxy = { v: 0 };
    tl.to(
      proxy,
      {
        v: 1,
        duration: dur,
        ease: "none",
        onUpdate() {
          fn(start + this.time(), this.progress());
        },
      },
      start,
    );
  }

  /** "$" + thousands comma. Deterministic (no locale APIs). */
  function formatNumber(value, prefix) {
    const n = Math.max(0, Math.floor(value + 1e-6));
    return (prefix || "") + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /**
   * Piecewise-linear re-count. segments: [{from, to, start, end}] (values already resolved).
   * Returns the displayed value at time t (constant rate inside each segment).
   */
  function counterValue(segments, t) {
    if (t <= segments[0].start) return segments[0].from;
    for (const s of segments) {
      if (t < s.end) {
        if (t < s.start) return s.from;
        return s.from + ((s.to - s.from) * (t - s.start)) / (s.end - s.start);
      }
    }
    return segments[segments.length - 1].to;
  }

  /**
   * Scrambled / glitch letter reveal ("Higgs i" -> "Higgsfield").
   * Builds per-letter slots whose width is the FINAL glyph (layout never jitters); a scramble glyph
   * sits on top until each letter's hashed resolve time, then the real letter flashes `flash` and
   * settles to `color`.
   */
  function glitchReveal(tl, el, text, opts) {
    const o = Object.assign(
      {
        start: 0,
        duration: 0.42,
        seed: 1,
        charset: "ABCDEFGHJKLMNPRSTUVWXYZ0123456789$#%&",
        step: 1 / 30,
        gap: 0.35,
        color: "#FFFFFF",
        flash: "#6FF000",
        scrambleColor: null,
      },
      opts || {},
    );
    el.textContent = "";
    el.style.whiteSpace = "nowrap";
    // optional per-word color: opts.highlight = ["97%", "DAILY"], opts.highlightColor
    const hl = new Array(text.length).fill(false);
    for (const w of o.highlight || []) {
      let from = 0, k;
      while ((k = text.indexOf(w, from)) >= 0) {
        for (let j = k; j < k + w.length; j++) hl[j] = true;
        from = k + w.length;
      }
    }
    const slots = [];
    [...text].forEach((ch, i) => {
      const c = document.createElement("span");
      c.style.cssText = "position:relative;display:inline-block;";
      c.setAttribute("data-layout-allow-overlap", "true"); // scramble glyph intentionally overlays its slot
      const f = document.createElement("span");
      f.textContent = ch === " " ? " " : ch;
      f.style.opacity = "0";
      const s = document.createElement("span");
      s.style.cssText =
        "position:absolute;left:0;right:0;top:0;text-align:center;opacity:0;pointer-events:none;";
      s.setAttribute("data-layout-allow-overlap", "true");
      c.appendChild(f);
      c.appendChild(s);
      el.appendChild(c);
      // Letters resolve roughly left→right with hashed jitter, like the reference.
      const order = i / Math.max(1, text.length - 1);
      const r = o.start + o.duration * (0.1 + 0.62 * order + 0.28 * hash(o.seed * 91 + i * 13));
      slots.push({ f, s, r, blank: ch === " ", base: hl[i] ? o.highlightColor || o.flash : o.color });
    });
    const render = (t) => {
      const step = Math.floor(t / o.step);
      slots.forEach((k, i) => {
        if (t < o.start) {
          k.f.style.opacity = "0";
          k.s.style.opacity = "0";
          return;
        }
        if (t < k.r) {
          k.f.style.opacity = "0";
          const gap = k.blank || hash(step * 31 + i * 7 + o.seed) < o.gap;
          k.s.style.opacity = gap ? "0" : "1";
          k.s.textContent = gap
            ? ""
            : o.charset[Math.floor(hash(step * 17 + i * 13 + o.seed * 3) * o.charset.length)];
          k.s.style.color = o.scrambleColor || o.flash;
          return;
        }
        k.s.style.opacity = "0";
        k.f.style.opacity = "1";
        k.f.style.color = t - k.r < 2.5 * o.step ? o.flash : k.base;
      });
    };
    render(-1);
    driver(tl, o.start - 0.05, o.duration + 0.25, render);
  }

  /** Radial spark burst: `count` thin streaks flying out from (cx, cy) inside `layer`. */
  function sparks(tl, layer, o) {
    const cfg = Object.assign(
      { at: 0, count: 12, cx: 0, cy: 0, r0: 60, r1: 420, len: 38, thick: 3, dur: 0.55, color: "#6FF000", seed: 1, glow: true },
      o,
    );
    for (let i = 0; i < cfg.count; i++) {
      const a = ((i + hash(cfg.seed * 7 + i) * 0.8) / cfg.count) * 360;
      const rad = (a * Math.PI) / 180;
      const dist = cfg.r1 * (0.55 + 0.45 * hash(cfg.seed * 13 + i * 3));
      const len = cfg.len * (0.6 + 0.8 * hash(cfg.seed * 17 + i * 5));
      const d = document.createElement("div");
      d.style.cssText = `position:absolute;left:${cfg.cx - len / 2}px;top:${cfg.cy - cfg.thick / 2}px;width:${len}px;height:${cfg.thick}px;border-radius:${cfg.thick}px;background:${cfg.color};opacity:0;${cfg.glow ? `box-shadow:0 0 10px ${cfg.color},0 0 22px ${cfg.color};` : ""}`;
      layer.appendChild(d);
      const delay = hash(cfg.seed * 23 + i * 11) * 0.06;
      const dur = cfg.dur * (0.75 + 0.5 * hash(cfg.seed * 29 + i * 7));
      tl.fromTo(
        d,
        { x: Math.cos(rad) * cfg.r0, y: Math.sin(rad) * cfg.r0, rotation: a, scaleX: 1.6, opacity: 1 },
        { x: Math.cos(rad) * dist, y: Math.sin(rad) * dist, rotation: a, scaleX: 0.2, opacity: 0, duration: dur, ease: "expo.out", immediateRender: false },
        cfg.at + delay,
      );
    }
  }

  /** Thin shockwave ring expanding from an existing ring element. */
  function ring(tl, el, o) {
    const c = Object.assign({ at: 0, from: 0.35, to: 4, dur: 0.6, opacity: 1 }, o);
    tl.fromTo(
      el,
      { scale: c.from, opacity: c.opacity },
      { scale: c.to, opacity: 0, duration: c.dur, ease: "expo.out", immediateRender: false },
      c.at,
    );
  }

  /** Deterministic decaying camera shake on `el` (x/y). */
  function shake(tl, el, o) {
    const c = Object.assign({ at: 0, amp: 3, dur: 0.35, step: 1 / 30, seed: 5 }, o);
    driver(tl, c.at - 0.001, c.dur, (t, p) => {
      if (p >= 1 || p <= 0) {
        el.style.translate = "0px 0px";
        return;
      }
      const step = Math.floor((t - c.at) / c.step);
      const a = c.amp * Math.pow(1 - p, 1.6);
      const x = (hash(step * 13 + c.seed) * 2 - 1) * a;
      const y = (hash(step * 29 + c.seed * 3) * 2 - 1) * a;
      el.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
    });
  }

  /** RGB split: show two colored copies offset ±px for `frames` frames, jittering per frame. */
  function rgbSplit(tl, copies, o) {
    const c = Object.assign({ at: 0, frames: 2, px: 12, fps: 30, seed: 3 }, o);
    const dur = c.frames / c.fps;
    driver(tl, c.at - 0.001, dur, (t, p) => {
      const live = p > 0 && p < 1;
      const step = Math.floor((t - c.at) * c.fps);
      copies.forEach((el, i) => {
        const dir = i === 0 ? -1 : 1;
        const j = 0.65 + 0.35 * hash(step * 7 + i * 3 + c.seed);
        el.style.opacity = live ? "0.9" : "0";
        el.style.translate = live ? `${(dir * c.px * j).toFixed(1)}px ${((hash(step + i) - 0.5) * c.px * 0.3).toFixed(1)}px` : "0px 0px";
      });
    });
  }

  /**
   * Speed streaks: `count` thin colored bars racing across `layer` in direction dir (-1 = to the left).
   * Seek-safe fromTo tweens; bars start hidden.
   */
  function streaks(tl, layer, o) {
    const c = Object.assign({ at: 0, span: 0.3, count: 14, dir: -1, colors: ["#7B61FF", "#6FF000"], W: 1440, H: 1080, seed: 1, yMin: 60, yMax: 1020 }, o);
    for (let i = 0; i < c.count; i++) {
      const d = document.createElement("div");
      const h = 2 + Math.round(hash(c.seed * 3 + i * 3 + 1) * 5);
      const w = 200 + hash(c.seed * 5 + i * 5 + 2) * 620;
      const y = c.yMin + hash(c.seed * 7 + i * 7 + 3) * (c.yMax - c.yMin);
      const col = c.colors[i % c.colors.length];
      d.style.cssText = `position:absolute;left:0;top:${y}px;width:${w}px;height:${h}px;border-radius:6px;background:${col};box-shadow:0 0 12px ${col};opacity:0;`;
      layer.appendChild(d);
      const s0 = c.at + hash(c.seed * 11 + i * 11 + 4) * c.span;
      const dur = 0.14 + hash(c.seed * 13 + i * 13 + 5) * 0.14;
      const from = c.dir < 0 ? c.W + 40 : -w - 40;
      const to = c.dir < 0 ? -w - 60 : c.W + 60;
      tl.fromTo(d, { x: from, opacity: 0.95 }, { x: to, opacity: 0.95, duration: dur, ease: "none", immediateRender: false }, s0);
    }
  }

  /**
   * Velocity-driven move with directional motion blur. fn(t) returns {x, y} (px) for the element;
   * the blur (an SVG feGaussianBlur `fe`) follows the per-frame speed along the dominant axis.
   * Uses CSS `translate` (never a GSAP transform) so it composes with GSAP scale/rotation.
   */
  function blurMove(tl, el, fe, o) {
    const c = Object.assign({ start: 0, end: 1, max: 60, k: 110, fn: () => ({ x: 0, y: 0 }) }, o);
    const apply = (t) => {
      const p = c.fn(t);
      el.style.translate = `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`;
      if (fe) {
        const a = c.fn(t - 1 / 60), b = c.fn(t + 1 / 60);
        const vx = Math.abs(b.x - a.x) * 30, vy = Math.abs(b.y - a.y) * 30;
        const bx = Math.min(c.max, vx / c.k), by = Math.min(c.max, vy / c.k);
        fe.setAttribute("stdDeviation", `${bx.toFixed(1)} ${by.toFixed(1)}`);
      }
    };
    apply(c.start);
    driver(tl, c.start, c.end - c.start, apply);
  }

  /** Eased value between a→b over [t0,t1] with a GSAP ease name (pure helper for driver maths). */
  function tween(t, t0, t1, a, b, easeName) {
    const p = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
    const e = easeName ? gsap.parseEase(easeName)(p) : p;
    return a + (b - a) * e;
  }

  window.TalexFX = { hash, driver, formatNumber, counterValue, glitchReveal, sparks, ring, shake, rgbSplit, streaks, blurMove, tween };
})();
