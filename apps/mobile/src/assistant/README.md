# Mobile Assistant and Diagnostics

## Overview

On-device AI assistant integration, diagnostics engine, secure credential storage, and conversation management for the React Native mobile application. Provides Hermes runtime crypto polyfills, secure BYOK key handling, and the bounded read-only ledger Q&A loop.

## Interface

- **Web Crypto Polyfill (`web_crypto.ts`)**:
  - `install_web_crypto(): void`: Polyfills `globalThis.crypto.getRandomValues` using `expo-crypto` for Hermes compatibility before LangChain evaluation.
- **Mobile QA Loop (`mobile_qa.ts`)**:
  - `create_mobile_qa_agent`: Instantiates `LangChainQaAgent` configured with `OpenAICompatibleClient` or `AnthropicMessagesClient` and `PrivacyRedactor`.
  - `mobile_qa_failure_message`: Formats user-facing error explanations for provider failure codes.
  - Constants & Types: `KILO_GATEWAY_BASE_URL`, `KILO_FREE_MODEL`, `ANTHROPIC_DEFAULT_MODEL`, `MobileQaProvider`, `MobileQaProviderKind`, `QaStopReason`.
- **Diagnostics (`diagnostics.ts`)**:
  - `MobileDiagnostics`, `mobile_diagnostics`: Circular in-memory diagnostic event recorder capturing up to 300 allowlisted event codes.
  - Constants & Types: `DIAGNOSTICS_BUILD_ENABLED`, `DIAGNOSTIC_CODES`, `DIAGNOSTIC_SOURCES`, `DIAGNOSTIC_OUTCOMES`, `DIAGNOSTIC_PROVIDERS`, `DIAGNOSTIC_REASONS`, `DIAGNOSTIC_TOOLS`, `DIAGNOSTIC_FAILURE_STAGES`, `DiagnosticEntry`, `MobileDiagnosticsOptions`.
- **Diagnostic Export & Storage (`diagnostic_export.ts`, `expo_diagnostic_storage.ts`)**:
  - `save_diagnostic_log`: Persists diagnostic JSON logs to a user-selected storage directory.
  - `export_mobile_diagnostic_log`: Initiates Storage Access Framework (SAF) folder picker and exports diagnostic log.
  - `expo_diagnostic_download_storage`: Adapter binding SAF folder selection and file writing.
  - `DiagnosticExportError`, `DiagnosticSelectedLocation`, `DiagnosticDirectorySelection`, `DiagnosticDownloadStorage`.
- **Secure Key Storage (`secure_key.ts`)**:
  - Functions: `save_kilo_key`, `read_kilo_key`, `remove_kilo_key`, `save_openai_compatible_key`, `read_openai_compatible_key`, `remove_openai_compatible_key`, `save_anthropic_api_key`, `read_anthropic_api_key`, `remove_anthropic_api_key`, `save_assistant_provider_profile`, `read_assistant_provider_profile`.
  - Constants & Types: `KILO_KEY_NAME`, `OPENAI_COMPATIBLE_KEY_NAME`, `ANTHROPIC_API_KEY_NAME`, `ASSISTANT_PROVIDER_PROFILE_NAME`, `DEFAULT_ASSISTANT_PROVIDER_PROFILE`, `SecureKeyStore`, `AssistantProviderProfile`, `AssistantProviderSelection`.
- **Key Profile Management & Model Discovery (`provider_keys.ts`)**:
  - Functions: `read_key_registry`, `read_key_secret`, `read_key_secret_state`, `add_key_profile`, `update_key_profile`, `activate_key_profile`, `remove_key_profile`, `fetch_model_choices`, `test_connection`, `read_connection_check`, `record_connection_check`, `forget_connection_check`, `reset_key_registry`.
  - Constants & Types: `KEY_PROFILES_NAME`, `KeyProfile`, `KeyProfileRegistry` (`source: "keystore" | "manifest"`), `ModelChoice`, `KeyProvider`, `KeyRegistryUnreadableError`.
  - A read never writes. When the keystore refuses, the list is rebuilt read-only from `profile_manifest.ts` and marked `source: "manifest"`.
- **Profile Manifest (`profile_manifest.ts`)**: plain-storage mirror of the non-secret profile fields (id, provider kind, label, endpoint, model, wire-shape overrides), the active id and the last connection check. Never a credential: fields are copied from an explicit allowlist, not spread. See `DECISIONS.md`.
  - Functions: `read_manifest`, `write_manifest`, `record_manifest_check`, `remove_manifest_check`, `clear_manifest`.
  - Constants & Types: `KEY_MANIFEST_NAME`, `KeyManifest`, `ManifestProfile`, `ManifestStore`.
- **Connection Check (`connection_check.ts`)**: `ConnectionCheck`, `parse_connection_check`, `UNTESTED`. Shared by the registry and the manifest so neither imports the other.
- **Conversations (`conversations.ts`)**:
  - Functions: `load_conversations`, `create_conversation`, `save_conversation_messages`, `select_conversation`, `delete_conversation`.
  - Constants & Types: `CONVERSATIONS_KEY`, `LocalConversation`, `ConversationIndex`.
- **Legacy Chat History (`chat_history.ts`)**:
  - Functions: `load_chat_history`, `save_chat_history`, `clear_chat_history`.
  - Constants: `CHAT_HISTORY_KEY`.
- **Custom Instructions (`custom_instructions.ts`)**:
  - Functions: `read_instructions`, `save_instructions`, `question_with_instructions`.
  - Constants: `INSTRUCTIONS_KEY`.

## Invariants

- Assistant execution is strictly read-only; the assistant cannot mutate the ledger, approve proposals, or alter database rows.
- All outbound prompts are sanitized through `PrivacyRedactor` prior to transmission.
- API keys are stored strictly in `expo-secure-store` and are never logged, exported in diagnostics, or written to standard SQLite tables.
- Diagnostic logging uses an allowlist of primitive codes; freeform error strings and user metadata are excluded.
- Conversation messages containing sensitive or invalid content are dropped before persistence.

## Side Effects

- Outbound HTTPS network calls to LLM provider endpoints.
- Secure read/write/delete operations on hardware-backed keystore via `expo-secure-store`.
- Key-value database read/write operations via `expo-sqlite/kv-store`.

## Verification

- Run: `npm test`
