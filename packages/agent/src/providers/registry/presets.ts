import type { ProviderAuth } from "../contracts/provider.js";

/**
 * Known-good endpoint shapes, as **data**.
 *
 * This file must stay data. A preset is a prefilled base URL plus how that
 * server wants its key; there is no `if (provider === "groq")` anywhere in the
 * transport, and adding a provider here changes no behaviour beyond the values
 * it is handed. That is the whole reason "any OpenAI-compatible key works"
 * stays true as this list grows.
 *
 * Anything not listed is still supported: a custom entry is just
 * `{ base_url, api_key, model }` — or an `api_suffix` / `auth` override for
 * servers that deviate.
 */
export interface ProviderPreset {
  /** Stable id; also the default profile id. */
  readonly id: string;
  /** Shown in the picker. */
  readonly label: string;
  /**
   * `openai_compatible` for anything speaking OpenAI's shape.
   * `anthropic` for Anthropic's own Messages API.
   */
  readonly kind: "openai_compatible" | "anthropic";
  /** Host prefix. The transport appends `api_suffix`. */
  readonly base_url?: string;
  /** Defaults to `/v1`; differs for Google's compatibility layer. */
  readonly api_suffix?: string;
  readonly auth?: ProviderAuth;
  /** Path appended to `api_suffix` when listing models. */
  readonly models_path?: string;
  /** A starting model when discovery is unavailable. */
  readonly default_model?: string;
  /** Free-text hint shown next to the key field. */
  readonly key_hint?: string;
  /** True when the endpoint tolerates a missing key. */
  readonly keyless?: boolean;
  /** Anything the user must know before sending real ledger data. */
  readonly note?: string;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai_compatible",
    base_url: "https://api.openai.com",
    key_hint: "sk-…",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai_compatible",
    base_url: "https://openrouter.ai/api",
    key_hint: "sk-or-v1-…",
    note: "Routes prompts to many downstream providers; check their data policy.",
  },
  {
    id: "groq",
    label: "Groq",
    kind: "openai_compatible",
    base_url: "https://api.groq.com/openai",
    key_hint: "gsk_…",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai_compatible",
    base_url: "https://api.deepseek.com",
  },
  {
    id: "together",
    label: "Together",
    kind: "openai_compatible",
    base_url: "https://api.together.xyz",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    kind: "openai_compatible",
    base_url: "https://api.x.ai",
  },
  {
    id: "mistral",
    label: "Mistral",
    kind: "openai_compatible",
    base_url: "https://api.mistral.ai",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    kind: "openai_compatible",
    // Google's OpenAI-compatibility layer. It is NOT under `/v1`, which is why
    // `api_suffix` exists: with the old hard-coded `/v1` this returned 404.
    base_url: "https://generativelanguage.googleapis.com",
    api_suffix: "/v1beta/openai",
    key_hint: "AIza… (Google AI Studio key)",
    // Live-verified 2026-11-11 against a real key: `gemini-2.5-flash` and
    // `gemini-2.5-pro` are retired (404 "no longer available to new users"),
    // and the replacement Google names, `gemini-3.8-flash`, answered 503
    // (high demand) throughout testing. `gemini-3-flash-preview` answered in
    // ~0.9 s with correct usage and tool calls, so it is the shipped default.
    default_model: "gemini-3-flash-preview",
  },
  {
    id: "ollama",
    label: "Ollama (on this device or your LAN)",
    kind: "openai_compatible",
    // Plain http on loopback/LAN only; the transport rejects http elsewhere.
    base_url: "http://127.0.0.1:11434",
    default_model: "llama3.2",
    keyless: true,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    key_hint: "sk-ant-…",
  },
];

/**
 * Providers that are **not** usable from a phone app, and why. Kept next to the
 * presets so the answer is recorded rather than rediscovered.
 *
 * These are absent from `PROVIDER_PRESETS` deliberately.
 */
export const UNSUPPORTED_PROVIDERS: readonly {
  readonly label: string;
  readonly reason: string;
  readonly alternative?: string;
}[] = [
  {
    label: "AWS Bedrock (SigV4)",
    reason:
      "The SDK signs requests with SigV4, which needs WebCrypto SHA-256 at " +
      "request time. This project has a regression test asserting the " +
      "transport works with `globalThis.crypto` removed (a real device fault " +
      "seen before), so adding SigV4 would reintroduce exactly that failure.",
    alternative:
      "Use a Bedrock API key (bearer token) if AWS has issued you one, as an " +
      "openai_compatible entry — or reach Bedrock through a gateway that " +
      "accepts a plain key.",
  },
  {
    label: "Google Vertex AI",
    reason:
      "Vertex authenticates with a service-account JSON or a short-lived OAuth " +
      "token. A service-account file on a phone grants broad cloud access and " +
      "cannot be protected by an app passcode, so it is not something this app " +
      "should store.",
    alternative:
      "Use the Gemini preset: the same Gemini models, authenticated with a " +
      "plain AI Studio key.",
  },
];
