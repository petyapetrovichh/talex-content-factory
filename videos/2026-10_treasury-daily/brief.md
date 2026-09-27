# Brief — 2026-10 Treasury Daily

## Goal

A ≈18s announcement for X, cut to `audio/music/track.mp3`:

1. This week's revenue injected into $X, as a big bursting count-up.
2. 100% of revenue goes into the $X Treasury.
3. On the drop: "one more thing" — the community voted (97% daily), so injections go from ×1 to ×7
   per week: **daily** revenue injections into $X.
4. The link, then the TaleX logo to the end of the track.

The quality bar is the Higgsfield "$1B" milestone video (`reference/higgsfield/`, `STYLE_NOTES.md`).

## Tone

Confident, numbers-forward, premium. No price predictions, no promises. Every text stays on screen
long enough to read (≥ ~1.2s for a short line, ~2s for a long caption).

## Facts / on-screen copy

This YAML block is the **only** place numbers and on-screen copy live. Scenes read it through
`pipeline/build.mjs` (→ `window.__TALEX__.copy`). Edit here, then `npm run build`.

```yaml copy
# S01 — counter
number_value: 3126
number_prefix: "$"
number_label: "REVENUE INJECTED INTO $X"
counter_start: 0
counter_milestones: [100, 1000]   # burst stops on the way to number_value

# S02 — treasury capsule (the full TaleX logo sits in the gap of the top outline)
s02_headline: "$X TREASURY"
s02_caption: "100% OF REVENUE GOES INTO THE $X TREASURY"

# S03 — the drop
s03_text: "BUT THERE'S ONE MORE THING"
s03_dots: "..."

# S04 — the vote (screenshot of the X poll: daily 97% / weekly 3%)
s04_text: "YOU VOTED. 97% SAID DAILY."
s04_highlight: ["97%", "DAILY"]   # words drawn in green

# S05 — speedometer
s05_prefix: "×"
s05_from: 1
s05_to: 7
s05_caption: "INJECTIONS PER WEEK"
s05_segments: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

# S06 — daily
s06_headline: "DAILY"
s06_caption: "REVENUE INJECTIONS INTO $X"
s06_axis: ["SEP 28", "SEP 29", "SEP 30", "OCT 1"]

# S07 — the link
s07_url: "ecosystem.talex.world/treasury"
```

## Format

1440×1080 (4:3), 30 fps, ends with the track (18.13s). Brand: `brand/tokens.json`.

## Audio

Music: `audio/music/track.mp3` (builds ~8s, drops at 8.067s, 120 BPM). It is the clock: every cut,
burst and reveal snaps to its beat grid (`shotlist.yaml → video.beats`). SFX are punctuation only,
always under the music: HyperFrames bundled library + two synthesized sounds (`audio/sfx/prompts.yaml`).
