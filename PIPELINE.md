# TaleX video pipeline

A free, reusable production pipeline for short TaleX announcement videos:
**HyperFrames** (HTML → video, rendered locally in headless Chrome) for picture, the
**ElevenLabs** REST API for sound, **ffmpeg** for the mix. Quality bar:
`reference/higgsfield/` (read `STYLE_NOTES.md` before designing anything new).

```
brief ──▶ shotlist ──▶ scenes ──▶ review ──▶ audio (cues → sfx → music → mix) ──▶ render
brief.md   shotlist.yaml  scenes/*.html  review/*.png   audio_cues.yaml, audio/…          output/*.mp4
```

## Layout

```
brand/
  tokens.json            colors, fonts, easing, glow/blur, RGB split, shake, pill-badge spec, glitch reveal
  talex-logo.svg         wordmark (+ the provided TaleX_LOGO_MAIN_{BLACK,WHITE}.svg)
  talex-x-mark*.svg      the X mark (two-tone / mono), cut from the wordmark
  fonts/                 Archivo variable (OFL) — heavy grotesk, tabular figures
audio/
  sfx/prompts.yaml       the brand sound library: one prompt + duration per sound
  sfx/*.mp3              generated sounds
  music/                 generated tracks + their composition plans (*.json)
pipeline/                the stages (node, run via npm scripts)
  runtime/talex-fx.js    seek-safe FX used by every scene (count-up, glitch reveal, sparks, rings, shake, RGB split)
  runtime/vendor/        GSAP (vendored: the render browser never depends on a CDN)
reference/higgsfield/    quality reference
videos/<yyyy-mm_slug>/
  brief.md               goal, tone, and the ```yaml copy``` block — the ONLY place numbers/copy live
  shotlist.yaml          one entry per shot: timing, background, visual, motion, camera, text keys, sfx cues, transition_out
  scenes/<ID>_<name>.html one HyperFrames sub-composition per shot (reads copy + timing, never hardcodes them)
  index.html             GENERATED root: one slot per shot + the mix (npm run build)
  audio_cues.yaml        GENERATED cue sheet, every sound event in ms/frames (npm run cues)
  assets/                GENERATED copies of fonts/marks/GSAP + assets/audio/mix.wav (+ mix.report.json)
  review/                contact sheets per shot (committed PNGs)
  output/                rendered MP4s
```

Scenes get their data from `window.__TALEX__` (injected into `index.html` by `pipeline/build.mjs`):
`copy` (brief.md), `shots.<ID>` (shotlist.yaml), `tokens` (brand/tokens.json). Colors are also
CSS variables (`--tx-green`, `--tx-violet`, …).

## Commands

| Command | Stage |
| --- | --- |
| `npm run build` | shotlist + brief + tokens → `index.html`, copies brand assets into the video |
| `npm run review [-- S02]` | snapshots the assembled video at each shot's `review_at` times → `review/<ID>_<name>_contact.png` |
| `npm run cues` | shotlist sfx cues → `audio_cues.yaml` (run after the picture is locked) |
| `npm run sfx [-- name …]` | generate missing sounds (or the named ones) from `audio/sfx/prompts.yaml` |
| `npm run sfx -- riser --takes 4` | generate candidates in `audio/sfx/_takes/` to compare |
| `npm run music -- audio/music/<plan>.json [--takes N]` | generate music from a composition plan |
| `npm run mix` | `audio_cues.yaml` → `assets/audio/mix.wav` at −14 LUFS / −1 dBTP |
| `npm run render [-- S01]` | solo shot MP4s + the combined cut → `output/` |
| `npm run check` | rebuild, validate shotlist ↔ sound library ↔ cue sheet, `hyperframes check` (lint, runtime, layout, contrast) |
| `npm run preview` | open HyperFrames Studio on the video |

All commands default to the newest `videos/*`; pick another with `VIDEO=2026-11_x npm run …` or pass the dir.

## Stages

1. **Brief** — `videos/<slug>/brief.md`. Goal, tone, and the `yaml copy` block (numbers, labels,
   headlines, captions). Nothing on screen may be typed anywhere else.
2. **Shotlist** — `shotlist.yaml`, written before any scene. All times are global seconds (30 fps).
   Each shot: `id, start, end, background, visual, motion, camera, text (brief keys), sfx (cue, sound,
   at, gain_db), transition_out`, plus shot-specific parameters the scene reads (counter segments,
   bursts, arrow timings, pill geometry…). `tail` lets a shot keep rendering under the next one for a
   transition. `review_at` picks the contact-sheet frames.
3. **Scenes** — `scenes/<ID>_<name>.html`, one HyperFrames sub-composition per shot, using
   `brand/tokens.json` and `TalexFX`. Every frame is a pure function of timeline time (seekable,
   deterministic). `npm run build` wires them into `index.html` from the shotlist.
4. **Review** — `npm run review`, look at `review/*.png`, iterate. `npm run check` must pass.
5. **Audio** (only after the picture is locked)
   - `npm run cues` → `audio_cues.yaml` (every event with ms + frame).
   - `npm run sfx` → sounds from `audio/sfx/prompts.yaml` (ElevenLabs Sound Effects API, exact durations).
   - `npm run music -- <plan>.json` → track from a composition plan whose chunks are cut to the
     timeline (the drop chunk starts on the hit). The measured drop is stored back in the plan and
     the mix aligns it.
   - `npm run mix` → places every sound at its cue, ducks the music under hits, fades the music out,
     normalizes to −14 LUFS with a −1 dBTP limiter. Settings: `shotlist.yaml → video.mix`.
   - `npm run build` again so `index.html` includes the mix.
6. **Render** — `npm run render`. Blur-heavy scenes render with `--workers 1` (`tokens.blur.render_workers`)
   because multi-worker renders can make animated blur flicker.

## Asking for edits

Every request names **one** thing, and only that thing changes.

**Edit one shot** — *"edit S02: slower fill, caption 0.3s later"*
1. Change only S02's block in `shotlist.yaml` (timing / params) and/or `scenes/S02_treasury.html` (look).
2. `npm run review -- S02` → check `review/S02_treasury_contact.png`.
3. If timing moved: `npm run cues && npm run mix && npm run build`.
4. `npm run render -- S02` (solo) and `npm run render` (combined). Other shots are untouched.

**Change copy or a number** — *"number is 4,210 now"* → edit `brief.md`'s yaml block only, then
`npm run build && npm run render`. Timings in the shotlist stay unless the count needs re-pacing.

**Regenerate one sound** — *"regenerate impact_big: heavier"*
1. Edit only `sounds.impact_big.prompt` in `audio/sfx/prompts.yaml` (e.g. add "heavier, longer sub tail").
2. `npm run sfx -- impact_big` (or `-- impact_big --takes 3` and copy the best take over `audio/sfx/impact_big.mp3`).
3. `npm run mix && npm run build && npm run render`. Nothing else is regenerated.

**Move / re-level one sound** — *"whoosh 2 frames earlier, quieter"* → edit that cue's `at` /
`gain_db` in `shotlist.yaml`, then `npm run cues && npm run mix && npm run build && npm run render`.

**Change the music** — edit the chunk styles / text in `audio/music/composition_plan_*.json`, then
`npm run music -- <plan> --takes 3`, pick one, `npm run mix`.

**New video** — `npx hyperframes init videos/<yyyy-mm_slug> --non-interactive --example=blank`,
set `hyperframes.json` paths to `scenes`, then write `brief.md` → `shotlist.yaml` → scenes, and run the
stages above. Reuse `brand/`, `pipeline/`, `audio/sfx/` as they are.

## Environment notes

- Checks: `npx hyperframes doctor` (needs Chrome headless shell: `npx hyperframes browser ensure`, and ffmpeg).
- ElevenLabs: in Claude Code cloud sessions the egress proxy injects auth for `api.elevenlabs.io`; locally
  set `ELEVENLABS_API_KEY`. The client (`pipeline/elevenlabs.mjs`) uses curl, so it honors `HTTPS_PROXY`.
- **Music API needs a paid ElevenLabs plan** (HTTP 402 on free). `pipeline/music.mjs` then falls back
  automatically to the `sfx-sections` engine: each composition-plan chunk is generated with the Sound
  Effects API at its exact duration and the chunks are joined, so section boundaries stay exact. With a
  paid plan the same plan file goes through the real Music API (`music_v2_5`) unchanged.
- HyperFrames catalog BGM needs a HeyGen CLI sign-in (`heygen auth login`); the bundled 19 SFX work offline.
