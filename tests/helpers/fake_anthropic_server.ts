import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Minimal fake of Anthropic's `POST /v1/messages`, enough to exercise the
 * adapter over real HTTP and real SSE framing.
 *
 * It is deliberately modelled on `fake_openai_server.ts`: the point of a fake
 * server (rather than mocking `fetch`) is that the transport under test does
 * its own connection, header and stream handling for real.
 */
export interface RecordedAnthropicRequest {
  index: number;
  apiKey: string | null;
  version: string | null;
  rawBody: string;
  parsedBody: Record<string, unknown> | null;
}

/** A content block as Anthropic sends it. */
export type AnthropicBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  // Real Anthropic always pairs a thinking block with a signature; omitting it
  // makes the body invalid, so the fake must include it to be realistic.
  | { type: "thinking"; thinking: string; signature: string };

export interface FakeAnthropicPlan {
  status?: number;
  headers?: Record<string, string>;
  /** Non-streaming content blocks. */
  content?: AnthropicBlock[];
  usage?: { input_tokens: number; output_tokens: number };
  stop_reason?: string | null;
  /** Raw SSE text; overrides the generated stream when given. */
  sse?: string;
  /** Raw JSON body for a 200, bypassing the generated message shape. */
  rawBody?: unknown;
  /** Emit `event: error` mid-stream, after this many frames. */
  streamErrorAfterFrames?: number;
  /** Close the socket before the stream finishes. */
  abortAfterFrames?: number;
  omitMessageStop?: boolean;
  delayMs?: number;
}

export type FakeAnthropicResponder = (
  request: RecordedAnthropicRequest,
) => FakeAnthropicPlan | Promise<FakeAnthropicPlan>;

const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** The documented event sequence for a text answer. */
function text_stream(text: string, plan: FakeAnthropicPlan): string {
  return [
    frame("message_start", {
      type: "message_start",
      message: {
        id: "msg_synthetic",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [],
        usage: {
          input_tokens: plan.usage?.input_tokens ?? 2,
          output_tokens: 0,
        },
      },
    }),
    frame("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    ...Array.from(text).map((character) =>
      frame("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: character },
      }),
    ),
    frame("content_block_stop", { type: "content_block_stop", index: 0 }),
    frame("message_delta", {
      type: "message_delta",
      delta: { stop_reason: plan.stop_reason ?? "end_turn" },
      usage: { output_tokens: plan.usage?.output_tokens ?? 1 },
    }),
    frame("message_stop", { type: "message_stop" }),
  ].join("");
}

/** The documented event sequence for one `tool_use` block. */
function tool_stream(
  block: Extract<AnthropicBlock, { type: "tool_use" }>,
  plan: FakeAnthropicPlan,
): string {
  const json = JSON.stringify(block.input);
  return [
    frame("message_start", {
      type: "message_start",
      message: {
        id: "msg_synthetic",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [],
        usage: {
          input_tokens: plan.usage?.input_tokens ?? 2,
          output_tokens: 0,
        },
      },
    }),
    frame("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: {
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: {},
      },
    }),
    // Split the JSON so the transport has to assemble fragments, not echo one.
    ...Array.from(json).map((character) =>
      frame("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: character },
      }),
    ),
    frame("content_block_stop", { type: "content_block_stop", index: 0 }),
    frame("message_delta", {
      type: "message_delta",
      delta: { stop_reason: "tool_use" },
      usage: { output_tokens: plan.usage?.output_tokens ?? 1 },
    }),
    frame("message_stop", { type: "message_stop" }),
  ].join("");
}

export async function startFakeAnthropicServer(
  responder?: FakeAnthropicResponder,
) {
  const recordedRequests: RecordedAnthropicRequest[] = [];
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
        const json = (status: number, value: unknown) => {
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(value));
        };
        if (req.method !== "POST" || req.url !== "/v1/messages") {
          json(404, { type: "error", error: { type: "not_found_error" } });
          return;
        }
        if (size > 65536) {
          json(413, { type: "error", error: { type: "request_too_large" } });
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
          json(400, {
            type: "error",
            error: { type: "invalid_request_error" },
          });
          return;
        }
        const record: RecordedAnthropicRequest = {
          index: recordedRequests.length,
          apiKey: req.headers["x-api-key"]?.toString() ?? null,
          version: req.headers["anthropic-version"]?.toString() ?? null,
          rawBody,
          parsedBody,
        };
        recordedRequests.push(record);
        try {
          const plan = respond ? await respond(record) : {};
          if (plan.delayMs)
            await new Promise((resolve) => setTimeout(resolve, plan.delayMs));
          if (res.destroyed) return;
          if (plan.status && plan.status !== 200) {
            json(plan.status, {
              type: "error",
              error: { type: "synthetic_error", message: "synthetic_failure" },
            });
            return;
          }
          if (parsedBody.stream) {
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
            });
            const first = plan.content?.[0];
            const sse =
              plan.sse ??
              (first?.type === "tool_use"
                ? tool_stream(first, plan)
                : text_stream(first?.type === "text" ? first.text : "", plan));
            // Re-split on frame boundaries so we can stop mid-stream on demand.
            const frames = sse.split(/(?<=event: [a-z_]+?\n)/);
            for (let i = 0; i < frames.length; i++) {
              res.write(frames[i]);
              if (
                plan.abortAfterFrames !== undefined &&
                i + 1 >= plan.abortAfterFrames
              ) {
                res.destroy();
                return;
              }
              if (
                plan.streamErrorAfterFrames !== undefined &&
                i + 1 >= plan.streamErrorAfterFrames
              ) {
                res.write(
                  frame("error", {
                    type: "error",
                    error: { type: "overloaded_error", message: "synthetic" },
                  }),
                );
                res.end();
                return;
              }
            }
            if (plan.omitMessageStop) return res.destroy();
            res.end();
            return;
          }
          if (plan.rawBody !== undefined) {
            json(200, plan.rawBody);
            return;
          }
          json(200, {
            id: "msg_synthetic",
            type: "message",
            role: "assistant",
            model: parsedBody.model,
            content: plan.content ?? [{ type: "text", text: "" }],
            stop_reason: plan.stop_reason ?? "end_turn",
            usage: plan.usage ?? { input_tokens: 2, output_tokens: 1 },
          });
        } catch {
          if (!res.headersSent)
            json(500, { type: "error", error: { type: "api_error" } });
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
    setResponder(next: FakeAnthropicResponder) {
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
