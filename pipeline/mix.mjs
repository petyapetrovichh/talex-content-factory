#!/usr/bin/env node
// Stage: mix. Reads ONLY <video>/audio_cues.yaml and renders <video>/assets/audio/mix.wav:
//   - music bed: aligned by the measured drop offset, optional build ramp into the drop, optional fade-out,
//     optionally ducked (deterministic dip + exponential recovery) under every event with duck: true
//   - SFX bus: optionally held under the music (music.sfx_headroom_db: SFX bus peak ≤ music peak − headroom)
//   - every SFX placed at its exact cue time (+ gain, exact trim, optional gain shape)
//   - master: loudness-normalised to master.loudness_lufs with a true-peak limiter
// Then run `npm run build` so index.html picks up the mix.
//
// usage: node pipeline/mix.mjs [videos/<name>]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import { REPO, resolveVideoDir, rel } from "./lib.mjs";

const dir = resolveVideoDir(process.argv[2]);
const cues = YAML.parse(fs.readFileSync(path.join(dir, "audio_cues.yaml"), "utf8"));
const outDir = path.join(dir, "assets/audio");
fs.mkdirSync(outDir, { recursive: true });
const pre = path.join(outDir, ".premix.wav");
const out = path.join(outDir, "mix.wav");
const SR = 48000;
const dur = cues.duration_ms / 1000;
const db = (x) => Math.pow(10, x / 20).toFixed(5);

const inputs = [];
const f = [];
const add = (file) => (inputs.push("-i", path.join(REPO, file)), inputs.length / 2 - 1);

// ---- music bed
const M = cues.music;
const mi = add(M.file);
const drop = M.drop_ms / 1000;
const [r0, r1] = M.build_ramp_db;
const align = M.offset_ms > 0 ? `atrim=start=${M.offset_ms / 1000},asetpts=PTS-STARTPTS,` : M.offset_ms < 0 ? `adelay=${-M.offset_ms}:all=1,` : "";
f.push(
  `[${mi}:a]${align}aresample=${SR},aformat=channel_layouts=stereo,` +
    (r0 || r1 ? `volume='if(lt(t,${drop}),pow(10,(${r0}+(${r1 - r0})*t/${drop})/20),1)':eval=frame,` : "") +
    `volume=${db(M.gain_db)},` +
    (M.fade_out_ms ? `afade=t=out:st=${M.fade_out_ms[0] / 1000}:d=${(M.fade_out_ms[1] - M.fade_out_ms[0]) / 1000},` : "") +
    `apad,atrim=0:${dur}[music]`,
);

// ---- events
const all = [];
for (const [i, e] of cues.events.entries()) {
  const k = add(e.file);
  const at = e.at_ms / 1000;
  let chain = `[${k}:a]aresample=${SR},aformat=channel_layouts=stereo`;
  if (e.skip_ms) chain += `,atrim=start=${e.skip_ms / 1000},asetpts=PTS-STARTPTS,afade=t=in:d=0.04`;
  if (e.trim_ms) chain += `,atrim=0:${e.trim_ms / 1000},afade=t=out:st=${Math.max(0, e.trim_ms / 1000 - 0.25)}:d=0.25`;
  if (e.length_ms) chain += `,apad,atrim=0:${e.length_ms / 1000},afade=t=out:st=${e.length_ms / 1000 - 0.006}:d=0.006`;
  if (e.shape_db) {
    const L = (e.length_ms || 3000) / 1000;
    // gain curve start→end, eased so most of the lift lands at the end (crescendo into the hit)
    chain += `,volume='pow(10,(${e.shape_db[0]}+(${e.shape_db[1] - e.shape_db[0]})*pow(min(t/${L},1),2))/20)':eval=frame`;
  }
  chain += `,volume=${db(e.gain_db)},adelay=${e.at_ms}:all=1,apad,atrim=0:${dur}`;
  f.push(`${chain}[e${i}]`);
  all.push(`[e${i}]`);
}
f.push(`${all.join("")}amix=inputs=${all.length}:normalize=0:dropout_transition=0[sfx]`);
// Deterministic ducking: at every duck event the bed dips by duck_db (hits) / 60% of it (motion)
// and recovers exponentially (tau), instead of a level-dependent sidechain that long tails can pin down.
const tau = (M.duck_release_ms ?? 260) / 1000;
const terms = cues.events
  .filter((e) => e.duck && M.duck_db > 0)
  .map((e) => {
    const t0 = (e.at_ms - 12) / 1000; // start the dip a hair before the transient
    const w = (e.category === "hit" ? 1 : 0.6) * M.duck_db;
    return `if(gte(t,${t0}),${w.toFixed(2)}*exp(-(t-${t0})/${tau}),0)`;
  });
f.push(terms.length ? `[music]volume='pow(10,-min(${M.duck_db},${terms.join("+")})/20)':eval=frame[musicd]` : `[music]anull[musicd]`);

// render the two buses separately so the SFX level can be checked against the music
const busM = path.join(outDir, ".bus_music.wav"), busS = path.join(outDir, ".bus_sfx.wav");
execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", f.join(";"),
  "-map", "[musicd]", "-ar", String(SR), "-c:a", "pcm_s24le", busM,
  "-map", "[sfx]", "-ar", String(SR), "-c:a", "pcm_s24le", busS]);
const peakDb = (file) => {
  const r = execFileSync("sh", ["-c", `ffmpeg -hide_banner -nostats -i "${file}" -af astats=measure_overall=Peak_level:measure_perchannel=none -f null - 2>&1 | grep -E "Peak level" | tail -1`]).toString();
  return parseFloat(r.split(":").pop());
};
let sfxTrim = 0;
const musicPeak = peakDb(busM), sfxPeak = peakDb(busS);
if (M.sfx_headroom_db != null && sfxPeak > musicPeak - M.sfx_headroom_db) sfxTrim = musicPeak - M.sfx_headroom_db - sfxPeak;
console.log(`buses: music peak ${musicPeak.toFixed(1)} dBFS, sfx peak ${sfxPeak.toFixed(1)} dBFS${sfxTrim ? ` → sfx trimmed ${sfxTrim.toFixed(1)} dB` : ""}`);
execFileSync("ffmpeg", ["-y", "-v", "error", "-i", busM, "-i", busS, "-filter_complex",
  `[1:a]volume=${sfxTrim.toFixed(2)}dB[s];[0:a][s]amix=inputs=2:normalize=0:dropout_transition=0,atrim=0:${dur}[mix]`,
  "-map", "[mix]", "-ar", String(SR), "-c:a", "pcm_s24le", pre]);
if (!process.env.KEEP_BUSES) {
  fs.rmSync(busM, { force: true });
  fs.rmSync(busS, { force: true });
}

// ---- loudness: measure → gain → true-peak limit, iterate (the limiter eats a little loudness)
function measure(file) {
  const r = execFileSync("sh", ["-c", `ffmpeg -hide_banner -nostats -i "${file}" -af ebur128=peak=true -f null - 2>&1 | tail -12`]).toString();
  const I = parseFloat(r.match(/I:\s+(-?[\d.]+) LUFS/)[1]);
  const TP = parseFloat(r.match(/Peak:\s+(-?[\d.]+) dBFS/)[1]);
  return { I, TP };
}
const T = cues.master;
let gain = 0;
let m = measure(pre);
const before = m;
for (let pass = 0; pass < 4; pass++) {
  gain += T.loudness_lufs - m.I;
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-i", pre,
    "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=${db(T.true_peak_db - 0.3)}:attack=1:release=60:level=false,atrim=0:${dur}`,
    "-ar", String(SR), "-c:a", "pcm_s24le", out,
  ]);
  m = measure(out);
  if (Math.abs(m.I - T.loudness_lufs) < 0.3) break;
}
fs.rmSync(pre, { force: true });
const report = { file: rel(out), duration_s: dur, buses: { music_peak_db: musicPeak, sfx_peak_db: sfxPeak, sfx_trim_db: +sfxTrim.toFixed(2) }, premix: { I: before.I, TP: before.TP }, master: { I: m.I, TP: m.TP, gain_db: +gain.toFixed(2) }, target: T };
fs.writeFileSync(path.join(outDir, "mix.report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`mix → ${rel(out)}  premix ${before.I} LUFS → master ${m.I} LUFS, true peak ${m.TP} dBTP (gain ${gain.toFixed(1)} dB)`);
