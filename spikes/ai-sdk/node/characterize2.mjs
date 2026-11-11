import { streamText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { startFakeServer } from "./fake_server.mjs";

const mark = (s) => console.log(`>>> ${s}`);
process.on("uncaughtException", (e) => mark(`UNCAUGHT EXCEPTION: ${e?.constructor?.name}: ${String(e?.message).slice(0, 60)}`));
process.on("unhandledRejection", (e) => mark(`UNHANDLED REJECTION: ${e?.constructor?.name}: ${String(e?.message).slice(0, 60)}`));

const server = await startFakeServer(() => ({
  sse: [`data: ${JSON.stringify({ error: { message: "mid-stream failure", type: "server_error" } })}\n\n`],
}));
const model = createOpenAICompatible({ name: "fake", baseURL: server.baseURL, apiKey: "k" })("m");

// Case 1: iterate textStream only
{
  const st = streamText({ model, prompt: "x", maxRetries: 0 });
  let threw = null;
  let text = "";
  try {
    for await (const p of st.textStream) text += p;
  } catch (e) {
    threw = e;
  }
  await new Promise((r) => setTimeout(r, 100));
  let finish = "?";
  try { finish = await st.finishReason; } catch (e) { finish = `threw:${e?.constructor?.name}`; }
  mark(`CASE1 textStream: threw=${threw?.constructor?.name ?? "none"} text=${JSON.stringify(text)} finishReason=${finish}`);
}

// Case 2: await result.text without iterating
{
  const st = streamText({ model, prompt: "x", maxRetries: 0 });
  let r;
  try { r = JSON.stringify(await st.text); } catch (e) { r = `threw ${e?.constructor?.name}: ${String(e?.message).slice(0, 40)}`; }
  mark(`CASE2 await result.text: ${r}`);
}

// Case 3: with error handler? does the SDK expose onError for stream error?
{
  const st = streamText({ model, prompt: "x", maxRetries: 0, onError: (e) => mark(`CASE3 onError: ${e?.constructor?.name}: ${String(e?.message).slice(0, 40)}`) });
  try { for await (const _ of st.textStream) {} } catch (e) { mark(`CASE3 threw ${e?.constructor?.name}`); }
  await new Promise((r) => setTimeout(r, 100));
  let finish = "?";
  try { finish = await st.finishReason; } catch (e) { finish = `threw:${e?.constructor?.name}`; }
  mark(`CASE3 finishReason=${finish}`);
}

await server.close();
mark("DONE");
process.exit(0);
