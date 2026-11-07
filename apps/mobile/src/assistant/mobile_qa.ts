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
    "Kilo rejected the saved key. Replace it in Model settings or remove it to retry keyless Auto Free. Never share the key.",
  provider_rate_limited:
    "Kilo Auto Free is rate-limited. Wait a bit before trying again.",
  provider_request_rejected:
    "Kilo rejected this request format. No ledger changes were made.",
  provider_error:
    "Kilo could not complete the request. Check your connection, remove a saved key to retry keyless, or try again later. No ledger changes were made.",
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
