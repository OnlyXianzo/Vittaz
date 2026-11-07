import { getWalletSummary, PrivacyRedactor } from "@vittaz/core";
import type { LedgerStore } from "@vittaz/core";
import type { QaStopReason } from "../../../../packages/agent/src/qa_loop";
import { LangChainQaAgent } from "../../../../packages/agent/src/langchain_adapter";
import { KeyPool } from "../../../../packages/agent/src/key_pool";
import { OpenAICompatibleClient } from "../../../../packages/agent/src/provider_client";

export const KILO_GATEWAY_BASE_URL = "https://ai-gateway.kilo.ai/api";
export const KILO_FREE_MODEL = "kilo-auto/free";

const failure_copy: Record<QaStopReason, string> = {
  completed: "The assistant could not produce a safe answer.",
  message_rejected:
    "This question was blocked by the assistant's safety rules.",
  sensitive_dropped:
    "This question may contain sensitive information. Use synthetic data only.",
  provider_auth_failed:
    "Kilo denied authentication. Auto Free is normally keyless; if you intentionally saved a key, verify it in Model settings. Code: KILO_AUTH. Never share the key. No ledger changes were made.",
  provider_rate_limited:
    "Kilo Auto Free is rate-limited. Wait before trying again. Code: KILO_RATE_LIMIT. No ledger changes were made.",
  provider_request_rejected:
    "Kilo rejected this request format. Code: KILO_REQUEST_REJECTED. No ledger changes were made.",
  provider_connection_failed:
    "The app could not connect to Kilo. Check that the network allows the connection. Code: KILO_CONNECTION. No ledger changes were made.",
  provider_unavailable:
    "Kilo is temporarily unavailable. Try again later. Code: KILO_UNAVAILABLE. No ledger changes were made.",
  provider_access_denied:
    "Kilo denied access to this model route. Auto Free availability may have changed. Code: KILO_ACCESS. No ledger changes were made.",
  provider_protocol_error:
    "Kilo replied in an unsupported format, so no answer was accepted. Code: KILO_PROTOCOL. No ledger changes were made.",
  provider_http_error:
    "Kilo returned an HTTP error outside the known auth, rate-limit, and request-format cases. Code: KILO_HTTP. No ledger changes were made.",
  provider_error:
    "The request failed for an unclassified reason. If it continues, report code KILO_UNKNOWN. No ledger changes were made.",
  tool_rejected:
    "I couldn't safely finish the read-only ledger lookup. No ledger changes were made.",
  step_limit:
    "I couldn't safely complete that question within the request limits.",
  token_budget:
    "I couldn't safely complete that question within the response limit.",
  timeout: "The Kilo request timed out. Check your connection and try again.",
  aborted: "The request was canceled.",
};

export function mobile_qa_failure_message(reason: QaStopReason): string {
  return failure_copy[reason];
}

/** S36 uses only the bounded, read-only ledger Q&A loop. */
export function create_mobile_qa_agent(
  ledger: LedgerStore,
  api_key: string | null,
  fetch_impl: typeof fetch = fetch,
) {
  const redactor = new PrivacyRedactor();
  const client = new OpenAICompatibleClient({
    baseUrl: KILO_GATEWAY_BASE_URL,
    keyPool: new KeyPool([
      {
        nickname: "kilo_free",
        apiKey: api_key ?? "",
        provider: "kilo_gateway",
        model: KILO_FREE_MODEL,
      },
    ]),
    fetch: fetch_impl,
    timeoutMs: 45000,
    redactor,
  });
  return new LangChainQaAgent({
    client,
    redactor,
    data: {
      listTransactions: () => ledger.read((repos) => repos.transactions.list()),
      getWalletSummary: (wallet_id) => getWalletSummary(ledger, wallet_id),
    },
  });
}
