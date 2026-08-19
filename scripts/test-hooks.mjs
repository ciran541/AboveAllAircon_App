/**
 * scripts/test-hooks.mjs
 *
 * Module hooks that let `node --test`-style unit tests import the app's
 * TypeScript directly. Node 20 can't strip types on its own (that landed in
 * 22.6) and this project has no test runner, so rather than adding a bundler
 * and its dependency tree, this transpiles with the `typescript` package that
 * is already a devDependency and resolves the `@/*` path alias from
 * tsconfig.json.
 *
 * Types are erased, not checked — `npm run build` and `tsc --noEmit` remain
 * the typechecker. See scripts/run-tests.mjs.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  let spec = specifier;
  if (spec.startsWith("@/")) {
    spec = pathToFileURL(path.join(projectRoot, spec.slice(2))).href;
  }

  try {
    return await nextResolve(spec, context);
  } catch (err) {
    // TypeScript imports are written without a file extension. Only retried
    // for paths — appending .ts to a bare package specifier would turn "this
    // dependency isn't installed" into a baffling "@scope/pkg.ts not found".
    const isPath = /^(\.|\/|file:)/.test(spec);
    if (isPath && !/\.[cm]?[jt]s$/.test(spec)) {
      return nextResolve(`${spec}.ts`, context);
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts")) {
    const filename = fileURLToPath(url);
    const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        isolatedModules: true,
      },
      fileName: filename,
    });
    return { format: "module", shortCircuit: true, source: outputText };
  }
  return nextLoad(url, context);
}
