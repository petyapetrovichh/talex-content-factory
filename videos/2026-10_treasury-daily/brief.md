# Brief — 2026-10 Treasury Daily (part 1 quality test)

## Goal

Part 1 of a ≤30s announcement for X:

1. Show this week's $X buyback amount as a big, bursting count-up.
2. Show that revenue goes into the $X Treasury (arrows of money pouring into a treasury container).

Part 2 — the switch from weekly to daily injections — comes later. **Do not build it now.**

This test is 2 shots (S01, S02), ~8.5s. The quality bar is the Higgsfield "$1B" milestone
video (`reference/higgsfield/`, see `STYLE_NOTES.md`).

## Tone

Confident, numbers-forward, premium. No price predictions, no promises.

## Facts / on-screen copy

This YAML block is the **only** place numbers and on-screen copy live. Scenes read it through
`pipeline/build.mjs` (→ `window.__TALEX__.copy`). To change a number or a word, edit it here and
run `npm run build`.

```yaml copy
number_value: 3126
number_prefix: "$"
number_label: "BOUGHT BACK THIS WEEK"
counter_start: 0
counter_milestones: [100, 1000]   # burst stops on the way to number_value
s02_pill_label: "TaleX"
s02_headline: "$X TREASURY"
s02_caption: "100% OF REVENUE GOES INTO THE $X TREASURY"
```

## Format

1440×1080 (4:3), 30 fps. Brand: `brand/tokens.json`.

## Audio

AI-generated (ElevenLabs) and scored to the locked picture: riser into the final hit, three
escalating impacts, whoosh on the whip, soft glitch ticks on letter reveals, liquid swell on
the fill. Music: dark driving build → drop exactly on the final $3,126 hit.
