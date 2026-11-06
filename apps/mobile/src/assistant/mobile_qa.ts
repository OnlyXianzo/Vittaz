import { getWalletSummary, PrivacyRedactor } from "@vittaz/core";
import type { LedgerStore } from "@vittaz/core";
import { LangChainQaAgent } from "../../../../packages/agent/src/langchain_adapter";
import { KeyPool } from "../../../../packages/agent/src/key_pool";
import { OpenAICompatibleClient } from "../../../../packages/agent/src/provider_client";

export const KILO_GATEWAY_BASE_URL = "https://ai-gateway.kilo.ai/api";
export const KILO_FREE_MODEL = "kilo-auto/free";

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
