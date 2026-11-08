export type AgentDiagnosticFailureStage =
  | "request_validation"
  | "preflight"
  | "context_build"
  | "agent_create"
  | "provider_call"
  | "completion_validation"
  | "answer_validation"
  | "tool_execution"
  | "callback"
  | "unknown";

export type AgentDiagnosticReason =
  | "ok"
  | "provider_error"
  | "connection_error"
  | "protocol_error"
  | "unauthorized"
  | "rate_limited"
  | "access_denied"
  | "provider_unavailable"
  | "provider_http_error"
  | "request_rejected"
  | "timeout"
  | "cancelled"
  | "sensitive_input_blocked"
  | "invalid_question"
  | "empty_answer"
  | "invalid_completion"
  | "tool_rejected"
  | "step_limit"
  | "token_budget"
  | "langchain_error"
  | "callback_error";

export type AgentDiagnosticCode =
  | "provider_request_started"
  | "provider_http_response"
  | "provider_fetch_failed"
  | "provider_response_parsed"
  | "provider_failure_classified"
  | "langchain_invoke_started"
  | "langchain_invoke_succeeded"
  | "langchain_invoke_failed"
  | "qa_started"
  | "qa_stage_failed"
  | "qa_failed"
  | "qa_completed"
  | "qa_tool_started"
  | "qa_tool_completed"
  | "qa_tool_rejected";

export type AgentDiagnosticSource =
  "provider_http" | "provider_protocol" | "langchain" | "qa_loop" | "tool";

export interface AgentDiagnosticEvent {
  event_code: AgentDiagnosticCode;
  source: AgentDiagnosticSource;
  outcome: "started" | "completed" | "failed" | "rejected";
  reason_code?: AgentDiagnosticReason;
  failure_stage?: AgentDiagnosticFailureStage;
  http_status?: number;
  elapsed_ms?: number;
  tool_name?:
    | "query_transactions"
    | "get_balance"
    | "get_month_summary"
    | "find_person"
    | "check_unverified";
  count?: number;
}

export type AgentDiagnosticReporter = (event: AgentDiagnosticEvent) => void;

export function report_agent_diagnostic(
  reporter: AgentDiagnosticReporter | undefined,
  event: AgentDiagnosticEvent,
): void {
  if (!reporter) return;
  try {
    reporter({ ...event });
  } catch {
    // Diagnostics are never allowed to interrupt an answer or ledger read.
  }
}
