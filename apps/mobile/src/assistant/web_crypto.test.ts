import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { LedgerStore } from "@vittaz/core";
import { install_web_crypto } from "./web_crypto";
import { create_mobile_qa_agent } from "./mobile_qa";

// Back the polyfill with a deterministic stand-in for the native CSPRNG so the
// test asserts wiring, not randomness quality.
jest.mock("expo-crypto", () => ({
  getRandomValues: jest.fn((array: Uint8Array) => {
    for (let index = 0; index < array.length; index++)
      array[index] = (index * 7 + 1) & 0xff;
    return array;
  }),
  randomUUID: jest.fn(() => "11111111-1111-4111-8111-111111111111"),
}));

const original_crypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");

/** Simulate Hermes: no Web Crypto global at all. */
function remove_global_crypto(): void {
  Object.defineProperty(globalThis, "crypto", {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (original_crypto)
    Object.defineProperty(globalThis, "crypto", original_crypto);
});

function ledger_double(): LedgerStore {
  return {
    read: async (work: (repos: never) => Promise<unknown>) =>
      work({ transactions: { list: async () => [] } } as never),
    transaction: jest.fn(),
    close: jest.fn(async () => undefined),
  } as unknown as LedgerStore;
}

function ok_fetch() {
  return jest.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: "Synthetic answer", tool_calls: [] } },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        }),
        { headers: { "content-type": "application/json" } },
      ),
  ) as unknown as typeof fetch;
}

describe("web_crypto polyfill for Hermes (no global crypto.getRandomValues)", () => {
  it("reproduces the device failure: without the polyfill the question fails before any HTTP", async () => {
    remove_global_crypto();
    const fetch_impl = ok_fetch();
    const agent = create_mobile_qa_agent(
      ledger_double(),
      { kind: "kilo", api_key: null },
      fetch_impl,
    );
    const answer = await agent.answerQuestion("Synthetic question");
    expect(answer.answered).toBe(false);
    expect(answer.stopReason).toBe("provider_error");
    // The LangChain run-id step throws before the provider is ever called.
    expect(fetch_impl).not.toHaveBeenCalled();
  });

  it("fixes the device failure: installing the polyfill lets the question answer end-to-end", async () => {
    remove_global_crypto();
    install_web_crypto();
    expect(typeof globalThis.crypto.getRandomValues).toBe("function");
    const fetch_impl = ok_fetch();
    const agent = create_mobile_qa_agent(
      ledger_double(),
      { kind: "kilo", api_key: null },
      fetch_impl,
    );
    const answer = await agent.answerQuestion("Synthetic question");
    expect(answer.answered).toBe(true);
    expect(answer.answer).toBe("Synthetic answer");
    expect(fetch_impl).toHaveBeenCalledTimes(1);
  });

  it("never replaces an existing native getRandomValues (Node/web)", () => {
    const native = jest.fn();
    Object.defineProperty(globalThis, "crypto", {
      value: { getRandomValues: native },
      configurable: true,
      writable: true,
    });
    install_web_crypto();
    expect(globalThis.crypto.getRandomValues).toBe(native);
  });
});
