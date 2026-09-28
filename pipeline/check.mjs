#!/usr/bin/env node
// `npm run check` — pipeline integrity + HyperFrames gate for every video (or one: VIDEO=<name>).
//  1. rebuild index.html from shotlist/brief/tokens (fails on missing copy keys)
//  2. every shotlist sfx cue names a sound defined in audio/sfx/prompts.yaml
//  3. audio_cues.yaml (if present) is in sync with the shotlist
//  4. npx hyperframes check (lint + runtime + layout + motion + contrast)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { REPO, listVideoDirs, resolveVideoDir, rel } from "./lib.mjs";
import { build } from "./build.mjs";
import { cueSheet } from "./cues.mjs";

const dirs = process.argv[2] || process.env.VIDEO ? [resolveVideoDir(process.argv[2])] : listVideoDirs();
const prompts = YAML.parse(fs.readFileSync(path.join(REPO, "audio/sfx/prompts.yaml"), "utf8"));
let failed = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  failed++;
};

for (const dir of dirs) {
  console.log(`\n== ${rel(dir)}`);
  const { shotlist } = build(dir);
  for (const s of shotlist.shots) {
    for (const c of s.sfx || []) if (!prompts.sounds[c.sound]) fail(`${s.id}.${c.cue}: sound "${c.sound}" not in audio/sfx/prompts.yaml`);
    if (s.start >= s.end) fail(`${s.id}: start >= end`);
  }
  const cuesFile = path.join(dir, "audio_cues.yaml");
  if (fs.existsSync(cuesFile)) {
    if (fs.readFileSync(cuesFile, "utf8") !== cueSheet(dir).text) fail("audio_cues.yaml is stale — run `npm run cues`");
  }
  const r = spawnSync("npx", ["hyperframes", "check"], { cwd: dir, stdio: "inherit" });
  if (r.status !== 0) fail("hyperframes check failed");
}
if (failed) {
  console.error(`\ncheck: ${failed} problem(s)`);
  process.exit(1);
}
console.log("\ncheck: all good");
