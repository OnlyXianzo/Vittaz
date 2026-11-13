import { createServer } from "node:http";

/**
 * Independent, fully configurable OpenAI-compatible endpoint used only for the
 * compatibility spike. Synthetic data only; no real provider is contacted.
 */
export async function startFakeServer(responder) {
  const requests = [];
  const server = createServer({ requestTimeout: 5000 }, (req, res) => {
    const pieces = [];
    let size = 0;
    req.on("data", (p) => {
      size += p.length;
      if (size <= 65536) pieces.push(p);
    });
    req.on("end", () => {
      void (async () => {
        if (req.method !== "POST") return void res.writeHead(404).end();
        const rawBody = Buffer.concat(pieces).toString("utf8");
        let parsed = null;
        try {
          parsed = JSON.parse(rawBody);
        } catch {}
        const record = {
          url: req.url,
          apiKey: /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1] ?? null,
          rawBody,
          body: parsed,
        };
        requests.push(record);
        const plan = await responder(record, requests.length - 1);
        if (plan.error) {
          res.writeHead(plan.error.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(plan.error.body));
          return;
        }
        if (plan.sse) {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          let i = 0;
          const push = () => {
            if (res.writableEnded || res.destroyed) return;
            if (i >= plan.sse.length) {
              if (plan.omitDone !== true) res.write("data: [DONE]\n\n");
              res.end();
              return;
            }
            res.write(plan.sse[i++]);
            setTimeout(push, plan.delayMs ?? 5);
          };
          push();
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(plan.json));
      })();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  return {
    baseURL: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise((r) => server.close(r)),
  };
}

export const sse = (chunks) => chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`);

export function textChunks(text, usage) {
  const out = sse(
    [...text].map((ch) => ({
      id: "c1",
      choices: [{ index: 0, delta: { content: ch }, finish_reason: null }],
    })),
  );
  if (usage) {
    out.push(
      `data: ${JSON.stringify({
        id: "c1",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage,
      })}\n\n`,
    );
  }
  return out;
}

export function toolCallChunks(name, argsJson, usage) {
  const out = sse([
    {
      id: "c1",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              { index: 0, id: "call_abc", type: "function", function: { name, arguments: "" } },
            ],
          },
          finish_reason: null,
        },
      ],
    },
    {
      id: "c1",
      choices: [
        {
          index: 0,
          delta: { tool_calls: [{ index: 0, function: { arguments: argsJson } }] },
          finish_reason: null,
        },
      ],
    },
    {
      id: "c1",
      choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
    },
  ]);
  if (usage) {
    out.push(
      `data: ${JSON.stringify({
        id: "c1",
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        usage,
      })}\n\n`,
    );
  }
  return out;
}
