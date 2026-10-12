import { units } from "./units.mjs";
import { formatDistance } from "./format.mjs";

export function run(argv) {
  const unit = argv.includes("--unit") ? argv[argv.indexOf("--unit") + 1] : "km";
  if (!units().includes(unit)) return `unknown unit ${unit}`;
  return formatDistance(Number(argv[argv.length - 1]), unit);
}

if (process.argv[1]?.endsWith("cli.mjs")) console.log(run(process.argv.slice(2)));
