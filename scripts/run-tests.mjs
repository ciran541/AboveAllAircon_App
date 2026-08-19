/**
 * scripts/run-tests.mjs
 *
 * Runs every *.test.ts under lib/ in one process, using node:test.
 *
 * `node --test` is deliberately not used: it re-spawns a child process per
 * file, and the TypeScript hooks in scripts/test-hooks.mjs would not follow it
 * there. Importing the files instead keeps one process, one set of hooks, and
 * node:test's own exit code.
 *
 * Run with: npm test
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const searchDirs = ["lib"];

function testFilesIn(dir) {
  const absolute = path.join(projectRoot, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? testFilesIn(path.join(dir, entry.name))
        : entry.name.endsWith(".test.ts")
          ? [path.join(absolute, entry.name)]
          : []
    );
}

const files = searchDirs.flatMap(testFilesIn).sort();

if (files.length === 0) {
  console.error("No *.test.ts files found.");
  process.exit(1);
}

for (const file of files) {
  await import(pathToFileURL(file).href);
}
