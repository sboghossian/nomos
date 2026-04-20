import { readFileSync } from "node:fs";
import { parse, prettyPrint } from "../dist/index.js";

const src = readFileSync(
  new URL("./fixtures/non_compete_fr.nomos", import.meta.url),
  "utf8",
);

const result = parse(src);

if (result.lexErrors.length) {
  console.error("LEX ERRORS:");
  for (const e of result.lexErrors) {
    console.error(`  [${e.line}:${e.column}] ${e.message}`);
  }
}
if (result.parseErrors.length) {
  console.error("PARSE ERRORS:");
  for (const e of result.parseErrors) {
    console.error(`  [${e.line}:${e.column}] ${e.message}`);
  }
}
if (result.ast) {
  console.log(prettyPrint(result.ast));
}
if (!result.ast) process.exit(1);
