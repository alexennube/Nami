import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, writeFile } from "fs/promises";

const allowlist = [
  "express",
  "cookie-parser",
  "ws",
  "zod",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "dist/index.mjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    banner: {
      js: 'import { createRequire } from "module"; import { fileURLToPath as __bundled_fileURLToPath } from "url"; import { dirname as __bundled_dirname } from "path"; const require = createRequire(import.meta.url); const __filename = __bundled_fileURLToPath(import.meta.url); const __dirname = __bundled_dirname(__filename);',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  await writeFile("dist/index.cjs", 'import("./index.mjs");\n');
  console.log("wrote dist/index.cjs wrapper");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
