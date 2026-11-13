export const DIAGNOSTIC_CODES = [
  "app_started",
  "ledger_open_started",
  "ledger_open_succeeded",
  "ledger_open_failed",
  "provider_selected",
  "secure_credential_read_started",
  "secure_credential_read_succeeded",
  "secure_credential_read_failed",
  "question_accepted",
  "question_rejected",
  "provider_profile_read_started",
  "provider_profile_read_succeeded",
  "provider_profile_read_failed",
  "provider_credentials_checked",
  "question_preflight_passed",
  "question_preflight_rejected",
  "qa_agent_create_started",
  "qa_agent_create_succeeded",
  "qa_result_received",
  "qa_agent_create_failed",
  "qa_started",
  "provider_request_started",
  "provider_http_response",
  "provider_fetch_failed",
  "provider_response_parsed",
  "provider_stream_summary",
  "provider_failure_classified",
  "qa_tool_started",
  "qa_tool_completed",
  "qa_tool_rejected",
  "qa_failed",
  "qa_stage_failed",
  "qa_completed",
  "diagnostic_export_started",
  "diagnostic_export_succeeded",
  "diagnostic_export_failed",
  "diagnostics_cleared",
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export const DIAGNOSTIC_SOURCES = [
  "app",
  "ledger",
  "settings",
  "secure_store",
  "request_preflight",
  "qa_agent",
  "provider_http",
  "provider_protocol",
  "qa_loop",
  "tool",
  "log_export",
] as const;
export type DiagnosticSource = (typeof DIAGNOSTIC_SOURCES)[number];

export const DIAGNOSTIC_OUTCOMES = [
  "started",
  "completed",
  "failed",
  "rejected",
  "skipped",
] as const;
export type DiagnosticOutcome = (typeof DIAGNOSTIC_OUTCOMES)[number];

export const DIAGNOSTIC_PROVIDERS = [
  "kilo",
  "openai_compatible",
  "anthropic",
] as const;
export type DiagnosticProvider = (typeof DIAGNOSTIC_PROVIDERS)[number];

export const DIAGNOSTIC_REASONS = [
  "ok",
  "unknown",
  "provider_error",
  "connection_error",
  "protocol_error",
  "unauthorized",
  "rate_limited",
  "access_denied",
  "provider_unavailable",
  "provider_http_error",
  "request_rejected",
  "invalid_provider_config",
  "missing_credential",
  "secure_store_error",
  "local_storage_error",
  "profile_invalid",
  "invalid_question",
  "sensitive_input_blocked",
  "timeout",
  "cancelled",
  "empty_answer",
  "invalid_completion",
  "tool_rejected",
  "step_limit",
  "token_budget",
  "callback_error",
  "export_permission_denied",
  "export_io_error",
] as const;
export type DiagnosticReason = (typeof DIAGNOSTIC_REASONS)[number];

export const DIAGNOSTIC_TOOLS = [
  "query_transactions",
  "get_balance",
  "get_month_summary",
  "find_person",
  "check_unverified",
] as const;
export type DiagnosticTool = (typeof DIAGNOSTIC_TOOLS)[number];

export const DIAGNOSTIC_FAILURE_STAGES = [
  "request_validation",
  "preflight",
  "context_build",
  "agent_create",
  "provider_call",
  "completion_validation",
  "answer_validation",
  "tool_execution",
  "callback",
  "unknown",
] as const;
export type DiagnosticFailureStage = (typeof DIAGNOSTIC_FAILURE_STAGES)[number];

export interface DiagnosticEntry {
  sequence: number;
  captured_at: string;
  event_code: DiagnosticCode;
  source: DiagnosticSource;
  outcome: DiagnosticOutcome;
  provider_kind?: DiagnosticProvider;
  reason_code?: DiagnosticReason;
  http_status?: number;
  elapsed_ms?: number;
  tool_name?: DiagnosticTool;
  failure_stage?: DiagnosticFailureStage;
  count?: number;
}

export interface MobileDiagnosticsOptions {
  enabled: boolean;
  clock?: () => Date;
  console_sink?: (line: string) => void;
  max_entries?: number;
}

function is_member<const T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return (
    typeof value === "string" && values.some((candidate) => candidate === value)
  );
}

function safe_integer(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : undefined;
}

/**
 * Bounded diagnostics for an explicitly opted-in test build. The API accepts
 * only primitive allowlisted codes; arbitrary metadata and Error objects are
 * intentionally not part of the interface.
 */
export class MobileDiagnostics {
  private readonly entries: DiagnosticEntry[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly clock: () => Date;
  private readonly console_sink: (line: string) => void;
  private readonly max_entries: number;
  private sequence = 0;
  private events_dropped = 0;

  constructor(private readonly options: MobileDiagnosticsOptions) {
    this.clock = options.clock ?? (() => new Date());
    this.console_sink = options.console_sink ?? ((line) => console.log(line));
    this.max_entries = Math.max(
      1,
      Math.min(500, safe_integer(options.max_entries, 1, 500) ?? 300),
    );
  }

  record(
    event_code: DiagnosticCode,
    source: DiagnosticSource,
    outcome: DiagnosticOutcome,
    provider_kind?: DiagnosticProvider,
    reason_code?: DiagnosticReason,
    http_status?: number,
    elapsed_ms?: number,
    tool_name?: DiagnosticTool,
    count?: number,
    failure_stage?: DiagnosticFailureStage,
  ): DiagnosticEntry | null {
    if (!this.options.enabled) return null;

    const timestamp = this.clock();
    const entry: DiagnosticEntry = {
      sequence: ++this.sequence,
      captured_at: Number.isFinite(timestamp.valueOf())
        ? timestamp.toISOString()
        : "invalid_clock",
      event_code: is_member(DIAGNOSTIC_CODES, event_code)
        ? event_code
        : "qa_failed",
      source: is_member(DIAGNOSTIC_SOURCES, source) ? source : "app",
      outcome: is_member(DIAGNOSTIC_OUTCOMES, outcome) ? outcome : "failed",
    };

    if (is_member(DIAGNOSTIC_PROVIDERS, provider_kind))
      entry.provider_kind = provider_kind;
    if (reason_code !== undefined)
      entry.reason_code = is_member(DIAGNOSTIC_REASONS, reason_code)
        ? reason_code
        : "unknown";
    const status = safe_integer(http_status, 100, 599);
    if (status !== undefined) entry.http_status = status;
    const duration = safe_integer(elapsed_ms, 0, 86_400_000);
    if (duration !== undefined) entry.elapsed_ms = duration;
    if (is_member(DIAGNOSTIC_TOOLS, tool_name)) entry.tool_name = tool_name;
    if (failure_stage !== undefined)
      entry.failure_stage = is_member(DIAGNOSTIC_FAILURE_STAGES, failure_stage)
        ? failure_stage
        : "unknown";
    const safe_count = safe_integer(count, 0, 1_000_000);
    if (safe_count !== undefined) entry.count = safe_count;

    this.entries.push(entry);
    if (this.entries.length > this.max_entries) {
      this.entries.shift();
      this.events_dropped += 1;
    }
    try {
      this.console_sink(`[VittazDiagnostics] ${JSON.stringify(entry)}`);
    } catch {
      // A log sink must never break the provider or ledger flow.
    }
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Diagnostic observers are non-critical UI subscribers.
      }
    }
    return { ...entry };
  }

  snapshot(): DiagnosticEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.entries.length = 0;
    this.events_dropped = 0;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Diagnostic observers are non-critical UI subscribers.
      }
    }
  }

  dump_json(): string {
    return JSON.stringify({
      schema_version: 1,
      exported_at: this.clock().toISOString(),
      events_dropped: this.events_dropped,
      events: this.snapshot(),
    });
  }
}

export const DIAGNOSTICS_BUILD_ENABLED =
  process.env.EXPO_PUBLIC_VITTAZ_DIAGNOSTICS === "1";

export const mobile_diagnostics = new MobileDiagnostics({
  enabled: DIAGNOSTICS_BUILD_ENABLED,
});
