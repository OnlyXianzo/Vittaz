import { expect, test, vi } from "vitest";
import { CrashReporter, SafeLogger, SecretSanitizer } from "./safeTelemetry.js";

const fixedClock = () => new Date("2026-11-04T10:00:00.000Z");
const syntheticSecrets = [
  ["sk-", "synth-unregistered-key-999888777"].join(""),
  ["123456789:", "SYNTH_FAKE_BOT_TOKEN_ABCDEF12345"].join(""),
  "Synth Private Name",
  "PRIVATE_SYNTH_NOTE",
  "00112233445566",
];

test("privacy_telemetry_omits_registered_and_unknown_secrets_names_and_notes", () => {
  const sanitizer = new SecretSanitizer();
  for (const secret of syntheticSecrets) sanitizer.registerSecret(secret);
  sanitizer.registerSecret(null);
  const logger = new SafeLogger(sanitizer, fixedClock);
  const reporter = new CrashReporter(sanitizer, fixedClock);
  for (const text of syntheticSecrets) {
    logger.error(`Authorization: Bearer ${text}`, { [text]: text });
    reporter.captureException(new Error(text, { cause: new Error(text) }), {
      text,
    });
  }
  const serialized = logger.dumpText() + reporter.dumpText();
  for (const text of syntheticSecrets) expect(serialized).not.toContain(text);
  expect(serialized).toContain("REDACTED_TEXT");
  expect(serialized).toContain("OMITTED");
});

test("privacy_telemetry_never_traverses_or_coerces_untrusted_values", () => {
  const access = vi.fn(() => {
    throw new Error("must_not_read");
  });
  const proxy = new Proxy({}, { get: access, ownKeys: access });
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  const sanitizer = new SecretSanitizer();
  const logger = new SafeLogger(sanitizer, fixedClock);
  const reporter = new CrashReporter(sanitizer, fixedClock);
  for (const value of [
    proxy,
    cycle,
    { toJSON: access, toString: access },
    123n,
    () => "unsafe",
    undefined,
    null,
  ]) {
    expect(sanitizer.sanitizeString(value)).toBe("[REDACTED_TEXT]");
    expect(sanitizer.sanitizeValue(value)).toBe("[OMITTED]");
    logger.warn(value, value);
    reporter.captureException(value, value);
  }
  expect(access).not.toHaveBeenCalled();
  expect(() => logger.dumpText()).not.toThrow();
  expect(() => reporter.dumpText()).not.toThrow();
});

test("privacy_telemetry_only_known_operational_codes_are_retained", () => {
  const logger = new SafeLogger(undefined, fixedClock);
  for (const event of [
    "operation_started",
    "operation_succeeded",
    "operation_failed",
    "request_rejected",
    "provider_unavailable",
  ]) {
    expect(logger.info(event).message).toBe(event);
  }
  expect(logger.log("invalid_level", "untrusted\nforged_event")).toMatchObject({
    level: "error",
    message: "[REDACTED_TEXT]",
  });
  expect(logger.warn("operation_failed").level).toBe("warn");
  expect(logger.error("operation_failed").level).toBe("error");
  expect(logger.entries[0]!.timestamp).toBe(fixedClock().toISOString());
});

test("privacy_telemetry_returned_entries_cannot_poison_internal_records", () => {
  const logger = new SafeLogger(undefined, fixedClock);
  const entry = logger.info("operation_started");
  entry.message = "Synth injected name";
  const entries = logger.entries;
  entries[0]!.message = "Synth injected name";
  expect(logger.dumpText()).not.toContain("Synth injected name");
  const reporter = new CrashReporter(undefined, fixedClock);
  const report = reporter.captureException(new Error("Synthetic failure"));
  report.error = "Synth injected name";
  const reports = reporter.getReports();
  reports[0]!.error = "Synth injected name";
  expect(reporter.dumpText()).not.toContain("Synth injected name");
  expect(reporter.getReports()[0]).toEqual({
    id: "crash_1",
    captured_at: fixedClock().toISOString(),
    error: "[OMITTED]",
    context: "[OMITTED]",
  });
});

test("privacy_telemetry_retention_is_bounded_without_reusing_crash_ids", () => {
  const logger = new SafeLogger(undefined, fixedClock);
  const reporter = new CrashReporter(undefined, fixedClock);
  for (let index = 0; index < 105; index++) {
    logger.info("operation_started");
    reporter.captureException(null);
  }
  expect(logger.entries).toHaveLength(100);
  expect(reporter.getReports()).toHaveLength(100);
  expect(reporter.getReports()[0]!.id).toBe("crash_6");
  expect(reporter.getReports()[99]!.id).toBe("crash_105");
});

test("privacy_telemetry_default_clock_has_no_external_sink", () => {
  const log = vi.spyOn(console, "log");
  const error = vi.spyOn(console, "error");
  try {
    const logger = new SafeLogger();
    const reporter = new CrashReporter();
    expect(logger.info("operation_started").timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    expect(reporter.captureException(null).captured_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
});
