#!/usr/bin/env node
// Stage: review. Snapshots the ASSEMBLED video (index.html) at each shot's `review_at` times
// (global seconds from shotlist.yaml, default 8 evenly spaced frames) and writes one labelled
// contact sheet per shot: <video>/review/<ID>_<name>_contact.png
//
// usage: node pipeline/review.mjs [videos/<name>] [S01 S02 ...]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { REPO, rel } from "./lib.mjs";
import { build } from "./build.mjs";

const args = process.argv.slice(2);
const videoArg = args.find((a) => !/^S\d+$/i.test(a));
const only = args.filter((a) => /^S\d+$/i.test(a)).map((a) => a.toUpperCase());

const built = build(videoArg);
const { dir, shotlist } = built;
const reviewDir = path.join(dir, "review");
fs.mkdirSync(reviewDir, { recursive: true });
const font = path.join(REPO, "brand/fonts/Archivo-Variable.woff2");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "talex-review-"));

for (const s of shotlist.shots) {
  if (only.length && !only.includes(s.id)) continue;
  const end = s.end + (s.tail || 0);
  const fps = shotlist.video.fps || 30;
  // snapshot at the exact frame time the renderer uses (f / fps), not the snapped value (f / fps − ε),
  // otherwise a frame that starts a shot can show the previous shot
  const raw = s.review_at || Array.from({ length: 8 }, (_, i) => s.start + ((i + 0.5) * (end - s.start)) / 8);
  const times = raw.map((t) => +(Math.round(t * fps) / fps).toFixed(4));
  const out = path.join(tmpRoot, s.id);
  console.log(`review ${s.id}: snapshot at ${times.join(", ")}s`);
  execFileSync("npx", ["hyperframes", "snapshot", "--at", times.join(","), "--no-end", "-o", out, "--describe", "false"], {
    cwd: dir,
    stdio: ["ignore", "ignore", "inherit"],
  });
  const frames = fs.readdirSync(out).filter((f) => /^frame-\d+.*\.png$/.test(f)).sort();
  if (!frames.length) throw new Error(`no frames captured for ${s.id}`);
  // label + tile with ffmpeg (4 columns, 480x360 cells)
  const cols = Math.min(4, frames.length);
  const rows = Math.ceil(frames.length / cols);
  const inputs = [];
  const filters = [];
  frames.forEach((f, i) => {
    inputs.push("-i", path.join(out, f));
    const label = `${s.id}  t=${times[i].toFixed(2)}s`;
    filters.push(
      `[${i}:v]scale=480:360,drawbox=x=0:y=0:w=190:h=30:color=black@0.7:t=fill,drawtext=fontfile='${font}':text='${label}':x=10:y=8:fontsize=16:fontcolor=white[f${i}]`,
    );
  });
  for (let i = frames.length; i < rows * cols; i++) {
    filters.push(`color=c=0x222222:s=480x360:d=1[f${i}]`);
  }
  const layout = Array.from({ length: rows * cols }, (_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 360}`).join("|");
  filters.push(`${Array.from({ length: rows * cols }, (_, i) => `[f${i}]`).join("")}xstack=inputs=${rows * cols}:layout=${layout}:fill=0x222222[out]`);
  const sheet = path.join(reviewDir, `${s.id}_${s.name}_contact.png`);
  execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-frames:v", "1", sheet]);
  console.log(`  → ${rel(sheet)}`);
}
fs.rmSync(tmpRoot, { recursive: true, force: true });
