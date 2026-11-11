import { streamText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { startFakeServer, textChunks } from "./fake_server.mjs";

const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
process.on("unhandledRejection", (e) => {
  console.log("  !! unhandledRejection:", e?.constructor?.name, String(e?.message).slice(0, 60));
});

function providerFor(url) {
  return createOpenAICompatible({ name: "fake", baseURL: url, apiKey: "k" })("m");
}

console.log("=== D: cancellation semantics (abort mid-stream) ===");
{
  const server = await startFakeServer(() => ({ sse: textChunks("abcdefghijklmnop"), delayMs: 50 }));
  const ac = new AbortController();
  let received = 0;
  let loopThrew = null;
  const st = streamText({ model: providerFor(server.baseURL), prompt: "x", abortSignal: ac.signal, maxRetries: 0 });
  try {
    for await (const part of st.textStream) {
      received++;
      if (received === 2) ac.abort();
    }
  } catch (e) {
    loopThrew = e;
  }
  // let any async aftermath settle
  await new Promise((r) => setTimeout(r, 250));
  let finish = "?";
  try {
    finish = String(st.finishReason);
  } catch (e) {
    finish = `threw:${e?.constructor?.name}`;
  }
  let text = "";
  try {
    text = await st.text;
  } catch (e) {
    text = `threw:${e?.constructor?.name}`;
  }
  console.log(`  received=${received} loopThrew=${loopThrew?.constructor?.name ?? "none"} loopErrName=${loopThrew?.name} finishReason=${finish} finalText=${JSON.stringify(text)}`);
  console.log(`  -> abort is observable via finishReason="${finish}" (no exception)`);
  await server.close();
}

console.log("\n=== G: in-band SSE error object ===");
{
  const server = await startFakeServer(() => ({
    sse: [`data: ${JSON.stringify({ error: { message: "mid-stream failure", type: "server_error" } })}\n\n`],
  }));
  const unhandled = [];
  const handler = (e) => unhandled.push(e);
  process.on("unhandledRejection", handler);
  let loopThrew = null;
  let text = "";
  const st = streamText({ model: providerFor(server.baseURL), prompt: "x", maxRetries: 0 });
  try {
    for await (const part of st.textStream) text += part;
  } catch (e) {
    loopThrew = e;
  }
  await new Promise((r) => setTimeout(r, 300));
  process.off("unhandledRejection", handler);
  console.log(`  textStreamThrew=${JSON.stringify(loopThrew?.constructor?.name ?? null)} text=${JSON.stringify(text)} unhandledRejections=${unhandled.length}${unhandled[0] ? ` (${unhandled[0].constructor.name}: ${unhandled[0].message})` : ""}`);
  // Does the result promise surface it?
  let viaText = "?";
  try { await st.text; viaText = "resolved"; } catch (e) { viaText = `threw ${e?.constructor?.name}`; }
  console.log(`  awaiting result.text -> ${viaText}`);
  await server.close();
}

console.log("\n=== G2: same, but consumer awaits result.text / result.response ===");
{
  const server = await startFakeServer(() => ({
    sse: [`data: ${JSON.stringify({ error: { message: "mid-stream failure", type: "server_error" } })}\n\n`],
  }));
  const st = streamText({ model: providerFor(server.baseURL), prompt: "x", maxRetries: 0 });
  let r = "?";
  try {
    r = JSON.stringify((await st.text).slice(0, 20));
  } catch (e) {
    r = `threw ${e?.constructor?.name}: ${String(e?.message).slice(0, 50)}`;
  }
  console.log(`  await result.text -> ${r}`);
  await server.close();
}
process.exit(0);
