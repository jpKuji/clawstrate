import fs from "node:fs";
import path from "node:path";
import { buildPitchContractFiles } from "../src/lib/pitch/contract";

const cwd = process.cwd();
const publicPitchDir = path.join(cwd, "public", "pitch");

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(relativePath: string, content: string): void {
  const filePath = path.join(publicPitchDir, relativePath);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

ensureDir(publicPitchDir);

const files = buildPitchContractFiles(cwd);
for (const [relativePath, content] of Object.entries(files)) {
  writeFile(relativePath, content);
}

const pitchSizeBytes = Buffer.byteLength(files["pitch.md"], "utf8");
const maxPitchBytes = 200 * 1024;
if (pitchSizeBytes >= maxPitchBytes) {
  throw new Error(`/public/pitch/pitch.md exceeds 200KB (${pitchSizeBytes} bytes)`);
}

console.log("Pitch pack generated successfully.");
