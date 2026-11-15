import { prepareApprovedPublicData } from "./publicBundle";

const args = process.argv.slice(2);
const value = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1] ?? (() => { throw new Error(`Expected a value after ${name}.`); })();
};

prepareApprovedPublicData(value("--bundle", "release-data/generated-bundle"), value("--public-data", "public/data")).then(() => {
  console.log("Approved public data bundle validated and staged without overwriting existing files.");
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
