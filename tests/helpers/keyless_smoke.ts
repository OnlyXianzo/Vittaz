import { KeyPool } from "../../packages/agent/src/key_pool.js";
import { OpenAICompatibleClient } from "../../packages/agent/src/provider_client.js";
const base = "https://ai-gateway.kilo.ai/api";
const zero = (v: unknown) => typeof v === "string" && /^0(?:\.0+)?$/.test(v);
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
function selectModel(value: unknown): string {
  if (!object(value) || !Array.isArray(value.data) || value.data.length > 10000)
    throw new Error();
  const ids = value.data
    .filter(
      (m: unknown) =>
        object(m) &&
        typeof m.id === "string" &&
        /^[a-zA-Z0-9_./-]{1,120}:free$/.test(m.id) &&
        object(m.pricing) &&
        zero(m.pricing.prompt) &&
        zero(m.pricing.completion) &&
        Array.isArray(m.supported_parameters) &&
        m.supported_parameters.includes("tools"),
    )
    .map((m: Record<string, unknown>) => m.id as string)
    .sort();
  if (!ids.length) throw new Error();
  return ids[0]!;
}
async function bounded(response: Response, limit: number): Promise<Response> {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error();
      chunks.push(value);
    }
  } catch {
    await reader.cancel();
    throw new Error();
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(bytes, {
    status: response.status,
    headers: response.headers,
  });
}
/** Test-only: no env keys, app data, tool execution, redirects, retries or paid fallback. */
export async function runKeylessSmoke(
  send: typeof fetch = fetch,
): Promise<{ status: "ok" | "rate_limited"; requests: number }> {
  let requests = 0;
  let throttled = false;
  let model: string | undefined;
  const guard: typeof fetch = async (input, init) => {
    const url = String(input);
    const catalog = url === `${base}/v1/models` && init?.method === "GET";
    const chat =
      url === `${base}/v1/chat/completions` && init?.method === "POST";
    if (
      throttled ||
      requests >= 3 ||
      (!catalog && !chat) ||
      new Headers(init?.headers).has("authorization")
    )
      throw new Error();
    if (chat) {
      const body = JSON.parse(init?.body as string);
      if (!model || body.model !== model || body.max_completion_tokens !== 512)
        throw new Error();
    }
    requests++;
    const deadline = AbortSignal.timeout(20000);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, deadline])
      : deadline;
    const response = await send(url, {
      ...init,
      signal,
      redirect: "error",
      credentials: "omit",
    });
    if (response.status === 429) {
      throttled = true;
      await response.body?.cancel();
      throw new Error();
    }
    return bounded(response, catalog ? 4 * 1024 * 1024 : 65536);
  };
  try {
    const response = await guard(`${base}/v1/models`, { method: "GET" });
    if (!response.ok) throw new Error();
    model = selectModel(await response.json());
    const client = new OpenAICompatibleClient({
      baseUrl: base,
      fetch: guard,
      timeoutMs: 20000,
      keyPool: new KeyPool([{ nickname: "keyless_free", apiKey: "", model }]),
    });
    const reply = await client.chatCompletion({
      maxCompletionTokens: 512,
      messages: [
        {
          role: "user",
          content: "This is synthetic test data. Reply with a short greeting.",
        },
      ],
    });
    if (!reply.content.trim() || reply.toolCalls.length) throw new Error();
    const result = await client.chatCompletion({
      maxCompletionTokens: 512,
      messages: [
        {
          role: "user",
          content:
            "This is synthetic test data. Call synthetic_echo with value synthetic. Do not answer in prose.",
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "synthetic_echo",
            description:
              "Return a synthetic test value. No real action is performed.",
            parameters: {
              type: "object",
              properties: {
                value: { type: "string", minLength: 1, maxLength: 32 },
              },
              required: ["value"],
              additionalProperties: false,
            },
          },
        },
      ],
    });
    if (
      result.toolCalls.length !== 1 ||
      result.toolCalls[0]!.function.name !== "synthetic_echo"
    )
      throw new Error();
    const args: unknown = JSON.parse(result.toolCalls[0]!.function.arguments);
    if (
      !object(args) ||
      Object.keys(args).length !== 1 ||
      typeof args.value !== "string" ||
      args.value.length < 1 ||
      args.value.length > 32
    )
      throw new Error();
    return { status: "ok", requests };
  } catch {
    if (throttled) return { status: "rate_limited", requests };
    throw new Error("Live smoke unavailable");
  }
}
