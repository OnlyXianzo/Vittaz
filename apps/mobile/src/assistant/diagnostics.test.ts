import { describe, expect, it, jest } from "@jest/globals";
import {
  MobileDiagnostics,
  type DiagnosticCode,
  type DiagnosticOutcome,
  type DiagnosticProvider,
  type DiagnosticSource,
} from "./diagnostics";

describe("test-build diagnostics", () => {
  const timestamp = "2026-11-05T10:11:12.000Z";

  it("records structured allowlisted events and writes the same safe line to console", () => {
    const sink = jest.fn();
    const diagnostics = new MobileDiagnostics({
      enabled: true,
      clock: () => new Date(timestamp),
      console_sink: sink,
    });

    const entry = diagnostics.record(
      "provider_http_response",
      "provider_http",
      "completed",
      "kilo",
      "ok",
      200,
      1234,
    );

    expect(entry).toEqual({
      sequence: 1,
      captured_at: timestamp,
      event_code: "provider_http_response",
      source: "provider_http",
      outcome: "completed",
      provider_kind: "kilo",
      reason_code: "ok",
      http_status: 200,
      elapsed_ms: 1234,
    });
    expect(sink).toHaveBeenCalledWith(
      `[VittazDiagnostics] ${JSON.stringify(entry)}`,
    );
    expect(diagnostics.snapshot()).toEqual([entry]);
  });

  it("rejects arbitrary values and excludes prompt, key, URL, body, and exception fields", () => {
    const sink = jest.fn();
    const diagnostics = new MobileDiagnostics({
      enabled: true,
      clock: () => new Date(timestamp),
      console_sink: sink,
    });
    const untrusted = "synthetic-private-marker";

    diagnostics.record(
      "provider_http_response" as DiagnosticCode,
      "provider_http" as DiagnosticSource,
      "completed" as DiagnosticOutcome,
      "kilo" as DiagnosticProvider,
      untrusted as never,
      200,
      5,
    );
    const serialized = diagnostics.dump_json();

    expect(serialized).not.toContain(untrusted);
    expect(serialized).not.toMatch(/prompt|api_key|response_body|stack|url/i);
    expect(serialized).toContain('"reason_code":"unknown"');
  });

  it("is silent and stores nothing when not enabled by the diagnostic build", () => {
    const sink = jest.fn();
    const diagnostics = new MobileDiagnostics({
      enabled: false,
      clock: () => new Date(timestamp),
      console_sink: sink,
    });

    expect(diagnostics.record("app_started", "app", "completed")).toBeNull();
    expect(diagnostics.snapshot()).toEqual([]);
    expect(sink).not.toHaveBeenCalled();
  });

  it("keeps a bounded ring buffer and returns defensive snapshots", () => {
    const diagnostics = new MobileDiagnostics({
      enabled: true,
      clock: () => new Date(timestamp),
      console_sink: () => undefined,
      max_entries: 2,
    });
    diagnostics.record("app_started", "app", "completed");
    diagnostics.record("qa_started", "qa_loop", "started", "kilo");
    diagnostics.record(
      "qa_failed",
      "qa_loop",
      "failed",
      "kilo",
      "provider_error",
    );

    const snapshot = diagnostics.snapshot();
    expect(snapshot.map((entry) => entry.sequence)).toEqual([2, 3]);
    snapshot[0]!.event_code = "tampered" as DiagnosticCode;
    expect(diagnostics.snapshot()[0]!.event_code).toBe("qa_started");
    expect(diagnostics.dump_json()).toContain('"events_dropped":1');
  });
});
