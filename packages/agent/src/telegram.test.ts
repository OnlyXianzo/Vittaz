import type { AssistantService } from "@vittaz/core";
import { TelegramHttpError } from "./telegram.js";
import { createServer } from "node:http";
import { expect, test, vi } from "vitest";
import {
  TelegramConnector,
  TelegramHttpApi,
  buildTelegramDigest,
} from "./telegram.js";
const token = `0:${"synthetic".repeat(4)}`;
const update = (id: number, chat: number, text: string) => ({
  update_id: id,
  message: { chat: { id: chat, type: "private" }, text },
});
function fixture(actual?: AssistantService) {
  let state = {
    token,
    primary_device: true,
    paired_chat_id: null as number | null,
    offset: 0,
  };
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  let updates: unknown[] = [];
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = String(input).split("/").at(-1)!;
      calls.push({ method, body: JSON.parse(init!.body as string) });
      return new Response(
        JSON.stringify({
          ok: true,
          result: method === "getUpdates" ? updates : { message_id: 1 },
        }),
      );
    },
  );
  const settings = {
    read: async () => ({ ...state }),
    write: async (
      patch: Partial<Omit<typeof state, "token" | "primary_device">>,
    ) => {
      state = { ...state, ...patch };
    },
  };
  const assistant = {
    handle: vi.fn<AssistantService["handle"]>(async () => ({
      status: "answered" as const,
      text: "Synthetic reply",
      proposal_id: null,
    })),
  };
  let now = 1000;
  const connector = new TelegramConnector({
    settings,
    assistant: actual ?? assistant,
    api: new TelegramHttpApi({ fetch: fetcher }),
    generate_pairing_code: () => "123456",
    now: () => now,
  });
  return {
    connector,
    settings,
    calls,
    assistant,
    fetcher,
    setUpdates: (v: unknown[]) => {
      updates = v;
    },
    setState: (v: Partial<typeof state>) => {
      state = { ...state, ...v };
    },
    setNow: (v: number) => {
      now = v;
    },
    state: () => state,
  };
}
test("telegram_pairing_one_time_chat_lock_sensitive_drop_and_shared_service_origin", async () => {
  const f = fixture();
  expect(await f.connector.beginPairing()).toEqual({
    pairing_code: "123456",
    expires_at: 301000,
  });
  f.setUpdates([
    update(1, 11, "wrong"),
    update(2, 11, "/start 123456"),
    update(3, 22, "123456"),
    update(4, 22, "Show balance"),
    update(5, 11, "My OTP is 654321"),
    update(6, 11, "Show balance"),
  ]);
  expect((await f.connector.pollOnce()).status).toBe("ok");
  expect(f.state().paired_chat_id).toBe(11);
  expect(f.assistant.handle).toHaveBeenCalledExactlyOnceWith(
    {
      request_id: "telegram_0_6",
      conversation_id: "main",
      action: "question",
      text: "Show balance",
    },
    { source: "telegram", authenticated: true, paired_telegram: true },
    expect.anything(),
  );
  expect(f.calls.filter((c) => c.method === "sendMessage")).toEqual([
    {
      method: "sendMessage",
      body: { chat_id: 11, text: "Paired with Vittaz." },
    },
    { method: "sendMessage", body: { chat_id: 11, text: "Synthetic reply" } },
  ]);
  expect(f.state().offset).toBe(7);
  await expect(f.connector.beginPairing()).rejects.toThrow(
    "telegram_already_paired",
  );
});
test("telegram_pairing_expiry_attempt_cap_primary_device_and_digest", async () => {
  const f = fixture();
  await f.connector.beginPairing();
  f.setNow(301001);
  f.setUpdates([update(1, 11, "123456")]);
  await f.connector.pollOnce();
  expect(f.state().paired_chat_id).toBeNull();
  f.setNow(500000);
  await f.connector.beginPairing();
  f.setUpdates(Array.from({ length: 5 }, (_, i) => update(2 + i, 11, "wrong")));
  await f.connector.pollOnce();
  f.setUpdates([update(7, 11, "123456")]);
  await f.connector.pollOnce();
  expect(f.state().paired_chat_id).toBeNull();
  await f.connector.beginPairing();
  f.setUpdates([update(8, 11, "123456")]);
  await f.connector.pollOnce();
  expect(
    (
      await f.connector.sendDigest({
        unverified_count: 2,
        daily_allowance_paise: 12345,
      })
    ).status,
  ).toBe("sent");
  expect(f.calls.at(-1)!.body).toEqual({
    chat_id: 11,
    text: "Unverified entries: 2\nDaily allowance: INR 123.45",
  });
  f.setState({ primary_device: false });
  const before = f.calls.length;
  expect((await f.connector.pollOnce()).status).toBe("inactive");
  expect(
    (
      await f.connector.sendDigest({
        unverified_count: 0,
        daily_allowance_paise: 0,
      })
    ).status,
  ).toBe("inactive");
  expect(f.calls).toHaveLength(before);
  expect(
    buildTelegramDigest({ unverified_count: 0, daily_allowance_paise: 0 }),
  ).toContain("INR 0.00");
});

test("telegram_conflict_latches_rate_limit_waits_and_errors_are_static", async () => {
  const f = fixture();
  f.fetcher.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ ok: false, error_code: 409, description: token }),
      { status: 409 },
    ),
  );
  expect((await f.connector.pollOnce()).status).toBe("conflict");
  expect((await f.connector.pollOnce()).status).toBe("conflict");
  expect((await f.connector.sendDigest({})).status).toBe("conflict");
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  for (const seconds of [2, undefined]) {
    const r = fixture();
    r.fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: false,
          ...(seconds ? { parameters: { retry_after: seconds } } : {}),
        }),
        { status: 429 },
      ),
    );
    expect(await r.connector.pollOnce()).toEqual({
      status: "rate_limited",
      retry_after_ms: (seconds ?? 60) * 1000,
    });
    expect((await r.connector.pollOnce()).status).toBe("rate_limited");
    expect((await r.connector.sendDigest({})).status).toBe("rate_limited");
    expect(r.fetcher).toHaveBeenCalledTimes(1);
    r.setNow(100000);
    expect((await r.connector.pollOnce()).status).toBe("ok");
  }
  const e = fixture();
  e.fetcher.mockRejectedValueOnce(new Error(token));
  expect(await e.connector.pollOnce()).toEqual({
    status: "unavailable",
    retry_after_ms: null,
  });
  e.setState({ paired_chat_id: 11 });
  e.fetcher.mockRejectedValueOnce(new Error(token));
  expect(
    (
      await e.connector.sendDigest({
        unverified_count: 1,
        daily_allowance_paise: 0,
      })
    ).status,
  ).toBe("unavailable");
  const aborted = new AbortController();
  aborted.abort();
  expect((await e.connector.pollOnce(aborted.signal)).status).toBe("aborted");
  expect((await e.connector.sendDigest({}, aborted.signal)).status).toBe(
    "aborted",
  );
});
test("telegram_primary_empty_secure_settings_invalid_inputs_and_pairing_failures", async () => {
  const f = fixture();
  expect((await f.connector.sendDigest({})).status).toBe("inactive");
  f.setState({ token: "" });
  expect((await f.connector.pollOnce()).status).toBe("inactive");
  expect((await f.connector.sendDigest({})).status).toBe("inactive");
  await expect(f.connector.beginPairing()).rejects.toThrow("telegram_inactive");
  f.setState({ token, primary_device: false });
  await expect(f.connector.beginPairing()).rejects.toThrow("telegram_inactive");
  const g = fixture();
  g.settings.read = async () => {
    throw token;
  };
  await expect(g.connector.beginPairing()).rejects.toThrow(
    "telegram_unavailable",
  );
  expect((await g.connector.pollOnce()).status).toBe("unavailable");
  expect((await g.connector.sendDigest({})).status).toBe("unavailable");
  g.settings.read = async () => {
    throw new Error(token);
  };
  await expect(g.connector.beginPairing()).rejects.toThrow(
    "telegram_unavailable",
  );
  expect(
    buildTelegramDigest({ unverified_count: 0, daily_allowance_paise: -123 }),
  ).toContain("-1.23");
  for (const bad of [
    { unverified_count: -1, daily_allowance_paise: 0 },
    { unverified_count: 0, daily_allowance_paise: 1.5 },
    { unverified_count: 0, daily_allowance_paise: 0, extra: true },
  ])
    expect(() => buildTelegramDigest(bad)).toThrow();
  const h = fixture();
  h.setState({ paired_chat_id: 11 });
  expect((await h.connector.sendDigest({})).status).toBe("unavailable");
});
test("telegram_ignores_unsupported_updates_old_offsets_and_missing_or_unanswered_text", async () => {
  const f = fixture();
  f.setUpdates([
    { update_id: 1 },
    {
      update_id: 2,
      message: { chat: { id: 11, type: "group" }, text: "test" },
    },
    {
      update_id: 3,
      message: { chat: { id: -1, type: "private" }, text: "test" },
    },
    { update_id: 4, message: { chat: { id: 11, type: "private" } } },
    update(5, 11, ""),
    update(6, 11, "hello"),
  ]);
  await f.connector.pollOnce();
  expect(f.assistant.handle).not.toHaveBeenCalled();
  f.setState({ paired_chat_id: 11 });
  f.assistant.handle
    .mockResolvedValueOnce({
      status: "unavailable",
      text: null,
      proposal_id: null,
    })
    .mockResolvedValueOnce({
      status: "rejected",
      text: "Blocked",
      proposal_id: null,
    });
  f.setUpdates([
    update(9, 11, "later"),
    update(1, 11, "old"),
    update(8, 11, "earlier"),
  ]);
  await f.connector.pollOnce();
  expect(f.assistant.handle.mock.calls.map((c) => c[0])).toEqual([
    {
      request_id: "telegram_0_8",
      conversation_id: "main",
      action: "question",
      text: "earlier",
    },
    {
      request_id: "telegram_0_9",
      conversation_id: "main",
      action: "question",
      text: "later",
    },
  ]);
  expect(f.calls.every((c) => c.method === "getUpdates")).toBe(true);
});
test("telegram_busy_and_inflight_abort_release_locks_without_late_processing", async () => {
  const f = fixture();
  let resolve!: (value: Response) => void;
  f.fetcher.mockImplementationOnce(
    async () =>
      new Promise<Response>((r) => {
        resolve = r;
      }),
  );
  const pending = f.connector.pollOnce();
  await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalledTimes(1));
  expect((await f.connector.pollOnce()).status).toBe("busy");
  expect((await f.connector.sendDigest({})).status).toBe("busy");
  resolve(new Response(JSON.stringify({ ok: true, result: [] })));
  expect((await pending).status).toBe("ok");
  const c = new AbortController();
  f.fetcher.mockImplementationOnce(async () => {
    c.abort();
    return new Response(
      JSON.stringify({ ok: true, result: [update(1, 11, "question")] }),
    );
  });
  expect((await f.connector.pollOnce(c.signal)).status).toBe("aborted");
  expect(f.state().offset).toBe(0);
  const d = new AbortController();
  f.fetcher.mockImplementationOnce(async () => {
    d.abort();
    throw new Error(token);
  });
  expect((await f.connector.pollOnce(d.signal)).status).toBe("aborted");
  expect((await f.connector.pollOnce()).status).toBe("ok");
});
test("telegram_http_protocol_rejects_unsafe_urls_tokens_errors_and_scrubs_token_text", async () => {
  new TelegramHttpApi();
  for (const url of [
    "ftp://example.test",
    "http://example.test",
    "https://u@example.test",
    "https://:p@example.test",
    "https://example.test?q=x",
    "https://example.test#x",
    "https://example.test/path",
  ])
    expect(() => new TelegramHttpApi({ base_url: url })).toThrow(
      "telegram_invalid_base_url",
    );
  for (const url of ["http://localhost", "http://127.0.0.1", "http://[::1]"])
    new TelegramHttpApi({ base_url: url, timeout_ms: 10 });
  const sent: string[] = [];
  const api = new TelegramHttpApi({
    fetch: async (_url, init) => {
      sent.push(init!.body as string);
      return new Response('{"ok":true,"result":{"message_id":1}}');
    },
  });
  await api.sendMessage(
    token,
    11,
    `${token}${"x".repeat(5000)}`,
    new AbortController().signal,
  );
  expect(sent[0]).not.toContain(token);
  expect(JSON.parse(sent[0]).text).toHaveLength(4096);
  await expect(api.getUpdates("invalid", 0)).rejects.toMatchObject({
    message: "telegram_unavailable",
  });
  await expect(api.getUpdates("invalid", 0)).rejects.not.toHaveProperty(
    "cause",
  );
  for (const [body, status] of [
    ["not json", 200],
    ['{"ok":false}', 200],
    ['{"ok":false}', 500],
    ['{"ok":true,"result":"wrong"}', 200],
  ] as const) {
    const bad = new TelegramHttpApi({
      fetch: async () => new Response(body, { status }),
    });
    await expect(bad.getUpdates(token, 0)).rejects.toThrow(
      "telegram_unavailable",
    );
  }
  const oversized = new TelegramHttpApi({
    fetch: async () => new Response("x".repeat(1048577)),
  });
  await expect(oversized.getUpdates(token, 0)).rejects.toThrow(
    "telegram_unavailable",
  );
  expect(new TelegramHttpError("unavailable").retry_after_ms).toBeNull();
});
test("telegram_actual_loopback_http_json_long_poll_and_deadline_no_live_service", async () => {
  let mode: "normal" | "hang" = "normal";
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url!, body: JSON.parse(body) });
    if (mode === "hang") return;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        result: req.url!.endsWith("getUpdates")
          ? [update(20, 11, "Synthetic")]
          : { message_id: 1 },
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("synthetic_server");
  try {
    const api = new TelegramHttpApi({
      base_url: `http://127.0.0.1:${address.port}`,
      timeout_ms: 100,
    });
    expect((await api.getUpdates(token, 10))[0].update_id).toBe(20);
    await api.sendMessage(token, 11, "Synthetic");
    expect(requests[0]).toEqual({
      url: `/bot${token}/getUpdates`,
      body: {
        offset: 10,
        limit: 100,
        timeout: 25,
        allowed_updates: ["message"],
      },
    });
    mode = "hang";
    await expect(api.getUpdates(token, 21)).rejects.toThrow(
      "telegram_unavailable",
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("telegram_actual_shared_assistant_native_history_app_and_paired_telegram_no_stranger_or_sensitive_trace", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { openLedgerStore, openReadOnlyLedgerStore } =
    await import("../../storage/src/repositories.js");
  const { PrivacyRedactor, getWalletSummary } = await import("@vittaz/core");
  const { SharedAssistantService } = await import("./assistant.js");
  const { ReadOnlyQaLoop } = await import("./qa_loop.js");
  const { ValidatedLocalModelTasks } = await import("./local_tasks.js");
  const { test_client } = await import("../../../tests/helpers/test_client.js");
  const { KeyPool } = await import("./key_pool.js");
  const { startFakeOpenAIServer } =
    await import("../../../tests/helpers/fake_openai_server.js");
  const dir = mkdtempSync(join(tmpdir(), "vittaz_telegram_"));
  const file = join(dir, "synthetic.sqlite");
  const writer = openLedgerStore(file);
  const reader = openReadOnlyLedgerStore(file);
  const server = await startFakeOpenAIServer();
  try {
    const redactor = new PrivacyRedactor([]);
    const run = vi.fn(async () => null);
    const service = new SharedAssistantService({
      ledger: writer,
      history: writer.history,
      preferences: writer.preferences,
      rules: writer.rules,
      redactor,
      local: new ValidatedLocalModelTasks({ run }),
      qa: new ReadOnlyQaLoop({
        client: test_client({
          baseUrl: server.baseUrl,
          keyPool: new KeyPool([{ nickname: "synthetic", apiKey: "" }]),
        }),
        data: {
          listTransactions: () => reader.read((r) => r.transactions.list()),
          getWalletSummary: (id) => getWalletSummary(reader, id),
        },
        redactor,
      }),
    });
    expect(
      (
        await service.handle(
          {
            request_id: "app_before_telegram",
            conversation_id: "main",
            action: "question",
            text: "Synthetic hello",
          },
          { source: "app", authenticated: true, paired_telegram: false },
        )
      ).status,
    ).toBe("answered");
    const f = fixture(service);
    f.setState({ paired_chat_id: 11 });
    f.setUpdates([
      update(1, 22, "Synthetic stranger"),
      update(2, 11, "My OTP is 654321"),
      update(3, 11, "Synthetic balance"),
    ]);
    expect((await f.connector.pollOnce()).status).toBe("ok");
    const messages = await writer.history.listMessages("main");
    expect(messages.map((m) => m.source)).toEqual([
      "app",
      "app",
      "telegram",
      "telegram",
    ]);
    expect(JSON.stringify(messages)).not.toContain("654321");
    expect(JSON.stringify(messages)).not.toContain("stranger");
    expect(JSON.stringify(messages)).not.toContain(token);
    expect(server.recordedRequests).toHaveLength(2);
    expect(server.recordedRequests[1].rawBody).toContain("untrusted_history");
    expect(run).not.toHaveBeenCalled();
    expect(await writer.read((r) => r.transactions.list())).toEqual([]);
    await f.connector.pollOnce();
    expect(await writer.history.listMessages("main")).toHaveLength(4);
    expect(server.recordedRequests).toHaveLength(2);
  } finally {
    await server.close();
    await reader.close();
    await writer.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
