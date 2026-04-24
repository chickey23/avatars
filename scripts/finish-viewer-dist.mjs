import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const from = path.join(root, "dist-viewer", "viewer.html");
const to = path.join(root, "dist-viewer", "index.html");

if (fs.existsSync(from)) {
  fs.renameSync(from, to);
}
