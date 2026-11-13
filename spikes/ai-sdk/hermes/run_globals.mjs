/**
 * Runtime-globals harness (faithful configuration).
 *
 * Runs the Babel-transformed AI SDK bundle in an isolated VM context containing
 * ONLY the globals React Native 0.88 + Expo SDK 58 provide natively on device:
 *   - web streams + TextDecoder/TextEncoder/TextDecoderStream:
 *       Hermes V1 (RN 0.88) + Expo winter runtime. Injected here as *native*
 *       globals (outside the bundle) exactly as they are on device; they are
 *       NOT bundled JS in a real app (expo declares web-streams-polyfill only
 *       as a devDependency).
 *   - structuredClone, URL, URLSearchParams, DOMException, fetch: Expo winter.
 *   - AbortController/AbortSignal: react-native/Libraries/Core/setUpXHR.js.
 * No Node globals (process, Buffer, require, module, crypto) are present.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import structuredClonePolyfill from "@ungap/structured-clone";

const bundle = readFileSync(new URL("./dist/app.js", import.meta.url), "utf8");

class TextDecoderStreamShim extends TransformStream {
  constructor(label = "utf-8") {
    const decoder = new TextDecoder(label);
    super({
      transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true });
        if (text) controller.enqueue(text);
      },
    });
  }
}
class TextEncoderStreamShim extends TransformStream {
  constructor() {
    const encoder = new TextEncoder();
    super({
      transform(chunk, controller) {
        const bytes = encoder.encode(chunk);
        if (bytes.byteLength) controller.enqueue(bytes);
      },
    });
  }
}

function makeContext({ textDecoder = true, streams = true } = {}) {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    TextEncoder,
    structuredClone: structuredClonePolyfill,
    URL,
    URLSearchParams,
    DOMException,
    AbortController,
    AbortSignal,
    Intl,
    // react-native/Libraries/Core/setUpGlobals.js: global.process = {}; process.env = {}
    process: { env: { NODE_ENV: "production" } },
    // react-native whatwg-fetch polyfill chain (Expo winter runtime expects these).
    Headers,
    Request,
    Response,
    fetch,
    btoa: (value) => Buffer.from(String(value), "binary").toString("base64"),
    atob: (value) => Buffer.from(String(value), "base64").toString("binary"),
  };
  if (streams) {
    sandbox.ReadableStream = ReadableStream;
    sandbox.WritableStream = WritableStream;
    sandbox.TransformStream = TransformStream;
  }
  if (textDecoder) {
    sandbox.TextDecoder = TextDecoder;
    sandbox.TextDecoderStream = TextDecoderStreamShim;
    sandbox.TextEncoderStream = TextEncoderStreamShim;
  }
  return vm.createContext(sandbox, { name: "rn-expo-native-surface" });
}

const captured = [];
const originalLog = console.log;
console.log = (...args) => {
  const line = args.map(String).join(" ");
  if (line.startsWith("##RESULT##")) {
    captured.push(...JSON.parse(line.slice("##RESULT##".length)));
    return;
  }
  if (line.startsWith("##FATAL##")) {
    captured.push({ name: "fatal", ok: false, error: line.slice("##FATAL##".length).slice(0, 300) });
    return;
  }
  originalLog(...args);
};

for (const [label, options] of [
  ["RUN 1 — full RN 0.88 + Expo 58 native surface", {}],
  ["RUN 2 — WITHOUT TextDecoder (pre-RN 0.88 / pre-Expo 58)", { textDecoder: false }],
  ["RUN 3 — WITHOUT ReadableStream/TransformStream", { streams: false }],
]) {
  originalLog(`\n########## ${label}`);
  captured.length = 0;
  try {
    vm.runInContext(bundle, makeContext(options), { filename: "app.js", timeout: 120_000 });
  } catch (error) {
    const stack = String(error?.stack ?? error).split("\n");
    const site = stack.find((line) => line.includes("at ") && !line.includes("__require") && !line.includes("__init")) ?? "";
    originalLog(`  EVALUATION FAILURE: ${error?.name}: ${error?.message}`);
    originalLog(`  at ${site.trim().slice(0, 150)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (!captured.length) originalLog("  (no results captured)");
  for (const entry of captured) {
    const { name, ok, ...rest } = entry;
    const detail = JSON.stringify(ok && rest.value !== undefined ? rest.value : rest).slice(0, 200);
    originalLog(`  ${entry.ok ? "PASS" : "FAIL"}  ${entry.name.padEnd(18)} ${detail}`);
  }
}
process.exit(0);
