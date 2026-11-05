import { expect, test, vi } from "vitest";
import { runKeylessSmoke } from "./keyless_smoke.js";
const model = (id = "synthetic/model:free", price = "0", tools = true) => ({
  id,
  pricing: { prompt: price, completion: price },
  supported_parameters: tools ? ["tools"] : [],
});
const catalog = (data: unknown[] = [model()]) => Response.json({ data });
const reply = () =>
  Response.json({ choices: [{ message: { content: "Synthetic reply" } }] });
const tool = (args = '{"value":"synthetic"}') =>
  Response.json({
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              id: "synthetic_call",
              type: "function",
              function: { name: "synthetic_echo", arguments: args },
            },
          ],
        },
      },
    ],
  });
function fake(responses: Response[]) {
  return vi.fn<typeof fetch>(async () => {
    const r = responses.shift();
    if (!r) throw new Error("unexpected_network_call");
    return r;
  });
}
test("keyless_smoke_uses_actual_adapter_fixed_origin_no_auth_and_three_requests", async () => {
  const send = fake([catalog(), reply(), tool()]);
  expect(await runKeylessSmoke(send)).toEqual({ status: "ok", requests: 3 });
  expect(send).toHaveBeenCalledTimes(3);
  for (const [url, init] of send.mock.calls) {
    expect(String(url)).toMatch(
      /^https:\/\/ai-gateway\.kilo\.ai\/api\/v1\/(models|chat\/completions)$/,
    );
    expect(init?.redirect).toBe("error");
    expect(init?.credentials).toBe("omit");
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  }
  const body = JSON.parse(send.mock.calls[1]![1]!.body as string);
  expect(body.model).toBe("synthetic/model:free");
  expect(body.max_completion_tokens).toBe(512);
  expect(body.messages).toEqual([
    {
      role: "user",
      content: "This is synthetic test data. Reply with a short greeting.",
    },
  ]);
});
test("keyless_smoke_refuses_paid_missing_price_and_non_tool_models", async () => {
  for (const data of [
    [model("synthetic/paid")],
    [model(undefined, "0.01")],
    [model(undefined, "")],
    [model(undefined, "0", false)],
    [{ id: "synthetic/missing:free" }],
  ]) {
    const send = fake([catalog(data)]);
    await expect(runKeylessSmoke(send)).rejects.toThrow(
      "Live smoke unavailable",
    );
    expect(send).toHaveBeenCalledTimes(1);
  }
});
test("keyless_smoke_stops_cleanly_on429_at_every_stage", async () => {
  for (let stage = 0; stage < 3; stage++) {
    const responses = [catalog(), reply(), tool()].slice(0, stage);
    const send = fake([...responses, new Response(null, { status: 429 })]);
    expect(await runKeylessSmoke(send)).toEqual({
      status: "rate_limited",
      requests: stage + 1,
    });
    expect(send).toHaveBeenCalledTimes(stage + 1);
  }
});
test("keyless_smoke_never_retries_provider_errors_or_uses_another_model", async () => {
  const send = fake([
    catalog([model("synthetic/a:free"), model("synthetic/b:free")]),
    new Response(null, { status: 503 }),
  ]);
  await expect(runKeylessSmoke(send)).rejects.toThrow("Live smoke unavailable");
  expect(send).toHaveBeenCalledTimes(2);
  const network = vi.fn<typeof fetch>(async () => {
    throw new Error("untrusted_response_details");
  });
  await expect(runKeylessSmoke(network)).rejects.toThrow(
    /^Live smoke unavailable$/,
  );
  expect(network).toHaveBeenCalledTimes(1);
});
test("keyless_smoke_requires_tool_json_shape_without_executing_tools", async () => {
  for (const args of ["not_json", "null", '{"extra":1}', '{"value":7}']) {
    const send = fake([catalog(), reply(), tool(args)]);
    await expect(runKeylessSmoke(send)).rejects.toThrow(
      "Live smoke unavailable",
    );
    expect(send).toHaveBeenCalledTimes(3);
  }
});
test("keyless_smoke_bounds_catalog_body_and_rejects_bad_catalog", async () => {
  for (const r of [
    new Response("x".repeat(4 * 1024 * 1024 + 1)),
    Response.json({ data: null }),
    new Response("not_json"),
  ]) {
    const send = fake([r]);
    await expect(runKeylessSmoke(send)).rejects.toThrow(
      "Live smoke unavailable",
    );
    expect(send).toHaveBeenCalledTimes(1);
  }
});

test("keyless_smoke_rejects_empty_reply_wrong_tool_and_oversized_chat_without_retry", async () => {
  const wrongTool = Response.json({
    choices: [
      {
        message: {
          tool_calls: [
            {
              function: {
                name: "unexpected_tool",
                arguments: '{"value":"synthetic"}',
              },
            },
          ],
        },
      },
    ],
  });
  for (const responses of [
    [catalog(), Response.json({ choices: [{ message: { content: "" } }] })],
    [catalog(), new Response("x".repeat(65537))],
    [catalog(), reply(), wrongTool],
    [catalog(), reply(), reply()],
  ]) {
    const count = responses.length;
    const send = fake(responses);
    await expect(runKeylessSmoke(send)).rejects.toThrow(
      /^Live smoke unavailable$/,
    );
    expect(send).toHaveBeenCalledTimes(count);
  }
});
