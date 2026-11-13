> **Superseded 2026-11-11.** This evaluation recommended _against_ adopting the
> Vercel AI SDK. The owner decided otherwise and the SDK is now the
> OpenAI-compatible transport, on device. The reasoning below is kept as the
> record of what was weighed; for what was actually built and which differences
> were accepted, read `DECISIONS.md` (2026-11-11 entry) and §5 of
> `docs/PROVIDER_ARCHITECTURE_BRIEF.md`.

# Vercel AI SDK evaluation for Vittaz providers

Status: **evaluated, not adopted.** The existing LangChain-based provider layer and
both direct provider clients are unchanged. Evidence, reproduction steps and the
remaining blockers are recorded here.

- Evaluated 2026-11-11 against `ai@7.0.169`, `@ai-sdk/anthropic@4.0.102`,
  `@ai-sdk/openai@4.0.114`, `@ai-sdk/openai-compatible@3.0.90` (`@ai-sdk/provider@4.0.37`,
  `@ai-sdk/provider-utils@5.0.79`).
- Repository state evaluated: `main` at `2e81453`.
- Spike branch: `spike/ai-sdk-provider` (harness only, no production wiring).
- Decision recorded in `DECISIONS.md` ("Vercel AI SDK evaluation").
- References recorded in `docs/references.md` ("Vercel AI SDK evaluation references").

## 1. What the existing implementation actually is

The brief describes "the existing LangChain-based provider implementation". Before
changing anything, the code was read end to end. LangChain is **not** the provider
transport in Vittaz:

| Layer                         | Module                                                                        | What it really does                                                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport (OpenAI-compatible) | `packages/agent/src/provider_client.ts` (`OpenAICompatibleClient`)            | Own `fetch`, own SSE parser, own zod wire validation, own key pool, own error classification                                                                                                         |
| Transport (Anthropic)         | `packages/agent/src/anthropic_messages_client.ts` (`AnthropicMessagesClient`) | Own `fetch`, own Messages SSE state machine, own error classification                                                                                                                                |
| Framework decorator           | `packages/agent/src/langchain_adapter.ts` (`LangChainCompletionClient`)       | Wraps a `CompletionClient` in a one-shot `BaseChatModel` whose `_generate()` just calls it. Adds a no-telemetry callback policy, buffers (disables) streaming, and reports `langchain_*` diagnostics |
| Loop and policy               | `packages/agent/src/qa_loop.ts` (`ReadOnlyQaLoop`)                            | Step/token/timeout bounds, read-only tool executor, sensitive-text checks, privacy redaction, normalized `QaStopReason`                                                                              |
| Tools                         | `packages/agent/src/tools.ts`                                                 | Fixed read-only tool spec list plus the separate proposal tool that only creates a pending proposal                                                                                                  |

Consequences that matter for this evaluation:

1. **No LangChain model, provider, chain, agent, memory, retriever or tracer is used.**
   `@langchain/core@1.3.4` is imported for `BaseChatModel`, `AIMessage`,
   `ChatMessage` and `CallbackManager` only.
2. **LangChain cannot improve provider coverage.** Adding a provider is already a new
   `CompletionClient` implementation, not a LangChain concern.
3. **LangChain is the only reason the assistant needs Web Crypto.** `BaseChatModel.invoke`
   mints a UUID v7 run id through `crypto.getRandomValues` before `_generate` runs
   (`docs/references.md`, S38 root-cause entry). That is the historical
   `KILO_UNKNOWN` failure, and `apps/mobile/src/assistant/web_crypto.ts` exists solely
   to patch the global for it.
4. Streaming is deliberately buffered by the decorator: `LangChainCompletionClient`
   rejects any request carrying `onStreamDelta`/`onStreamReset`. Progressive UI today
   comes from pacing already-validated answer text in `qa_loop.ts`, not from provider
   deltas.

So the migration question is narrower than it looks. Replacing "LangChain" alone would
delete a decorator and leave the hardened transports in place. Replacing the provider
layer with the AI SDK would instead replace the hardened transports with the SDK's own
`fetch`/SSE/error machinery — a much larger behavioral change.

### Baseline that must stay identical

Recorded before any edit (Node 24.22.2, npm 11.19.1):

| Check                            | Result                                              |
| -------------------------------- | --------------------------------------------------- |
| `npm run typecheck`              | clean                                               |
| `npm run build`                  | clean                                               |
| `npm test` (root vitest)         | 58 files / 395 tests pass                           |
| `apps/mobile` `npx jest`         | 15 suites / 102 tests pass                          |
| `expo export --platform android` | bundles, 1,438 modules, 5,791,858 B Hermes bytecode |

Behavioral invariants identified as non-negotiable:

- `AllKeysFailedError` reason codes (`unauthorized`, `rate_limited`, `connection_error`,
  `access_denied`, `provider_unavailable`, `provider_http_error`, `protocol_error`,
  `provider_error`) and `BadRequestNoFallbackError` for HTTP 400.
- `QaStopReason` mapping and the per-provider failure copy that produces `KILO_*`,
  `BYOK_*` and `ANTHROPIC_*` user-visible codes.
- Fail-closed credential handling: missing key produces `missing_credential`, never a
  silent fallback to another provider or key.
- `validateCompletionRequest` (zod strict objects, 64 KiB body cap, sensitive-message
  rejection, outbound redaction) as the single preflight for every request.
- Read-only tool allowlist and the pending-proposal-only write path.
- Diagnostics are codebook-only: no prompts, replies, keys, URLs, bodies or stack traces.

### Duplication found

- Two transports duplicate SSE framing and error classification
  (`provider_client.ts`, `anthropic_messages_client.ts`). Acceptable: the wire formats
  differ, and tests cover both.
- `apps/mobile/src/assistant/mobile_qa.ts` duplicates provider validation that also
  exists in the clients (`validate_openai_compatible_provider`).
- Three parallel failure-copy tables (`kilo`, `openai_compatible`, `anthropic`) that
  differ only in code names.
- **The one true gap for "OpenCode-style" multi-provider:** persistence. The secure
  profile stores exactly one `selected_provider` + one `base_url` + one `model`
  (`apps/mobile/src/assistant/secure_key.ts`). Multiple labeled keys already exist
  (S38c), but multiple _endpoints/accounts_ cannot be configured and selected.

## 2. Packages evaluated

All Apache-2.0, all actively published, all declare `engines.node >= 22` (a Node-only
constraint Metro ignores). Peer dependency: `zod ^3.25.76 || ^4.1.8`; Vittaz already
pins `zod@4.6.7`.

| Package                     | Version | License    | Runtime deps                                                                                  |
| --------------------------- | ------- | ---------- | --------------------------------------------------------------------------------------------- |
| `ai`                        | 7.0.169 | Apache-2.0 | `@ai-sdk/gateway@4.0.142`, `@ai-sdk/provider@4.0.37`, `@ai-sdk/provider-utils@5.0.79`         |
| `@ai-sdk/anthropic`         | 4.0.102 | Apache-2.0 | `@ai-sdk/provider`, `@ai-sdk/provider-utils`                                                  |
| `@ai-sdk/openai`            | 4.0.114 | Apache-2.0 | `@ai-sdk/provider`, `@ai-sdk/provider-utils`                                                  |
| `@ai-sdk/openai-compatible` | 3.0.90  | Apache-2.0 | `@ai-sdk/provider`, `@ai-sdk/provider-utils`                                                  |
| `@ai-sdk/provider-utils`    | 5.0.79  | Apache-2.0 | `@standard-schema/spec`, `@workflow/serde@4.1.0`, `eventsource-parser@3.1.1`, `undici@7.30.2` |
| `@ai-sdk/gateway`           | 4.0.142 | Apache-2.0 | `@vercel/oidc@3.2.0` (transitive, pulled in by `ai` itself)                                   |

Notes on footprint:

- `undici@7.30.2` is resolved lazily and **only when the runtime is Node**
  (`isNodeRuntime()` checks `process.release.name`). On Hermes it is never loaded; the
  specifier is indirect so Metro leaves it alone. It is still installed weight.
- `@ai-sdk/gateway` and `@vercel/oidc` are pulled in by `ai` even when only
  `@ai-sdk/openai-compatible` is used. `@vercel/oidc` maps `react-native` to
  `dist/index-browser.js` through package `exports`, so its `fs`/`path`/`os` requires are
  never bundled. (An esbuild run without the `react-native` condition _does_ fail on
  those built-ins — the condition is what saves it, so Metro's condition support is
  load-bearing.)

## 3. Hermes / React Native findings

The task asked specifically whether standard `fetch` support implies RN support. It does
not. What the AI SDK needs, and where it comes from on Vittaz's stack
(Expo SDK 58 / RN 0.88.1), is:

| Requirement                                           | Provided by                                       | Evidence                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ReadableStream`, `WritableStream`, `TransformStream` | Hermes V1 in RN 0.88 (globals on native)          | Expo docs, Streams API section; no polyfill package is installed or injected by `@expo/metro-config` |
| `TextDecoder`                                         | Hermes, **from RN 0.88 / Expo 58 onward**         | Expo docs, Encoding APIs section                                                                     |
| `TextDecoderStream`, `TextEncoderStream`              | Expo winter runtime                               | `expo/src/winter/runtime.native.ts`                                                                  |
| `structuredClone`                                     | Expo winter (`@ungap/structured-clone`)           | same file                                                                                            |
| `URL`, `URLSearchParams`, `DOMException`              | Expo winter                                       | same file                                                                                            |
| `AbortController`, `AbortSignal`                      | React Native                                      | `react-native/Libraries/Core/setUpXHR.js`                                                            |
| `process` (used by `@vercel/oidc`)                    | React Native                                      | `react-native/Libraries/Core/setUpGlobals.js` sets `global.process = {}` and `process.env`           |
| `Headers`, `Request`, `Response`                      | RN `whatwg-fetch` chain, replaced by `expo/fetch` | `expo/src/winter/runtime.native.ts` expects `globalThis.Headers`                                     |
| Streaming response bodies                             | `expo/fetch` (already used by `mobile_qa.ts`)     | RN's default fetch buffers; `expo/fetch` returns `ReadableStream` bodies                             |
| `crypto.getRandomValues`                              | **absent**                                        | Hermes has no Web Crypto; patched today by `web_crypto.ts`                                           |
| `crypto.subtle`                                       | **absent, and not polyfilled**                    | `expo-crypto` exposes digest/HMAC helpers, not `SubtleCrypto`                                        |

### Measured: engine-level requirements are real and hard

Running a Babel-transformed AI SDK bundle in an isolated context that contains only the
RN 0.88 + Expo 58 surface:

| Configuration                                    | Result                                                                                                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full surface (TextDecoder + web streams present) | loads; `generateText`, `streamText`, tool calling, cancellation, structured output all succeed                                                                                |
| `TextDecoder` removed                            | **fails at module evaluation**: `ReferenceError: TextDecoder is not defined` at `@ai-sdk/provider-utils/dist/index.js` (module-scope `const textDecoder = new TextDecoder()`) |
| `TransformStream` removed                        | **fails at module evaluation**: `ReferenceError: TransformStream is not defined` at `eventsource-parser/dist/stream.js`                                                       |

So the SDK has an unavoidable, import-time dependency on `TextDecoder` and web streams.
On Vittaz's exact Expo/RN versions both exist. On Expo < 58 / RN < 0.88 the app would not
even start. This is precisely the `KILO_UNKNOWN` failure shape: a missing Web global that
Node and Jest provide, breaking the app before any HTTP request.

`crypto` is **not** needed for the chat path (the globals snapshot in the passing run
reports `crypto: undefined`). It _is_ needed by two opt-in features:

- tool-approval signing (`buildPayload(...)` / HMAC via `crypto.subtle`),
- MCP tool-fingerprint drift detection (`hashCanonical` → `crypto.subtle.digest`).

Vittaz's own pending-proposal approval is a user-interface action enforced in
`qa_loop.ts`/`tools.ts`, so nothing today depends on those features — but any future use
of AI SDK signed approvals on device would be blocked without a `SubtleCrypto` polyfill.

### Compile and bundling

- **Hermes bytecode:** the Babel-transformed bundle compiles with the exact compiler RN
  0.88 ships (`hermes-compiler@260318099.0.5`, `-emit-binary -O`) to 2,206,342 B, warnings
  only. Without Metro's Babel pass the same code fails: `hermesc` rejects async
  generators. Metro's Hermes V1 profile (`babel-preset-expo`) applies
  `@babel/plugin-transform-async-generator-functions`, so a real build is fine — but this
  makes the Metro/Babel profile a hard requirement, not an implementation detail.
- **Metro / `expo export --platform android`:** succeeds with the SDK imported.

| Configuration                      | Modules | Hermes bytecode           |
| ---------------------------------- | ------- | ------------------------- |
| Current app (LangChain, no AI SDK) | 1,438   | 5,791,858 B               |
| AI SDK added alongside LangChain   | 1,474   | 7,241,257 B (**+25.0 %**) |
| LangChain removed, AI SDK added    | 1,164   | 5,445,969 B (**−6.0 %**)  |

A migration that actually replaces LangChain _reduces_ the app bundle by ~346 KB and 274
modules. Keeping both grows it by ~1.45 MB.

### What could not be verified

- **No Android device or emulator.** This environment has no Android SDK, no `adb`, no
  emulator, JDK 11 only, 2 vCPU and 1 GB RAM. No APK was built and no device run was
  performed. Any statement about on-device behavior of the SDK would be unsupported.
- **No Hermes VM execution of the SDK.** The public Hermes CLI build (`meta/hermes`
  v0.13.0) is an older engine that rejects `class` syntax, so it is not a stand-in for
  RN 0.88's Hermes V1; running the SDK on it would produce misleading results. The
  compile check uses the exact RN 0.88 compiler instead, and the runtime-globals harness
  uses an isolated V8 context. Both isolate _global availability_; neither is a Hermes
  runtime measurement.
- **No live provider call.** No real Anthropic or OpenAI-compatible credentials were
  available or used. Everything ran against a local synthetic OpenAI-compatible server
  (`/v1/chat/completions`, real HTTP and real SSE) and synthetic Anthropic-shaped SSE.

## 4. Test results

### 4.1 Node integration (`spikes/ai-sdk/node/`, real HTTP + SSE, synthetic server)

Text generation, streaming, configurable base URL/key/model, tool calling with result
round-trip, structured output and status-code error mapping all behave as documented.

Two behaviors did **not** match what Vittaz's error model needs:

**(a) In-band provider errors are not exceptions.** A provider that returns HTTP 200 and
then an SSE `{"error": ...}` frame (a real Kilo/gateway failure mode):

```
textStream:      ends silently
result.text:     resolves to ""      (no rejection)
result.finishReason: "error"          <-- the only signal
```

Mapping that faithfully requires checking `finishReason` after every generation. A
straightforward port of the current loop would surface an empty answer and fall through to
the generic `provider_error` copy — reproducing the `KILO_UNKNOWN`-style symptom that
Vittaz spent several sessions eliminating.

**(b) Cancellation does not raise on the delta stream.** On `abort()`, the delta stream
ends silently and the abort surfaces as a rejection of `result.text` /
`result.finishReason` (`AbortError`). `QaStopReason.aborted`/`timeout` can still be
produced, but only by awaiting the result object rather than from the iteration loop.

### 4.2 Anthropic adapter (`@ai-sdk/anthropic`)

Authentication header shape, model selection, text generation, streaming and `tool_use`
handling were exercised against synthetic Messages-shaped SSE. No live key was available,
so **live Anthropic integration is unverified**.

### 4.3 RN-surface runtime harness (`spikes/ai-sdk/hermes/`)

| Check                                           | Result                                     |
| ----------------------------------------------- | ------------------------------------------ |
| Module evaluation with Expo 58 surface          | pass                                       |
| `generateText`                                  | pass (`"synthetic reply"`, 7 tokens)       |
| `streamText` deltas                             | pass (15 deltas)                           |
| Tool call + execute + result fed back (2 steps) | pass                                       |
| Cancellation observable                         | pass (via `result.text` rejection)         |
| In-band error not silently swallowed            | pass only when `finishReason` is inspected |
| Structured output (`generateObject` + zod)      | pass                                       |

## 5. Decision

**Outcome B — migration not performed.** Reasons, in order of weight:

1. The required runtime gate cannot be met here: no device/emulator, therefore
   "streaming and tool calling verified in Hermes on Android" is unproven, and the
   instructions forbid claiming it.
2. The AI SDK would replace hardened transports with different error semantics that
   must be re-established (in-band errors, cancellation) — with a failure mode that is
   indistinguishable from the historical regression.
3. The stated goal (OpenCode-style multi-provider, BYOK, model selection, one assistant
   interface) does not require the AI SDK at all. It requires a Vittaz-owned provider
   contract, a registry that supports multiple configured endpoints, and per-model
   capability metadata. Provider breadth is already open-ended because
   `@ai-sdk/openai-compatible` and `OpenAICompatibleClient` cover the same class of
   servers.
4. LangChain is vestigial and independently removable, which is where the real
   maintenance win is (and it removes the `web_crypto.ts` dependency).

Production code, tests, dependencies and lockfiles are unchanged on `main`. The only
repository additions are this report, the decision/reference entries, a Hermes regression
test and the spike harness.

## 6. Recommended next step

Do the LangChain removal as its own small, provable step — **before** considering the AI
SDK — because it can be verified on device with today's evidence pipeline:

1. **Contract first (no behavior change).** Introduce `packages/agent/src/providers/`
   with `contracts/provider.ts`, `contracts/capabilities.ts`, `contracts/errors.ts`.
   The contract is deliberately narrower than the AI SDK's:

   ```ts
   export interface ProviderConfig {
     id: string; // stable, user-visible label ("work-laptop")
     kind: "anthropic" | "openai_compatible";
     api_key_ref: string; // secure-store key name, never the key
     base_url?: string; // openai_compatible only
     default_model: string;
   }
   export interface ProviderCapabilities {
     streaming: boolean;
     tool_calling: boolean;
     structured_output: boolean;
     max_context_tokens: number | null; // null = unknown, never assumed
   }
   export interface ProviderAdapter {
     readonly capabilities: ProviderCapabilities;
     chat(request: ProviderRequest): Promise<ProviderResult>; // Cancellation and normalization live here
   }
   ```

   `ProviderRequest`/`ProviderResult` reuse the existing `ChatCompletionParams` /
   `ChatCompletionResult` shapes so the QA loop and every current test keep working;
   SDK-specific types stay inside adapters, as the brief requires.

2. **Wrap, don't rewrite.** `AnthropicMessagesClient` and `OpenAICompatibleClient` become
   the bodies of `adapters/anthropic.ts` and `adapters/openai_compatible.ts`. No transport
   code is reimplemented, so the existing 395 tests remain the acceptance gate.
3. **Delete the decorator, prove equivalence.** `LangChainQaAgent` → `ReadOnlyQaLoop`;
   `LangChainCompletionClient` → direct. Keep the diagnostics contract by renaming the
   three `langchain_*` event codes in the same change and asserting the reason codes are
   unchanged. This is safe to verify on device today.
4. **Then remove `@langchain/core`** from `packages/agent/package.json` and
   `apps/mobile/package.json`, drop the tsconfig path mapping and jest moduleNameMapper
   entries, and only then decide whether `web_crypto.ts` is still needed (it is also used
   for `crypto.randomUUID` in `ledger_runtime.ts`, so it likely stays, minus the LangChain
   rationale in its comment).
5. **Multi-account persistence** is the actual missing feature: extend the secure profile
   from one selection to a list of `ProviderConfig` records plus an active id, keeping the
   fail-closed read behavior. This is what makes the architecture "OpenCode-style".
6. **Re-open the AI SDK question only if provider breadth becomes a real requirement**,
   and only with a device test plan: Hermes streaming, tool calling, in-band error
   mapping, cancellation, and an APK build on a real device.

## 7. Reproduction

```bash
# Node integration (synthetic server, real HTTP + SSE)
cd spikes/ai-sdk && npm install
node node/spike_openai_compatible.mjs        # 11-13 checks; see report for the 2 semantic gaps
node node/characterize2.mjs                  # in-band error / cancellation semantics

# Metro + Hermes compile + RN-surface runtime
cd spikes/ai-sdk/hermes
node build2.cjs                              # esbuild + babel-preset-expo (Hermes V1 profile)
node run_globals.mjs                         # 3 configurations; run 1 = 6/6 pass
hermesc -emit-binary -O -out /tmp/app.hbc dist/app.js   # hermes-compiler@260318099.0.5
```

Synthetic data only. No real keys, ledger data, prompts or provider responses are
involved anywhere in this evaluation.
