#!/usr/bin/env node

// src/cli.ts
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgRoot = existsSync(join(__dirname, "package.json")) ? __dirname : resolve(__dirname, "..");
async function readPkg() {
  return JSON.parse(
    await import("node:fs/promises").then(
      (fs) => fs.readFile(join(pkgRoot, "package.json"), "utf-8")
    )
  );
}
async function cmdVersion() {
  const pkg = await readPkg();
  console.log(pkg.version);
}
async function cmdInit(name, opts) {
  const targetDir = resolve(process.cwd(), name);
  if (existsSync(targetDir)) {
    console.error(`Directory ${name} already exists.`);
    process.exit(1);
  }
  const pkg = await readPkg();
  const typesNodeVersion = pkg.devDependencies?.["@types/node"] || "^22";
  if (opts.ssr) {
    await generateReactSsr(targetDir, name, pkg.version, typesNodeVersion, opts.skipInstall);
  } else {
    await generateMinimal(targetDir, name, pkg.version, typesNodeVersion, opts.skipInstall);
  }
}
async function generateMinimal(targetDir, name, version, typesNodeVersion, skipInstall) {
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    join(targetDir, "app.ts"),
    [
      `import { Router } from 'weifuwu'`,
      ``,
      `export const app = new Router()`,
      ``,
      `app.get('/', () => new Response('Hello from ${name}!'))`,
      `app.get('/api/ping', () => Response.json({ pong: true, time: new Date().toISOString() }))`,
      ``
    ].join("\n")
  );
  await writeFile(
    join(targetDir, "index.ts"),
    [
      `import { loadEnv, serve } from 'weifuwu'`,
      `import { app } from './app.ts'`,
      ``,
      `loadEnv()`,
      `const port = Number(process.env.PORT) || 3000`,
      `serve(app.handler(), { port })`,
      ``
    ].join("\n")
  );
  await writePackageJson(targetDir, name, version, typesNodeVersion, {});
  await writeCommonFiles(targetDir);
  await finishInit(targetDir, skipInstall);
}
async function generateReactSsr(targetDir, name, version, typesNodeVersion, skipInstall) {
  const templateDir = join(pkgRoot, "cli", "template", "react");
  await copyRecursive(templateDir, targetDir);
  await writePackageJson(targetDir, name, version, typesNodeVersion, {
    dependencies: {
      react: "^19",
      "react-dom": "^19",
      "@tailwindcss/postcss": "^4",
      tailwindcss: "^4",
      postcss: "^8"
    },
    devDependencies: {
      "@types/react": "^19",
      "@types/react-dom": "^19",
      esbuild: "^0.28"
    }
  });
  await writeFile(join(targetDir, ".gitignore"), "node_modules\n.env\n.weifuwu\n");
  await finishInit(targetDir, skipInstall);
}
async function copyRecursive(src, dest) {
  const { readdir, stat, copyFile } = await import("node:fs/promises");
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true });
      await copyRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
    }
  }
}
async function writePackageJson(targetDir, name, version, typesNodeVersion, extra) {
  const pkg = {
    name,
    type: "module",
    scripts: {
      dev: "node --watch index.ts",
      start: "node index.ts"
    },
    dependencies: {
      weifuwu: "^" + version
    },
    devDependencies: {
      "@types/node": typesNodeVersion
    }
  };
  if (extra) {
    if (extra.dependencies) {
      Object.assign(pkg.dependencies, extra.dependencies);
    }
    if (extra.devDependencies) {
      Object.assign(pkg.devDependencies, extra.devDependencies);
    }
  }
  await writeFile(join(targetDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
}
async function writeCommonFiles(targetDir) {
  await writeFile(join(targetDir, ".gitignore"), "node_modules\n.env\n.weifuwu\n");
  await writeFile(join(targetDir, ".env"), "PORT=3000\n");
}
async function finishInit(targetDir, skipInstall) {
  if (!skipInstall) {
    console.log("\nInstalling dependencies...");
    execSync("npm install", { cwd: targetDir, stdio: "inherit" });
  }
  console.log(`
\u2705 Created ${targetDir.split("/").pop()}/`);
  console.log(`   cd ${targetDir.split("/").pop()}`);
  if (skipInstall) console.log(`   npm install`);
  console.log(`   npm run dev`);
}
const cmd = process.argv[2];
const HELP = `
weifuwu \u2014 Web-standard HTTP microframework for Node.js

Usage:
  npx weifuwu init <name>                Create a new API project
  npx weifuwu init <name> --ssr          Create a React SSR project
  npx weifuwu init <name> --skip-install  Skip npm install
  npx weifuwu version                    Print version
`;
if (cmd === "version" || cmd === "-v" || cmd === "--version") {
  cmdVersion().catch(console.error);
} else if (cmd === "init") {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(3),
    options: {
      "skip-install": { type: "boolean" },
      "ssr": { type: "boolean" },
      "react": { type: "boolean" }
    },
    strict: false,
    allowPositionals: true
  });
  const name = positionals[0];
  if (!name) {
    console.error("Usage: npx weifuwu init <name> [--ssr] [--skip-install]");
    process.exit(1);
  }
  cmdInit(name, {
    skipInstall: !!values["skip-install"],
    ssr: !!(values["ssr"] || values["react"])
  }).catch(
    console.error
  );
} else {
  console.log(HELP);
}
