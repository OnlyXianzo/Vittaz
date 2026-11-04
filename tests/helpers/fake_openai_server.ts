import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
export interface RecordedOpenAIRequest {
  index: number;
  apiKey: string | null;
  rawBody: string;
  parsedBody: Record<string, unknown> | null;
}
export interface FakeResponsePlan {
  status?: number;
  headers?: Record<string, string>;
  content?: string | null;
  toolCalls?: unknown[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  wireChunks?: string[];
  omitDone?: boolean;
  abortAfterChunks?: number;
  delayMs?: number;
}
export type FakeResponder = (
  request: RecordedOpenAIRequest,
) => FakeResponsePlan | Promise<FakeResponsePlan>;
export async function startFakeOpenAIServer(responder?: FakeResponder) {
  const recordedRequests: RecordedOpenAIRequest[] = [];
  let respond = responder;
  let closed = false;
  const server = createServer({ requestTimeout: 2000 }, (req, res) => {
    const pieces: Buffer[] = [];
    let size = 0;
    req.on("data", (piece: Buffer) => {
      size += piece.length;
      if (size <= 65536) pieces.push(piece);
    });
    req.on("error", () => res.destroy());
    req.on("end", () => {
      void (async () => {
        const json = (
          status: number,
          value: unknown,
          headers: Record<string, string> = {},
        ) => {
          res.writeHead(status, {
            "Content-Type": "application/json",
            ...headers,
          });
          res.end(JSON.stringify(value));
        };
        if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
          json(404, { error: { message: "synthetic_not_found" } });
          return;
        }
        if (size > 65536) {
          json(413, { error: { message: "synthetic_body_limit" } });
          return;
        }
        const rawBody = Buffer.concat(pieces).toString("utf8");
        let parsedBody: Record<string, unknown> | null = null;
        try {
          const parsed: unknown = JSON.parse(rawBody);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
            parsedBody = parsed as Record<string, unknown>;
        } catch {
          /* malformed fixture */
        }
        if (!parsedBody) {
          json(400, { error: { message: "synthetic_bad_json" } });
          return;
        }
        const record: RecordedOpenAIRequest = {
          index: recordedRequests.length,
          apiKey:
            /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1] ??
            null,
          rawBody,
          parsedBody,
        };
        recordedRequests.push(record);
        try {
          const plan = respond
            ? await respond(record)
            : { content: "Synthetic OK" };
          if (plan.delayMs)
            await new Promise((resolve) => setTimeout(resolve, plan.delayMs));
          if (res.destroyed) return;
          if (plan.status && plan.status !== 200) {
            json(
              plan.status,
              { error: { message: "synthetic_http_failure" } },
              plan.headers,
            );
            return;
          }
          const usage = plan.usage ?? {
            prompt_tokens: 2,
            completion_tokens: 1,
            total_tokens: 3,
          };
          if (parsedBody.stream) {
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
            });
            const chunks = plan.wireChunks ?? [
              `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: plan.content ?? "" }, finish_reason: null }] })}\n\n`,
              `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage })}\n\n`,
            ];
            for (let i = 0; i < chunks.length; i++) {
              res.write(chunks[i]);
              if (
                plan.abortAfterChunks !== undefined &&
                i + 1 >= plan.abortAfterChunks
              ) {
                res.destroy();
                return;
              }
            }
            if (!plan.omitDone) res.write("data: [DONE]\n\n");
            res.end();
          } else
            json(200, {
              id: "chatcmpl_synthetic",
              object: "chat.completion",
              model: parsedBody.model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: plan.content ?? null,
                    ...(plan.toolCalls ? { tool_calls: plan.toolCalls } : {}),
                  },
                  finish_reason: plan.toolCalls ? "tool_calls" : "stop",
                },
              ],
              usage,
            });
        } catch {
          if (!res.headersSent)
            json(500, { error: { message: "synthetic_responder_failure" } });
          else res.destroy();
        }
      })();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    port,
    recordedRequests,
    setResponder(next: FakeResponder) {
      respond = next;
    },
    clearRequests() {
      recordedRequests.length = 0;
    },
    async close() {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}
