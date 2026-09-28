#!/usr/bin/env node
// Stage: music. Generates a soundtrack from a composition plan with the ElevenLabs Music API,
// then measures where the drop actually landed so the mix can align it to the picture hit.
//
// usage: node pipeline/music.mjs audio/music/composition_plan_test.json [--takes N]
//        node pipeline/music.mjs audio/music/composition_plan_test.json --measure   (re-measure only)
//
// The plan JSON: { output, model_id, output_format, align: { drop_ms, search_window_ms }, composition_plan }
// After generation the measured drop is written back into the plan as `measured` and read by mix.mjs.
//
// Engines: "music" = ElevenLabs Music API (POST /v1/music, needs a paid ElevenLabs plan).
//          "sfx-sections" = fallback when the Music API is unavailable (HTTP 402/403): each plan chunk
//          is generated with the Sound Effects API at its exact duration and the chunks are butt-joined,
//          so every section boundary (the drop) lands exactly where the plan puts it.
// Force one with --engine music|sfx-sections.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { REPO } from "./lib.mjs";
import { elevenlabs, probeDuration } from "./elevenlabs.mjs";

/** Onset of the drop: biggest jump in low-end (<160 Hz) energy inside the search window. */
export function measureDrop(file, [fromMs, toMs]) {
  const out = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-af", "lowpass=f=160,asetnsamples=n=480:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-", "-f", "null", "-"],
    { maxBuffer: 1 << 26 },
  ).toString();
  // frames of 480 samples @48k = 10 ms
  const rms = [];
  for (const m of out.matchAll(/pts_time:([\d.]+)[\s\S]*?RMS_level=(-?[\d.inf]+)/g)) rms.push([parseFloat(m[1]) * 1000, m[2].includes("inf") ? -120 : parseFloat(m[2])]);
  const smooth = (i, w) => {
    let s = 0, n = 0;
    for (let k = Math.max(0, i - w); k <= Math.min(rms.length - 1, i + w); k++) (s += rms[k][1]), n++;
    return s / n;
  };
  let best = { ms: null, jump: -Infinity };
  for (let i = 8; i < rms.length - 8; i++) {
    const t = rms[i][0];
    if (t < fromMs || t > toMs) continue;
    // energy in the 150 ms after vs the 150 ms before
    let a = 0, b = 0;
    for (let k = 1; k <= 15; k++) (a += smooth(Math.min(rms.length - 1, i + k), 1)), (b += smooth(Math.max(0, i - k), 1));
    const jump = (a - b) / 15;
    if (jump > best.jump) best = { ms: Math.round(t), jump: +jump.toFixed(1) };
  }
  return best;
}

/** Fallback engine: one Sound Effects call per chunk, exact durations, joined sample-accurately. */
async function composeBySections(plan, file, seed) {
  const tmp = fs.mkdtempSync(path.join(path.dirname(file), ".sec-"));
  const parts = [];
  const g = plan.sfx_sections || {};
  for (const [i, c] of plan.composition_plan.chunks.entries()) {
    const text = (g.prompts && g.prompts[i]) || `Instrumental electronic music. ${c.positive_styles.join(", ")}`.slice(0, 450);
    const buf = await elevenlabs(`/v1/sound-generation?output_format=mp3_44100_192`, {
      text,
      duration_seconds: c.duration_ms / 1000,
      prompt_influence: g.prompt_influence ?? 0.6,
      model_id: "eleven_text_to_sound_v2",
    });
    const mp3 = path.join(tmp, `c${i}.mp3`);
    fs.writeFileSync(mp3, buf);
    const wav = path.join(tmp, `c${i}.wav`);
    // exact length per chunk: trim/pad to duration_ms, 4 ms edge fades against clicks
    const d = c.duration_ms / 1000;
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", mp3, "-af", `aresample=48000,apad,atrim=0:${d},afade=t=in:d=0.004,afade=t=out:st=${d - 0.004}:d=0.004`, "-ac", "2", "-ar", "48000", wav]);
    parts.push(wav);
  }
  const list = path.join(tmp, "list.txt");
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-c:a", "libmp3lame", "-b:a", "256k", file]);
  fs.rmSync(tmp, { recursive: true, force: true });
}

async function main() {
  const args = process.argv.slice(2);
  const planFile = path.resolve(REPO, args.find((a) => a.endsWith(".json")) || "audio/music/composition_plan_test.json");
  const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
  const takesIx = args.indexOf("--takes");
  const takes = takesIx >= 0 ? parseInt(args[takesIx + 1], 10) : 0;
  const out = path.join(REPO, plan.output);
  const results = [];
  if (!args.includes("--measure")) {
    for (let k = 1; k <= Math.max(1, takes); k++) {
      const file = takes ? path.join(REPO, "audio/music/_takes", `${path.basename(out, ".mp3")}_take${k}.mp3`) : out;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      let engine = args.includes("--engine") ? args[args.indexOf("--engine") + 1] : plan.engine_used === "sfx-sections" && k > 1 ? "sfx-sections" : "music";
      if (engine === "music") {
        process.stdout.write(`music ${path.relative(REPO, file)} (${plan.model_id}) … `);
        try {
          const buf = await elevenlabs(`/v1/music?output_format=${plan.output_format}`, { composition_plan: plan.composition_plan, model_id: plan.model_id });
          fs.writeFileSync(file, buf);
        } catch (e) {
          if (!/HTTP (402|403)/.test(e.message)) throw e;
          console.log(`Music API unavailable (${e.message.match(/HTTP \d+/)[0]}: ${e.message.includes("paid_plan") ? "paid plan required" : "no access"}) → falling back to sfx-sections`);
          engine = "sfx-sections";
        }
      }
      if (engine === "sfx-sections") {
        process.stdout.write(`music ${path.relative(REPO, file)} (sfx-sections) … `);
        await composeBySections(plan, file, k);
      }
      plan.engine_used = engine;
      const drop = measureDrop(file, plan.align.search_window_ms);
      console.log(`${probeDuration(file).toFixed(2)}s, drop at ${drop.ms} ms (+${drop.jump} dB)`);
      results.push({ file, drop });
    }
  }
  if (!takes) {
    const drop = measureDrop(out, plan.align.search_window_ms);
    if (plan.engine_used === "sfx-sections") {
      // boundary is exact by construction (chunks are cut to duration_ms)
      drop.ms = plan.composition_plan.chunks.slice(0, plan.align.drop_chunk ?? 1).reduce((a, c) => a + c.duration_ms, 0);
    }
    plan.measured = { engine: plan.engine_used, drop_ms: drop.ms, drop_jump_db: drop.jump, duration_ms: Math.round(probeDuration(out) * 1000), offset_ms: drop.ms - plan.align.drop_ms };
    fs.writeFileSync(planFile, JSON.stringify(plan, null, 2) + "\n");
    console.log(`measured drop ${drop.ms} ms → mix shifts music by ${-plan.measured.offset_ms} ms so it lands at ${plan.align.drop_ms} ms`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
