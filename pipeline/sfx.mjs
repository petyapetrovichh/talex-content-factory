#!/usr/bin/env node
// Stage: SFX library. Generates sounds from audio/sfx/prompts.yaml with the ElevenLabs
// Sound Effects API and saves audio/sfx/<name>.mp3.
//
// usage:  node pipeline/sfx.mjs impact_big [whoosh ...]   regenerate named sounds
//         node pipeline/sfx.mjs riser --takes 4            generate candidates into audio/sfx/_takes/
//                                                          (compare, then copy the best to audio/sfx/riser.mp3)
//         node pipeline/sfx.mjs --missing                  only sounds without an mp3 (default)
//         node pipeline/sfx.mjs --all                      regenerate everything
//
// Auth: in the Claude cloud environment the proxy injects credentials for api.elevenlabs.io.
// Elsewhere, set ELEVENLABS_API_KEY and it is sent as xi-api-key.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { REPO } from "./lib.mjs";
import { elevenlabs, probeDuration } from "./elevenlabs.mjs";

const lib = YAML.parse(fs.readFileSync(path.join(REPO, "audio/sfx/prompts.yaml"), "utf8"));
const args = process.argv.slice(2);
// only ElevenLabs-sourced sounds are generated here (hyperframes/synth sounds are files in the repo)
const all = Object.keys(lib.sounds).filter((n) => (lib.sounds[n].source || "elevenlabs") === "elevenlabs");
const takesIx = args.indexOf("--takes");
const takes = takesIx >= 0 ? parseInt(args.splice(takesIx, 2)[1], 10) : 0;
const names = args.includes("--all") ? all : args.filter((a) => !a.startsWith("--")).length ? args.filter((a) => !a.startsWith("--")) : all.filter((n) => !fs.existsSync(path.join(REPO, "audio/sfx", `${n}.mp3`)));

for (const name of names) {
  const s = lib.sounds[name];
  if (!s) throw new Error(`unknown sound "${name}" (see audio/sfx/prompts.yaml)`);
  for (let k = 1; k <= Math.max(1, takes); k++) {
    const out = takes ? path.join(REPO, "audio/sfx/_takes", `${name}_take${k}.mp3`) : path.join(REPO, "audio/sfx", `${name}.mp3`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    process.stdout.write(`sfx ${name}${takes ? ` take ${k}` : ""} (${s.duration_s}s) … `);
    const buf = await elevenlabs(`/v1/sound-generation?output_format=${lib.output_format}`, {
      text: s.prompt.trim(),
      duration_seconds: s.duration_s,
      prompt_influence: s.prompt_influence,
      model_id: lib.model_id,
    });
    fs.writeFileSync(out, buf);
    console.log(`${(buf.length / 1024).toFixed(0)} KB, ${probeDuration(out).toFixed(2)}s → ${path.relative(REPO, out)}`);
  }
}
if (!names.length) console.log("sfx: nothing missing (pass names or --all to regenerate)");
