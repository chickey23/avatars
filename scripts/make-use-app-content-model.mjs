import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(root, "src/app/AppContent.tsx");

const useAppReturnKeys = [
  "avatars",
  "fullAvatarCatalog",
  "selectedAvatarIds",
  "setSelectedAvatarIds",
  "toggleAvatarSelection",
  "clearAvatarSelection",
  "messages",
  "sendMessage",
  "clearChat",
  "situationContext",
  "patchSituationContext",
  "pendingTurnCount",
  "wavesQueue",
];

let s = fs.readFileSync(src, "utf8");

s = s.replace(
  /import "\.\.\/App\.css";\r?\n\r?\n/,
  ""
);

s = s.replace(
  /^export function AppContent\(\) \{/m,
  "export function useAppContentModel() {"
);

const useAppModelKeys = fs.readFileSync(
  path.join(root, ".local/model-keys.txt"),
  "utf8"
);
const bodyMatch = useAppModelKeys.match(/return \{[\s\S]*?^\s*\};/m);
if (!bodyMatch) throw new Error("Could not parse model-keys");
const body = bodyMatch[0];
const allKeys = new Set();
const keyRe = /^\s*([A-Za-z_][\w]*),?\s*$/gm;
let km;
const inner = body.replace(/^return \{\s*|\s*\};$/g, "");
for (const line of inner.split("\n")) {
  const m = line.match(/^\s*([A-Za-z_][\w]*),?\s*$/);
  if (m) allKeys.add(m[1]);
}
for (const k of useAppReturnKeys) allKeys.add(k);

const sorted = [...allKeys].sort();
const returnObj = `  return {
${sorted.map((k) => `    ${k},`).join("\n")}
  };`;

const startMarker = s.indexOf("  return (\n    <div className=\"app\">");
if (startMarker < 0) throw new Error("start marker not found");
const endMarker = s.lastIndexOf("  );\n}");
if (endMarker < 0) throw new Error("end marker not found");
s = s.slice(0, startMarker) + returnObj + "\n" + s.slice(endMarker + "  );\n".length);

s += "\n\nexport type AppContentViewValue = ReturnType<typeof useAppContentModel>;\n";

const out = path.join(root, "src/app/useAppContentModel.ts");
fs.writeFileSync(out, s);
console.log("Wrote", out, s.length);
