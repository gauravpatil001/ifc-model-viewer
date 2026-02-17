import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const webIfcThreePkg = require.resolve("web-ifc-three/package.json");
const webIfcPkg = require.resolve("web-ifc/package.json", {
  paths: [path.dirname(webIfcThreePkg)],
});

const webIfcDir = path.dirname(webIfcPkg);
const outDir = path.resolve(process.cwd(), "public", "wasm");

fs.mkdirSync(outDir, { recursive: true });

for (const file of ["web-ifc.wasm", "web-ifc-mt.wasm"]) {
  const src = path.join(webIfcDir, file);
  const dst = path.join(outDir, file);
  fs.copyFileSync(src, dst);
}

console.log(`Synced wasm from ${webIfcDir} to ${outDir}`);
