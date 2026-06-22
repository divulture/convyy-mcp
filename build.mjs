import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { build } from "esbuild";

const shared = {
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  packages: "external",
  logLevel: "info",
};

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/dev", { recursive: true });

await Promise.all([
  build({
    ...shared,
    entryPoints: ["src/index.ts"],
    outfile: "dist/index.js",
  }),
  build({
    ...shared,
    entryPoints: ["src/browser.ts"],
    outfile: "dist/browser.js",
  }),
  build({
    ...shared,
    entryPoints: ["src/server.ts"],
    outfile: "dist/server.js",
    banner: {
      js: "#!/usr/bin/env node",
    },
  }),
  build({
    ...shared,
    entryPoints: ["src/dev/devRelayCli.ts"],
    outfile: "dist/dev/devRelayCli.js",
    banner: {
      js: "#!/usr/bin/env node",
    },
  }),
]);

chmodSync("dist/server.js", 0o755);
chmodSync("dist/dev/devRelayCli.js", 0o755);
