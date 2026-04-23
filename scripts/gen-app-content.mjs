import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
let s = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");

s = s.replace(/^import \{ AppProvider \} from "\.\/context\/AppProvider";\r?\n/m, "");
s = s.replace(/from "\.\//g, 'from "../');

const importBlock = `import {
  CHAT_VIZ_WIDTH_DEFAULT,
  CHAT_VIZ_WIDTH_MAX,
  CHAT_VIZ_WIDTH_MIN,
  CHAT_VIZ_WIDTH_STORAGE_KEY,
  FUTURE_SOURCE_COLUMNS,
  SOURCE_CACHE_VIZ_STORAGE_KEY,
  SOURCE_CACHE_VIZ_WIDTH_STORAGE_KEY,
  SWITCHBOARD_VIZ_STORAGE_KEY,
  USER_CHROME_DEFAULT,
  USER_CHROME_STORAGE_KEY,
} from "./appChromeConstants";

`;

s = s.replace(
  /import "\.\.\/App\.css";\r?\n\r?\nconst SWITCHBOARD_VIZ_STORAGE_KEY[\s\S]*?\] as const;\r?\n\r?\n/,
  `import "../App.css";\n\n${importBlock}`
);

s = s.replace(/^function AppContent\(\)/m, "export function AppContent()");
s = s.replace(/\r?\nfunction App\(\) \{[\s\S]*?\r?\nexport default App;\r?\n?$/, "\n");

fs.writeFileSync(path.join(root, "src/app/AppContent.tsx"), s);
console.log("Wrote src/app/AppContent.tsx", s.length);
