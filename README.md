# talex-content-factory

TaleX video production pipeline (HyperFrames + ElevenLabs, all local/free tooling).
Start with **[PIPELINE.md](PIPELINE.md)**: brief → shotlist → scenes → review → audio → render,
and how to request single-shot / single-sound edits.

```bash
npm install
npx hyperframes doctor            # Chrome headless shell + ffmpeg
npm run check                     # validate + hyperframes check
npm run render                    # → videos/<slug>/output/*.mp4
```

Current video: `videos/2026-10_treasury-daily/` (part-1 quality test, 2 shots).
