# BYOK Credential Lifecycle

**Architectural Decision Record and Technical Specification**

This document specifies the lifecycle, validation, storage architecture, and failure semantics for Bring-Your-Own-Key (BYOK) provider credentials in the Vittaz mobile client. It records the baseline architecture established in commit [`6982b0e`](https://github.com/OnlyXianzo/Vittaz/commit/6982b0e), the enhancements implemented in [PR #90](https://github.com/OnlyXianzo/Vittaz/pull/90), and the trade-offs governing provider credentials.

---

## 1. Executive Summary & Status

| Lifecycle Area                        | Baseline Architecture ([`6982b0e`](https://github.com/OnlyXianzo/Vittaz/commit/6982b0e))              | Implemented in PR #90                                                                                                                                                    | Status                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| **Validation at Entry**               | Syntax validation only; manual "Fetch models" button.                                                 | Automatic save-time validation for pinned hosts; on-demand "Test connection" row for arbitrary endpoints. Distinct 401/403/404/network error taxonomy.                   | **Implemented**                       |
| **Keystore Invalidation & Lifecycle** | Keystore errors bubble or silently wipe registry; profile list shares fate of secrets in SecureStore. | Plaintext manifest mirror (`profile_manifest.ts`) preserves non-secret rows across lock-screen resets. Explicit alias deletion before write. Backup extraction disabled. | **Implemented**                       |
| **Multi-Profile Routing**             | Single active profile projected to legacy slots; no cross-provider fallback pools.                    | Single active profile maintained; fail-closed boundary preserved; cross-provider fallback explicitly rejected.                                                           | **Design Preserved**                  |
| **Rate-Limit & Offline Semantics**    | In-flight failure codes (`BYOK_*`); `Retry-After` dropped; cooldown lost between questions.           | `Retry-After` parsed and wired through `ReadOnlyQaLoop` to `record_provider_outcome`. Per-process health tracking. Pre-dispatch connectivity check deferred.             | **Implemented (Health process-only)** |

---

## 2. Problem Statement & Context

Personal financial management requires strong data isolation. Vittaz permits optional cloud AI assistance through user-provided API keys (BYOK). However, mobile credential handling faces distinct edge cases:

1. **Keystore Loss**: On Android, hardware keystore aliases are invalidated when the user alters lock-screen credentials (PIN, pattern, biometrics). Storing profile metadata exclusively in `expo-secure-store` caused the entire profile list to vanish when the keystore became unreadable, misleading users into believing their entire account configuration had been wiped.
2. **Silent Failure & Broken Backoff**: Upstream provider 429 rate-limiting headers (`Retry-After`) were extracted by low-level HTTP adapters but discarded before reaching mobile state, causing rapid retries and repeated quota exhaustion.
3. **SSRF & Key Exfiltration**: Automatically testing connection on save against arbitrary custom URLs risks exfiltrating user credentials to malicious endpoints.

---

## 3. Validation at Entry vs. Execution

### 3.1 Syntax vs. Network Validation

Syntax validation is performed locally and synchronously in [`validate_profile`](../apps/mobile/src/assistant/provider_keys.ts):

- Protocol must strictly be `https:`.
- No userinfo, query parameters, or URL fragments are permitted.
- Whitespace is stripped and length is bounded.

Syntax validation serves as the sole blocking gate before writing a profile to local storage. Network reachability must never prevent a user from saving a key locally.

### 3.2 Save-Time Validation & SSRF Prevention

Upon saving a key profile:

1. **Pinned Hosts**: For verified standard providers (`api.openai.com`, `api.anthropic.com`, `ai-gateway.kilo.ai`), [`KeysScreen`](../apps/mobile/src/screens/KeysScreen.tsx) initiates an automatic background discovery request (`GET {base_url}/models`) via [`test_connection`](../apps/mobile/src/assistant/provider_keys.ts) to verify credential validity.
2. **Custom / Untrusted Endpoints**: For custom `openai_compatible` endpoints, automated background requests are suppressed to prevent credential exfiltration (SSRF). The user must explicitly press the manual **Test connection** button on the profile card.
3. **Timeout Enforcement**: All discovery requests enforce a 5,000 ms timeout via `AbortController` in [`fetch_model_choices`](../apps/mobile/src/assistant/provider_keys.ts).

### 3.3 Semantic Interpretation of Connection Checks

A successful discovery response (HTTP 200) proves reachability and model discovery entitlement only. It does **not** guarantee chat completion access, quota availability, or model-tier entitlements. The UI surfaces this outcome precisely as:
`Endpoint reachable · key accepted · N models`

Connection outcomes are classified into distinct failure categories:

- **`rejected`**: HTTP 401 or 403 returned by the endpoint (invalid credential).
- **`not_found`**: HTTP 404 returned by the endpoint (invalid path or base URL).
- **`unreachable`**: Network disconnection, DNS resolution failure, or 5,000 ms timeout.
- **`untested`**: Initial state or state after modifying base URL, model, or API key.

---

## 4. Key Storage, Keystore Invalidation & Threat Model

### 4.1 Storage Architecture

Credential storage divides operational metadata from cryptographic secrets:

```
+--------------------------------------------------------------------------+
|                              Vittaz Mobile                               |
|                                                                          |
|  +---------------------------------+  +-------------------------------+  |
|  |     expo-secure-store           |  |      expo-sqlite/kv-store     |  |
|  |     (Android Keystore)          |  |  (vittaz.assistant.key_man.)  |  |
|  +---------------------------------+  +-------------------------------+  |
|  | • api_key secret per profile    |  | • profile_id                  |  |
|  | • Authoritative key registry    |  | • provider kind               |  |
|  |                                 |  | • label                       |  |
|  |                                 |  | • base_url & model            |  |
|  |                                 |  | • last ConnectionCheck        |  |
|  +---------------------------------+  +-------------------------------+  |
+--------------------------------------------------------------------------+
```

1. **Secrets (`expo-secure-store`)**: API keys are encrypted at rest using platform-managed hardware keystores. Keys are indexed by profile ID (`vittaz_key_<id>`).
2. **Manifest (`expo-sqlite/kv-store`)**: Non-secret metadata is stored in `vittaz.assistant.key_manifest.v1` via [`profile_manifest.ts`](../apps/mobile/src/assistant/profile_manifest.ts). Only allowlisted fields are persisted; secrets are strictly excluded by construction.
3. **Replacement writes**: Existing secrets are overwritten without pre-deletion. A failed write must not proactively erase the previous key. Recovery of genuinely invalidated Android aliases remains device-unverified; no automatic destructive reset is claimed.

### 4.2 Recovery Flow on Keystore Invalidation

When hardware keystore reads fail:

1. [`read_key_registry`](../apps/mobile/src/assistant/provider_keys.ts) catches the error and recovers non-secret profile rows from [`read_manifest`](../apps/mobile/src/assistant/profile_manifest.ts), tagging the registry with `source: "manifest"`.
2. The read operation is strictly non-mutating; it does not overwrite keystore records. If the keystore recovers after reboot, original secrets remain intact.
3. [`read_key_secret_state`](../apps/mobile/src/assistant/provider_keys.ts) evaluates each profile individually. If a key is unreadable, the UI displays `Key unreadable — re-enter` for that specific row.
4. When any profile is unreadable, [`KeysScreen`](../apps/mobile/src/screens/KeysScreen.tsx) renders an informative recovery banner advising the user to re-enter credentials.

### 4.3 Backup & Extraction Threat Model

Plaintext manifest storage risks data exposure if transferred off-device during cloud backups:

- **Android Auto Backup**: Disabled by setting `"allowBackup": false` in [`apps/mobile/app.json`](../apps/mobile/app.json) under the `android` stanza.
- **Limits**: This disables Android app backup participation; it does not protect against rooted devices, debug access, or every manufacturer-specific transfer path. Native configuration and device behaviour remain unverified.
- Reference: Documented in [`docs/PRIVACY.md`](../docs/PRIVACY.md) and [`DECISIONS.md`](../DECISIONS.md).

---

## 5. Multi-Profile Routing & Routing Invariants

### 5.1 Single Active Profile Contract

Vittaz enforces a strict single-active-profile model:

- Only one provider profile is active at any given moment.
- The active profile is projected to legacy slots in [`activate_key_profile`](../apps/mobile/src/assistant/provider_keys.ts) to maintain backward compatibility.
- **Zero Cross-Provider Fallback**: If a request to the active provider fails, the request fails immediately and closed. The system will **never** silently divert prompts, financial data, or user queries to an alternate provider or model pool.

### 5.2 Named Explicit Routing (Deferred Non-Goal)

Dynamic or prompt-dependent routing ("send small tasks to local models, complex tasks to cloud") is rejected because evaluating prompt complexity requires inspecting content, compromising user privacy.

Future routing capabilities, if developed, will follow declarative, user-defined rules (e.g., "Category Classification → Profile A; General Q&A → Profile B") where routes are explicit, visible in settings, and fail closed.

---

## 6. Rate-Limiting, `Retry-After` & Error Propagation

### 6.1 End-to-End `Retry-After` Pipeline

When an upstream provider responds with HTTP 429 Too Many Requests:

1. **Header Extraction**: [`retry_after_ms`](../packages/agent/src/providers/adapters/retry_after.ts) parses standard HTTP `Retry-After` headers (both integer delta-seconds and RFC 7231 HTTP-date strings), capping values to 86,400,000 ms (24 hours).
2. **Adapter Propagation**: [`ai_sdk.ts`](../packages/agent/src/providers/adapters/ai_sdk.ts) records `retry_after_ms` into the failure record of [`AllKeysFailedError`](../packages/agent/src/key_pool.ts).
3. **Agent Q&A Loop**: [`ReadOnlyQaLoop.answerQuestion`](../packages/agent/src/qa_loop.ts) extracts `retry_after_ms` from `AllKeysFailedError` and populates [`AnswerQuestionResult.retry_after_ms`](../packages/agent/src/qa_loop.ts).
4. **Mobile State Update**: [`store.tsx`](../apps/mobile/src/store.tsx) passes `result.retry_after_ms` and `Date.now()` into [`record_provider_outcome`](../apps/mobile/src/assistant/provider_health.ts).

### 6.2 Provider Health Tracking

- **In-Memory Per-Process**: Provider cooldowns are maintained in memory via [`provider_health.ts`](../apps/mobile/src/assistant/provider_health.ts). If an upstream provider omits `Retry-After`, the client defaults to a 30-second backoff (`DEFAULT_COOLDOWN_MS`).
- **Success Reset**: A successful answer explicitly clears provider cooldowns via [`clear_provider_health`](../apps/mobile/src/assistant/provider_health.ts).
- **Process Scope**: Provider health is intentionally process-scoped. It is not persisted to disk to avoid storing operational metadata without explicit user consent.

---

## 7. Alternatives Considered

1. **Hardware-Only Secret Storage (Status Quo Before PR #90)**:
   - _Alternative_: Keep all registry metadata inside `expo-secure-store`.
   - _Rejection Reason_: Unrecoverable user friction. A biometric change or device password reset caused all profile labels and endpoints to disappear without recourse.
2. **Automated Save Validation on All Endpoints**:
   - _Alternative_: Automatically execute `fetch_model_choices` upon saving any endpoint.
   - _Rejection Reason_: Security vulnerability. Allows attacker-supplied endpoints in saved profiles to exfiltrate valid API keys via automatic outbound GET requests. The allowlist reduces unsolicited requests; it is not a complete SSRF or redirect security boundary.
3. **Cross-Provider Fallback Pools**:
   - _Alternative_: When Provider A is rate-limited (HTTP 429), automatically reroute query to Provider B.
   - _Rejection Reason_: Violates core Vittaz privacy boundaries. Prompts must only ever be dispatched to the user's explicitly selected active provider.

---

## 8. Deprecation Boundary: Single-Key Projection Shims

To maintain backward compatibility with legacy single-key callers, [`provider_keys.ts`](../apps/mobile/src/assistant/provider_keys.ts) projects the active profile into legacy storage slots (`save_openai_compatible_key`, `save_anthropic_api_key`, `save_kilo_key`).

**Deprecation Plan**:

- Legacy projection shims are retained as read/write mirrors until profile management passes end-to-end device testing.
- Direct consumption of single-key slots in [`store.tsx`](../apps/mobile/src/store.tsx) will be migrated to query [`read_key_registry`](../apps/mobile/src/assistant/provider_keys.ts) exclusively.
- Legacy slots will be retired once full profile management is verified in end-to-end device testing.
