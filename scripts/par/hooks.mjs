// Lets the par scripts import the game's TypeScript (src/lib/...) straight from Node 24, which
// strips the types itself: resolves the "@/" alias and extensionless imports, and loads JSON.
// Used as `node --import ./scripts/par/hooks.mjs`. No dependencies.
import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const asFile = (base) => [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((f) => existsSync(f) && statSync(f).isFile());

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null;
    if (specifier.startsWith("@/")) base = path.join(ROOT, "src", specifier.slice(2));
    else if (/^\.\.?\//.test(specifier) && context.parentURL?.startsWith("file:")) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }
    const file = base && asFile(base);
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      return { format: "module", source: `export default ${readFileSync(fileURLToPath(url), "utf8")};`, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
