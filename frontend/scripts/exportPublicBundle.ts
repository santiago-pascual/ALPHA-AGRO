import { exportPublicBundle } from "./publicBundle";

const args = process.argv.slice(2);
const value = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1] ?? (() => { throw new Error(`Expected a value after ${name}.`); })();
};

exportPublicBundle({
  trendPath: value("--trend", "public/data/trend_analysis.json"),
  relationshipsPath: value("--relationships", "../docs/GLDAS_RELATIONSHIPS_RESULTS.json"),
  driverManifestPath: value("--driver-manifest", "../docs/GLDAS_DRIVER_SHA256.csv"),
  predictivePath: value("--predictive", "public/data/predictive_evaluation_v1.json"),
  outputPath: value("--output", "release-data/generated-bundle"),
  approvedForPublication: args.includes("--approve-publication"),
}).then((manifest) => {
  console.log(`Validated ${manifest.artifacts.length} scientific artifacts. Bundle approval: ${manifest.publication_approval}.`);
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
