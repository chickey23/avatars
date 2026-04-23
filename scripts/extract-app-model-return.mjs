/**
 * Heuristic: list `const` / `const [` / `let` names at 2-space indent in AppContent
 * for use in `return { ... }` from useAppContentModel.
 * Run: node scripts/extract-app-model-return.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const s = fs.readFileSync(path.join(root, "src/app/AppContent.tsx"), "utf8");

const lines = s.split("\n");
const inFunction = { active: false, depth: 0 };
const names = new Set();
for (const line of lines) {
  if (!inFunction.active && line.match(/^export function AppContent/)) {
    inFunction.active = true;
    inFunction.depth = 0;
  }
  if (!inFunction.active) continue;
  if (line.match(/^  const /)) {
    const m = line.match(
      /^  const (?:\{\s*([^}]+?)\s*\}|\[([^\]]+?)\]|([A-Za-z_][\w]*))\s*=/
    );
    if (m) {
      if (m[1]) {
        m[1]
          .split(/,\s*/)
          .map((x) => x.replace(/:.*/, "").trim())
          .filter(Boolean)
          .forEach((n) => {
            if (/^[A-Za-z_]\w*$/.test(n)) names.add(n);
          });
      } else if (m[2]) {
        m[2]
          .split(/,\s*/)
          .map((x) => x.trim())
          .forEach((n) => {
            if (/^[A-Za-z_]\w*$/.test(n)) names.add(n);
          });
      } else if (m[3]) {
        names.add(m[3]);
      }
    }
  }
  if (line.match(/^  let [A-Za-z_]/)) {
    const m = line.match(/^  let ([A-Za-z_][\w]*)\s*=/);
    if (m) names.add(m[1]);
  }
  if (line.match(/^  return \($/)) break;
}

const sorted = [...names].sort();
console.log("return {");
for (const n of sorted) {
  console.log(`    ${n},`);
}
console.log("  };");
console.log("// count", sorted.length);
