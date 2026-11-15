import { createHash } from "node:crypto";
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Required argument missing: ${name}`);
  return args[index + 1];
};
const base = argValue("--base");
const dist = "dist";
const dataDir = join(dist, "data");
const approvedFiles = ["trend_analysis.json", "environmental_relationships_v1.json", "predictive_evaluation_v1.json", "public_data_manifest_v1.json"];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

if (!base.startsWith("/") || !base.endsWith("/")) throw new Error("Pages base path must start and end with a slash.");
const index = await readFile(join(dist, "index.html"), "utf8");
if (!index.includes(`${base}assets/`) || /(?:src|href)="\/assets\//.test(index)) throw new Error(`Vite assets do not resolve under the configured subpath ${base}.`);

// Vite copies the tracked directory placeholder into dist. Remove only that generated placeholder.
await unlink(join(dataDir, ".gitignore")).catch((error) => { if (error.code !== "ENOENT") throw error; });
const actualFiles = (await readdir(dataDir)).sort();
if (JSON.stringify(actualFiles) !== JSON.stringify([...approvedFiles].sort())) throw new Error(`Unexpected public data files in build: ${actualFiles.join(", ")}`);
const releaseManifest = JSON.parse(await readFile(join(dataDir, "public_data_manifest_v1.json"), "utf8"));
if (releaseManifest.publication_approval !== "approved_for_public_release") throw new Error("Build data bundle is not approved for public release.");
for (const entry of releaseManifest.artifacts) {
  const bytes = await readFile(join(dataDir, entry.filename));
  if (digest(bytes) !== entry.sha256 || bytes.byteLength !== entry.bytes) throw new Error(`Built public data failed checksum/size verification: ${entry.filename}`);
}

const allFiles = [];
async function listFiles(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, item.name);
    if (item.isDirectory()) await listFiles(absolute);
    else {
      const bytes = await readFile(absolute);
      allFiles.push({ path: relative(dist, absolute).split(sep).join("/"), bytes: bytes.byteLength, sha256: digest(bytes) });
    }
  }
}
await listFiles(dist);
allFiles.sort((left, right) => left.path.localeCompare(right.path));
const publicDataBytes = allFiles.filter((file) => file.path.startsWith("data/")).reduce((total, file) => total + file.bytes, 0);
if (publicDataBytes > 10 * 1024 * 1024) throw new Error("Approved public data bundle exceeds 10 MiB.");
await writeFile(join(dist, "reproducibility_manifest.json"), `${JSON.stringify({ schema_version: "alpha_agro_pages_build_v1", base_path: base, files: allFiles }, null, 2)}\n`, { flag: "wx" });
console.log(`Verified ${approvedFiles.length} approved public data files under ${base}; wrote a deterministic build manifest for ${allFiles.length} files.`);
