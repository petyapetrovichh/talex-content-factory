#!/usr/bin/env node
// Stage: render. Renders each shot solo (picture only) and the assembled video (picture + mix).
//   <video>/output/<ID>_<name>.mp4       one per shot
//   <video>/output/<video.output>         the combined cut (default test.mp4)
// Blur-heavy work → --workers from brand/tokens.json blur.render_workers (1: multi-worker renders
// can make animated blur flicker).
//
// usage: node pipeline/render.mjs [videos/<name>] [S01 S02 ...] [--combined-only] [--draft]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { loadTokens, rel } from "./lib.mjs";
import { build, makeSoloProject } from "./build.mjs";

const args = process.argv.slice(2);
const videoArg = args.find((a) => !a.startsWith("--") && !/^S\d+$/i.test(a));
const only = args.filter((a) => /^S\d+$/i.test(a)).map((a) => a.toUpperCase());
const tokens = loadTokens();
const built = build(videoArg);
const { dir, shotlist } = built;
const outDir = path.join(dir, "output");
fs.mkdirSync(outDir, { recursive: true });
const quality = args.includes("--draft") ? "draft" : "delivery";
const workers = String(tokens.blur.render_workers || 1);

function render(projectDir, out) {
  console.log(`render ${rel(out)} (quality ${quality}, workers ${workers})`);
  const r = spawnSync("npx", ["hyperframes", "render", ".", "-o", out, "-q", quality, "--workers", workers, "--quiet"], { cwd: projectDir, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`render failed: ${out}`);
  const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate", "-of", "json", out]).toString());
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.some((s) => s.codec_type === "audio");
  console.log(`  ✓ ${(+info.format.duration).toFixed(2)}s ${v.width}x${v.height} @${v.r_frame_rate}${a ? " +audio" : ""}`);
}

if (!args.includes("--combined-only")) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "talex-solo-"));
  for (const s of shotlist.shots) {
    if (only.length && !only.includes(s.id)) continue;
    const proj = makeSoloProject(built, s.id, path.join(tmp, s.id));
    render(proj, path.join(outDir, `${s.id}_${s.name}.mp4`));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (!only.length) {
  const out = path.join(outDir, shotlist.video.output || "test.mp4");
  render(dir, out);
  const r = execFileSync("sh", ["-c", `ffmpeg -hide_banner -nostats -i "${out}" -af ebur128=peak=true -f null - 2>&1 | tail -12`]).toString();
  const I = r.match(/I:\s+(-?[\d.]+) LUFS/);
  const TP = r.match(/Peak:\s+(-?[\d.]+) dBFS/);
  if (I) console.log(`  loudness ${I[1]} LUFS, true peak ${TP ? TP[1] : "?"} dBTP`);
}
