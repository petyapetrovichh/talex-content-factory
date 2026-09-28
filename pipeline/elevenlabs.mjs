// Minimal ElevenLabs REST client (no SDK), implemented with curl so it honors HTTPS_PROXY everywhere.
// In the Claude cloud environment the egress proxy injects auth for api.elevenlabs.io; elsewhere
// ELEVENLABS_API_KEY is sent as xi-api-key.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

export async function elevenlabs(pathAndQuery, body, { retries = 2 } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "el-"));
  const out = path.join(tmp, "out.bin");
  const args = ["-sS", "-X", "POST", `https://api.elevenlabs.io${pathAndQuery}`, "-H", "Content-Type: application/json", "--data-binary", "@-", "-o", out, "-w", "%{http_code}", "--max-time", "600"];
  const key = process.env.ELEVENLABS_API_KEY;
  if (key && key !== "placeholder") args.push("-H", `xi-api-key: ${key}`);
  try {
    for (let attempt = 0; ; attempt++) {
      const r = spawnSync("curl", args, { input: JSON.stringify(body), maxBuffer: 1 << 20 });
      const code = parseInt(r.stdout?.toString() || "0", 10);
      if (code >= 200 && code < 300) return fs.readFileSync(out);
      const text = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : r.stderr?.toString();
      if (attempt < retries && (code === 429 || code >= 500 || code === 0)) {
        await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
        continue;
      }
      throw new Error(`ElevenLabs ${pathAndQuery} → HTTP ${code}: ${String(text).slice(0, 800)}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function probeDuration(file) {
  return parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
}
