// Baut den Sammler zu einer einzigen Datei und legt den Deploy-Ordner für den Pi an.
// Danach auf ValePC: pi-dashboard/scripts/deploy.ps1 -Path <repo>\dist\pi\minecraft-tracker
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist", "pi", "minecraft-tracker");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "deploy", "pi", "minecraft-tracker"), out, { recursive: true });

await build({
  entryPoints: [join(root, "apps", "collector", "src", "index.ts")],
  outfile: join(out, "collector.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  minify: true,
  legalComments: "none",
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});

console.log(`Fertig: ${out}`);
