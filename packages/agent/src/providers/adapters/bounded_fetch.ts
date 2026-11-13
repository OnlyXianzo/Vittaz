import { ProtocolError } from "../../http_body.js";

/**
 * The response ceiling the deleted transport enforced: one mebibyte, counted
 * across the whole body, streamed or not.
 *
 * The SDK's JSON reader accepts gigabytes and its SSE handler applies no
 * cumulative limit at all, so without this a hostile or broken endpoint could
 * exhaust a phone's memory before any of our own checks ran.
 */
export const MAX_RESPONSE_BYTES = 1048576;

/**
 * Put a byte ceiling in front of the SDK's own reading.
 *
 * The body is counted as it arrives, so an overrun is cancelled mid-flight
 * rather than buffered and then rejected.
 *
 * React Native does not always ship `Response` and `TransformStream` from the
 * same polyfill: wrapping one with the other throws `TypeError: the
 * "transform.readable" property must be an instance of ReadableStream`. That is
 * measured behaviour, not a hypothetical — so a runtime that cannot rebuild a
 * response falls back to the declared-length check above, and the adapters'
 * own bounds still apply to whatever was parsed.
 */
export function bounded_fetch(inner?: typeof fetch): typeof fetch {
  const base = inner ?? globalThis.fetch;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await base(input, init);

    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw new ProtocolError();
    }
    if (!response.body) return response;

    try {
      let size = 0;
      const body = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            size += chunk.byteLength;
            if (size > MAX_RESPONSE_BYTES) {
              controller.error(new ProtocolError());
              return;
            }
            controller.enqueue(chunk);
          },
        }),
      );
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch {
      return response;
    }
  }) as typeof fetch;
}
