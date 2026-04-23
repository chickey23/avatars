import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function parseModelKeys() {
  const s = fs.readFileSync(
    path.join(root, "src/app/useAppContentModel.ts"),
    "utf8"
  );
  /** Last `  return {` is the view-model object (avoid matching inside `    return {`). */
  const i = s.lastIndexOf("\n  return {\n");
  if (i < 0) throw new Error("view-model return not found");
  const j = s.indexOf("\n  };", i);
  if (j < 0) throw new Error("view-model return end not found");
  const block = s.slice(i, j);
  const keys = [];
  for (const line of block.split("\n")) {
    const m = line.match(/^\s+([A-Za-z_][\w]*),?\s*$/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Prefix model keys with `m.` in JSX/TSX, avoiding double m. */
function prefixModelKeys(src, keys) {
  let out = src;
  const sorted = [...keys].sort((a, b) => b.length - a.length);
  for (const k of sorted) {
    const re = new RegExp(`(?<!m\\.)\\b${escapeRe(k)}\\b`, "g");
    out = out.replace(re, `m.${k}`);
  }
  return out;
}

const importBlock = fs.readFileSync(
  path.join(root, "src/app/AppContent.tsx"),
  "utf8"
);
const importEnd = importBlock.indexOf("export function AppContent()");
let imports = importBlock.slice(0, importEnd).trimEnd();
imports = imports.replace(/^import "\.\.\/App\.css";\r?\n?/m, "").trimEnd();

// Regions: 1-based inclusive line numbers in AppContent.tsx
const regions = [
  { name: "AppHeader", from: 1317, to: 1407 },
  { name: "PrimaryAvatarSidebar", from: 1409, to: 2042 },
  { name: "ChatMainPanel", from: 2044, to: 2834 },
  { name: "ContextPanel", from: 2836, to: 3540 },
  { name: "AppOverlays", from: 3541, to: 3564 },
];

const ac = fs
  .readFileSync(path.join(root, "src/app/AppContent.tsx"), "utf8")
  .split("\n");
const keys = parseModelKeys();

for (const { name, from, to } of regions) {
  const lines = ac.slice(from - 1, to);
  const raw = lines.join("\n");
  const body = prefixModelKeys(raw, keys);
  const out = `${imports}
import { useAppContentView } from "./appContentViewContext";

export function ${name}() {
  const m = useAppContentView();
  return (
${body}
  );
}
`;
  const outPath = path.join(root, "src/app", `${name}.tsx`);
  fs.writeFileSync(outPath, out);
  console.log("Wrote", outPath, lines.length, "lines");
}
