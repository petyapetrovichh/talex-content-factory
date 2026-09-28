#!/usr/bin/env node
// Stage: music clock. Analyses a soundtrack so the shotlist can snap cuts to it.
//   1. `npx hyperframes beats` (in a throw-away project) → onsets + BPM
//   2. low-band (<160 Hz) energy → the DROP = biggest jump in low end after the build
//   3. fits a constant beat grid to the strong onsets (origin + period), snapped to the video fps
// Writes audio/music/<track>.beats.json and prints the grid. Copy drop/origin/period into
// shotlist.yaml → video.beats and snap every cut/burst/reveal to it.
//
// usage: node pipeline/beats.mjs audio/music/track.mp3 [--fps 30] [--window 5000,12000]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { REPO, rel } from "./lib.mjs";
import { measureDrop } from "./music.mjs";

const args = process.argv.slice(2);
const track = path.resolve(REPO, args.find((a) => !a.startsWith("--")) || "audio/music/track.mp3");
const fps = args.includes("--fps") ? +args[args.indexOf("--fps") + 1] : 30;
const win = args.includes("--window") ? args[args.indexOf("--window") + 1].split(",").map(Number) : [3000, 14000];

// 1. hyperframes beats in a minimal project
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "talex-beats-"));
fs.mkdirSync(path.join(tmp, "assets"));
fs.copyFileSync(track, path.join(tmp, "assets", "track.mp3"));
fs.copyFileSync(path.join(REPO, "pipeline/runtime/vendor/gsap.min.js"), path.join(tmp, "assets", "gsap.min.js"));
const dur = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", track]).toString());
fs.writeFileSync(
  path.join(tmp, "index.html"),
  `<!doctype html><html><head><meta charset="UTF-8"><script src="assets/gsap.min.js"></script></head><body>
<div id="root" data-composition-id="main" data-width="1440" data-height="1080" data-duration="${dur}">
<audio id="music" data-timeline-role="music" src="assets/track.mp3" data-start="0" data-duration="${dur}" data-track-index="10"></audio>
</div><script>window.__timelines["main"]=gsap.timeline({paused:true});</script></body></html>`,
);
const r = spawnSync("npx", ["hyperframes", "beats", ".", "--json"], { cwd: tmp, encoding: "utf8" });
if (r.status !== 0) throw new Error(`hyperframes beats failed: ${r.stderr || r.stdout}`);
const beats = JSON.parse(fs.readFileSync(path.join(tmp, "beats/assets/track.mp3.json"), "utf8")).beats;
const bpmReported = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))).bpm;
fs.rmSync(tmp, { recursive: true, force: true });

// 2. the drop
const drop = measureDrop(track, win);

// 3. grid: period from the strong onsets after the drop (median spacing folded onto whole beats), origin from the drop
const strong = beats.filter((b) => b.strength > 0.6 && b.time * 1000 >= drop.ms - 20).map((b) => b.time);
const gaps = strong.slice(1).map((t, i) => t - strong[i]).filter((g) => g > 0.2);
const base = 60 / bpmReported;
const periods = gaps.map((g) => g / Math.max(1, Math.round(g / base))).sort((a, b) => a - b);
const period = periods.length ? periods[Math.floor(periods.length / 2)] : base;
const snap = (t) => Math.round(t * fps) / fps;
const dropT = snap(drop.ms / 1000);
const origin = snap(dropT - Math.floor(dropT / period) * period);
const out = {
  track: rel(track),
  duration_s: +dur.toFixed(3),
  video_frames: Math.ceil(dur * fps - 1e-6),
  bpm_reported: bpmReported,
  period_s: +period.toFixed(4),
  bpm_grid: +(60 / period).toFixed(2),
  drop_s: +dropT.toFixed(4),
  drop_frame: Math.round(dropT * fps),
  origin_s: +origin.toFixed(4),
  grid_first_16: Array.from({ length: 16 }, (_, i) => +(dropT + (i - 4) * period).toFixed(3)),
  onsets: beats,
};
const file = track.replace(/\.[^.]+$/, ".beats.json");
fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
console.log(`beats ${rel(track)}: ${out.bpm_grid} BPM grid (period ${out.period_s}s), DROP ${out.drop_s}s = frame ${out.drop_frame}, origin ${out.origin_s}s, ${out.video_frames} frames → ${rel(file)}`);
