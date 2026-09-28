// Shared loaders for the TaleX video pipeline.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Resolve the video dir: CLI arg, $VIDEO, or the newest videos/* folder that has a shotlist. */
export function resolveVideoDir(arg) {
  const pick = arg || process.env.VIDEO;
  if (pick) {
    const p = path.isAbsolute(pick) ? pick : path.join(REPO, pick.startsWith("videos") ? pick : path.join("videos", pick));
    if (!fs.existsSync(path.join(p, "shotlist.yaml"))) throw new Error(`No shotlist.yaml in ${p}`);
    return p;
  }
  const all = listVideoDirs();
  if (!all.length) throw new Error("No videos/*/shotlist.yaml found");
  return all[all.length - 1];
}

export function listVideoDirs() {
  const root = path.join(REPO, "videos");
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .sort()
    .map((d) => path.join(root, d))
    .filter((d) => fs.existsSync(path.join(d, "shotlist.yaml")));
}

export function loadTokens() {
  return JSON.parse(fs.readFileSync(path.join(REPO, "brand/tokens.json"), "utf8"));
}

/** brief.md holds exactly one ```yaml copy``` block — the only home of numbers and on-screen copy. */
export function loadCopy(videoDir) {
  const md = fs.readFileSync(path.join(videoDir, "brief.md"), "utf8");
  const m = md.match(/```yaml copy\s*\n([\s\S]*?)```/);
  if (!m) throw new Error("brief.md needs a ```yaml copy``` block");
  return YAML.parse(m[1]);
}

export function loadShotlist(videoDir) {
  return YAML.parse(fs.readFileSync(path.join(videoDir, "shotlist.yaml"), "utf8"));
}

/** Resolve a brief reference like "counter_milestones.1" or a literal number. */
export function ref(copy, key) {
  if (typeof key === "number") return key;
  const v = String(key)
    .split(".")
    .reduce((o, k) => (o == null ? undefined : o[k]), copy);
  if (v === undefined) throw new Error(`brief.md copy has no key "${key}"`);
  return v;
}

/** Snap every time field (start/end/at/tail/…_at/review_at) to the fps frame grid, so a cut written as
 *  8.067 lands ON frame 242 instead of one frame late. Snapped times sit FRAME_EPS before the frame:
 *  the renderer's frame time can come out a hair below f/fps, and an event scheduled exactly on the
 *  boundary would then fire one frame late (seen as a missing flash on the final counter burst). */
export const FRAME_EPS = 0.0005;
const TIME_KEY = /^(start|end|at|tail|land|review_at|drop)$|_at$/;
export function snapTimes(node, fps, key = "") {
  if (Array.isArray(node)) return node.map((v) => snapTimes(v, fps, key));
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) node[k] = snapTimes(node[k], fps, k);
    return node;
  }
  if (typeof node === "number" && TIME_KEY.test(key)) {
    const f = Math.round(node * fps);
    return f > 0 && key !== "tail" ? f / fps - FRAME_EPS : f / fps;
  }
  return node;
}

/** Deep-merge `over` into `base` (objects merge, everything else replaces). */
function mergeTokens(base, over) {
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object") mergeTokens(base[k], v);
    else base[k] = v;
  }
  return base;
}

export function loadVideo(arg) {
  const dir = resolveVideoDir(arg);
  const copy = loadCopy(dir);
  const shotlist = loadShotlist(dir);
  // a video may pin brand values (e.g. a format variant that keeps an earlier look): video.tokens
  const tokens = mergeTokens(loadTokens(), shotlist.video.tokens);
  const fps = shotlist.video.fps || tokens.format.fps;
  snapTimes(shotlist.shots, fps);
  if (shotlist.video.duration) shotlist.video.duration = Math.round(shotlist.video.duration * fps) / fps;
  for (const s of shotlist.shots) {
    for (const t of s.text || []) ref(copy, t.key); // fail fast on a missing copy key
    if (s.counter) {
      s.counter.segments = s.counter.segments.map((g) => ({ ...g, from: ref(copy, g.from), to: ref(copy, g.to) }));
    }
  }
  return { dir, tokens, copy, shotlist };
}

export function writeIfChanged(file, content) {
  const prev = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (prev === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

export function rel(p) {
  return path.relative(REPO, p);
}

export function dbToGain(db) {
  return Math.pow(10, db / 20);
}
