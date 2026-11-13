import { afterEach, expect, test, vi } from "vitest";
import { bounded_fetch, MAX_RESPONSE_BYTES } from "./bounded_fetch.js";
import { ProtocolError, readText } from "../../http_body.js";

/**
 * The response ceiling has two implementations because React Native does not
 * always ship a `Response` and a `TransformStream` from the same polyfill. Both
 * branches are exercised here so neither rots, and so the fallback is a tested
 * behaviour rather than an untested assumption.
 */

const real_transform_stream = globalThis.TransformStream;
afterEach(() => {
  globalThis.TransformStream = real_transform_stream;
  vi.resetModules();
});

function respond_with(init: ResponseInit & { body?: string }): typeof fetch {
  const { body, ...response_init } = init;
  return (async () =>
    new Response(body ?? null, response_init)) as unknown as typeof fetch;
}

test("a declared length over the ceiling is refused before the body is read", async () => {
  const fetch_impl = respond_with({
    body: "x",
    headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) },
  });
  await expect(
    bounded_fetch(fetch_impl)(new URL("https://x.invalid")),
  ).rejects.toBeInstanceOf(ProtocolError);
});

test("a body that cannot be cancelled still fails closed", async () => {
  // Refusing the response must not depend on the teardown call succeeding.
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode("x"));
    },
    cancel() {
      throw new Error("synthetic cancel failure");
    },
  });
  const fetch_impl = (async () =>
    new Response(stream, {
      headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) },
    })) as unknown as typeof fetch;
  await expect(
    bounded_fetch(fetch_impl)(new URL("https://x.invalid")),
  ).rejects.toBeInstanceOf(ProtocolError);
});

test("a declared length inside the ceiling is passed through", async () => {
  const fetch_impl = respond_with({
    body: "synthetic",
    headers: { "content-length": "9" },
  });
  const response = await bounded_fetch(fetch_impl)(
    new URL("https://x.invalid"),
  );
  expect(await response.text()).toBe("synthetic");
});

test("a streamed body over the ceiling fails while it is still arriving", async () => {
  const fetch_impl = (async () =>
    new Response("x".repeat(MAX_RESPONSE_BYTES + 1), {
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
  const response = await bounded_fetch(fetch_impl)(
    new URL("https://x.invalid"),
  );
  await expect(async () => {
    for await (const piece of readText(response)) void piece;
  }).rejects.toBeInstanceOf(ProtocolError);
});

test("a bodyless response is returned untouched", async () => {
  const fetch_impl = respond_with({ status: 204 });
  const response = await bounded_fetch(fetch_impl)(
    new URL("https://x.invalid"),
  );
  expect(response.status).toBe(204);
  expect(response.body).toBeNull();
});

test("the ceiling still applies where a response cannot be rebuilt from a stream", async () => {
  // The React Native case measured on device-shaped runtimes: mixing a
  // TransformStream from one polyfill with a Response from another throws. A
  // fresh module instance re-runs the probe, and with the probe failing the
  // untouched response must still be handed back rather than the request
  // failing.
  vi.resetModules();
  globalThis.TransformStream = class {
    constructor() {
      throw new TypeError("synthetic polyfill mismatch");
    }
  } as unknown as typeof TransformStream;

  const fresh_module = await import("./bounded_fetch.js");
  const fresh = fresh_module.bounded_fetch;

  const ok = await fresh(respond_with({ body: "synthetic" }))(
    new URL("https://x.invalid"),
  );
  expect(await ok.text()).toBe("synthetic");

  // The declared-length check is the part that survives, and it still fails
  // closed on a response that admits to being oversized.
  await expect(
    fresh(
      respond_with({
        body: "x",
        headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) },
      }),
    )(new URL("https://x.invalid")),
    // The re-imported module has its own class identity, so the message is the
    // stable assertion here.
  ).rejects.toThrow("Invalid provider response");
});
