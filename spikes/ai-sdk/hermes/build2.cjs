// Single faithful bundle: only the AI SDK + our entry. Web APIs are injected as
// native globals by the runner (they are native on RN 0.88 / Expo 58).
const { execFileSync } = require("node:child_process");
const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const here = __dirname;
const repoRoot = require("node:path").resolve(here, "../../..");
const mobileModules = require("node:path").join(repoRoot, "apps/mobile/node_modules");
const spikeModules = require("node:path").join(repoRoot, "spikes/ai-sdk/node_modules");
const { transformSync } = require(join(mobileModules, "@babel/core"));
const expoPreset = require(join(mobileModules, "babel-preset-expo"));

mkdirSync(join(here, "dist"), { recursive: true });
const raw = join(here, "dist/app.raw.js");
const babelised = join(here, "dist/app.babel.js");
const final = join(here, "dist/app.js");
const alias = ["--alias:fs=./stubs/fs.js", "--alias:path=./stubs/path.js", "--alias:os=./stubs/os.js"];
execFileSync(join(spikeModules, ".bin/esbuild"), [join(here, "entry.mjs"), "--bundle", "--format=iife", "--target=es2020", "--platform=neutral", `--outfile=${raw}`, "--log-level=error", "--log-limit=0", ...alias], { cwd: here, stdio: "pipe" });
const code = readFileSync(raw, "utf8");
const result = transformSync(code, { filename: raw, babelrc: false, configFile: false, sourceType: "script", compact: false, presets: [[expoPreset, {}]], caller: { name: "metro", bundler: "metro", platform: "android", engine: "hermes", isDev: false, isServer: false, supportsStaticESM: false } });
writeFileSync(babelised, result.code);
execFileSync(join(spikeModules, ".bin/esbuild"), [babelised, "--bundle", "--format=iife", "--target=es2017", "--platform=neutral", `--outfile=${final}`, "--log-level=error", "--log-limit=0", "--resolve-extensions=.js,.mjs,.cjs,.json", `--alias:@babel/runtime=${join(mobileModules, "@babel/runtime")}`, ...alias], { cwd: here, stdio: "pipe" });
console.log(`app.js ${readFileSync(final).length} bytes`);
