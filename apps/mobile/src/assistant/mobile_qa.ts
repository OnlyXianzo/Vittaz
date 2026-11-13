import { fetch as expo_fetch } from "expo/fetch";
import { getWalletSummary, PrivacyRedactor } from "@vittaz/core";
import type { LedgerStore } from "@vittaz/core";
import type { QaStopReason } from "../../../../packages/agent/src/qa_loop";
export type { QaStopReason };
import { ReadOnlyQaLoop } from "../../../../packages/agent/src/qa_loop";
import {
  create_anthropic_provider,
  create_ai_sdk_provider,
} from "../../../../packages/agent/src/providers";
import type { AgentDiagnosticEvent } from "../../../../packages/agent/src/diagnostics";
import { ANTHROPIC_DEFAULT_MODEL } from "../../../../packages/agent/src/providers";
export { ANTHROPIC_DEFAULT_MODEL };
import type { CompletionClient } from "../../../../packages/agent/src/provider_client";
import { mobile_diagnostics } from "./diagnostics";
import type { MobileDiagnostics } from "./diagnostics";

export const KILO_GATEWAY_BASE_URL = "https://ai-gateway.kilo.ai/api";
export const KILO_FREE_MODEL = "kilo-auto/free";

export type MobileQaProvider =
  | { kind: "kilo"; api_key: string | null }
  | {
      kind: "openai_compatible";
      api_key: string;
      base_url: string;
      model: string;
    }
  | { kind: "anthropic"; api_key: string };

export type MobileQaProviderKind = MobileQaProvider["kind"];

const kilo_failure_copy: Record<QaStopReason, string> = {
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

const openai_compatible_failure_copy: Record<QaStopReason, string> = {
  completed: "The assistant could not produce a safe answer.",
  message_rejected:
    "This question was blocked by the assistant's safety rules.",
  sensitive_dropped:
    "This question may contain sensitive information. Use synthetic data only.",
  provider_auth_failed:
    "The OpenAI-compatible service rejected authentication. Check the key in Model settings. Code: BYOK_AUTH. No ledger changes were made.",
  provider_rate_limited:
    "The OpenAI-compatible service is rate-limiting requests. Try again later. Code: BYOK_RATE_LIMIT. No ledger changes were made.",
  provider_request_rejected:
    "The OpenAI-compatible service rejected this request format. Code: BYOK_REQUEST_REJECTED. No ledger changes were made.",
  provider_connection_failed:
    "The app could not connect to the selected OpenAI-compatible service. Check the endpoint and network. Code: BYOK_CONNECTION. No ledger changes were made.",
  provider_unavailable:
    "The selected OpenAI-compatible service is temporarily unavailable. Try again later. Code: BYOK_UNAVAILABLE. No ledger changes were made.",
  provider_access_denied:
    "The selected OpenAI-compatible service denied access to this model. Check its model settings. Code: BYOK_ACCESS. No ledger changes were made.",
  provider_protocol_error:
    "The OpenAI-compatible service replied in an unsupported format, so no answer was accepted. Code: BYOK_PROTOCOL. No ledger changes were made.",
  provider_http_error:
    "The OpenAI-compatible service returned an HTTP error. Code: BYOK_HTTP. No ledger changes were made.",
  provider_error:
    "The selected provider request failed for an unclassified reason. If it continues, report code BYOK_UNKNOWN. No ledger changes were made.",
  tool_rejected:
    "I couldn't safely finish the read-only ledger lookup. No ledger changes were made.",
  step_limit:
    "I couldn't safely complete that question within the request limits.",
  token_budget:
    "I couldn't safely complete that question within the response limit.",
  timeout:
    "The selected provider request timed out. Check your connection and try again.",
  aborted: "The request was canceled.",
};

const anthropic_failure_copy: Record<QaStopReason, string> = {
  completed: "The assistant could not produce a safe answer.",
  message_rejected:
    "This question was blocked by the assistant's safety rules.",
  sensitive_dropped:
    "This question may contain sensitive information. Use synthetic data only.",
  provider_auth_failed:
    "Anthropic rejected API-key authentication. Verify the key in Model settings. Code: ANTHROPIC_AUTH. No ledger changes were made.",
  provider_rate_limited:
    "Anthropic is rate-limiting requests. Try again later. Code: ANTHROPIC_RATE_LIMIT. No ledger changes were made.",
  provider_request_rejected:
    "Anthropic rejected this Messages API request. Check the selected model and request settings. Code: ANTHROPIC_REQUEST_REJECTED. No ledger changes were made.",
  provider_connection_failed:
    "The app could not connect to Anthropic. Check the network and try again. Code: ANTHROPIC_CONNECTION. No ledger changes were made.",
  provider_unavailable:
    "Anthropic is temporarily unavailable. Try again later. Code: ANTHROPIC_UNAVAILABLE. No ledger changes were made.",
  provider_access_denied:
    "Anthropic denied access to the selected model or account. Check Console access. Code: ANTHROPIC_ACCESS. No ledger changes were made.",
  provider_protocol_error:
    "Anthropic replied in an unsupported format, so no answer was accepted. Code: ANTHROPIC_PROTOCOL. No ledger changes were made.",
  provider_http_error:
    "Anthropic returned an HTTP error. Check the account and API request. Code: ANTHROPIC_HTTP. No ledger changes were made.",
  provider_error:
    "The Anthropic request failed for an unclassified reason. If it continues, report code ANTHROPIC_UNKNOWN. No ledger changes were made.",
  tool_rejected:
    "I couldn't safely finish the read-only ledger lookup. No ledger changes were made.",
  step_limit:
    "I couldn't safely complete that question within the request limits.",
  token_budget:
    "I couldn't safely complete that question within the response limit.",
  timeout:
    "The Anthropic request timed out. Check your connection and try again.",
  aborted: "The request was canceled.",
};

export function mobile_qa_failure_message(
  reason: QaStopReason,
  provider: MobileQaProviderKind = "kilo",
): string {
  return provider === "anthropic"
    ? anthropic_failure_copy[reason]
    : provider === "openai_compatible"
      ? openai_compatible_failure_copy[reason]
      : kilo_failure_copy[reason];
}

function validate_openai_compatible_provider(provider: {
  api_key: string;
  base_url: string;
  model: string;
}): { base_url: string; model: string } {
  try {
    const key = provider.api_key.trim();
    const has_control_character = Array.from(key).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    });
    const url = new URL(provider.base_url.trim());
    const model = provider.model.trim();
    if (
      !key ||
      key.length > 4096 ||
      /\s/.test(key) ||
      has_control_character ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)
    )
      throw new Error();
    url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/v1$/i, "");
    return { base_url: url.origin + url.pathname, model };
  } catch {
    throw new Error("Invalid provider configuration");
  }
}

/** S37 reuses the bounded, read-only ledger Q&A loop for explicitly selected providers. */
export function create_mobile_qa_agent(
  ledger: LedgerStore,
  provider: MobileQaProvider,
  fetch_impl: typeof fetch = expo_fetch,
  diagnostics: Pick<MobileDiagnostics, "record"> = mobile_diagnostics,
) {
  const redactor = new PrivacyRedactor();
  const on_diagnostic = (event: AgentDiagnosticEvent) =>
    diagnostics.record(
      event.event_code,
      event.source,
      event.outcome,
      provider.kind,
      event.reason_code,
      event.http_status,
      event.elapsed_ms,
      event.tool_name,
      event.count,
      event.failure_stage,
    );
  // The provider contract owns configuration and credential references; the
  // transports below it stay the only authority for wire behavior. The key is
  // already read from secure storage by the caller and is resolved through a
  // closure, so it never enters a configuration object.
  let credential = "";
  const dependencies = {
    resolve_credential: async () => credential,
    fetch: fetch_impl,
    timeout_ms: 45000,
    redactor,
  };
  let client: CompletionClient;
  if (provider.kind === "anthropic") {
    credential = provider.api_key;
    client = create_anthropic_provider(
      {
        id: "anthropic_byok",
        kind: "anthropic",
        credential_ref: "anthropic_api_key",
        default_model: ANTHROPIC_DEFAULT_MODEL,
        key_nickname: "anthropic_byok",
      },
      dependencies,
    );
  } else {
    const kilo_selected = provider.kind === "kilo";
    const profile = kilo_selected
      ? null
      : validate_openai_compatible_provider(provider);
    credential = provider.api_key ?? "";
    client = create_ai_sdk_provider(
      {
        id: kilo_selected ? "kilo_free" : "openai_compatible_byok",
        kind: "openai_compatible",
        // An empty reference means deliberately keyless (Kilo Auto Free).
        credential_ref: kilo_selected
          ? provider.api_key
            ? "kilo_gateway_api_key"
            : ""
          : "openai_compatible_api_key",
        base_url: kilo_selected ? KILO_GATEWAY_BASE_URL : profile!.base_url,
        default_model: kilo_selected ? KILO_FREE_MODEL : profile!.model,
        key_nickname: kilo_selected ? "kilo_free" : "openai_compatible_byok",
      },
      dependencies,
    );
  }
  return new ReadOnlyQaLoop({
    client,
    redactor,
    onDiagnostic: on_diagnostic,
    data: {
      listTransactions: () => ledger.read((repos) => repos.transactions.list()),
      getWalletSummary: (wallet_id) => getWalletSummary(ledger, wallet_id),
    },
  });
}
