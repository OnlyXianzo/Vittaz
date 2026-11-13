# Vittaz assistant + provider architecture — one file, everything

**Written 2026-11-11.** Branch `feat/provider-contract`, HEAD `93229d1`, nothing pushed.
Parent commit `9dfb528`.

This file exists so one document answers: what you actually want, how the pieces
fit, what changed and why, what is proven versus assumed, and what happens next.
It assumes no prior reading. Where something is unverified it says so.

---

## 1. What you actually want (in plain words)

Distilled from your messages, not from the plan docs:

> **"Any user can point Vittaz at any AI provider with their own key, pick a
> model from that provider, and it just works — and maintaining that isn't my
> job. The assistant's own behaviour (tools, safety, how it behaves) stays ours.
> If a library exists that takes the provider plumbing off my hands, use it —
> but only if it genuinely works on a phone."**

You said it as: _"if in future anybody brings an OpenAI compatible key then it
should work, they can fetch their models and use it, and on our side this should
not be our responsibility to maintain this."_ And: _"the core of the agent —
their behaviour, their tools — should be ours."_

That splits cleanly into two layers, which is the whole design:

| Layer               | Whose job                       | Volatility                        |
| ------------------- | ------------------------------- | --------------------------------- |
| **Wire plumbing**   | A library's job _if it is safe_ | High — new providers appear often |
| **Agent behaviour** | **Vittaz's job, permanently**   | Low — it is your product          |

The rest of this document is about where that boundary sits, and the honest
answer to "can a library take the first layer off your hands?"

**What already works today — this matters, because it is most of your goal:**

| You asked for                           | Status                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Any OpenAI-compatible key works         | **Already true.** One transport, any base URL                                                        |
| Multiple saved accounts with labels     | **Already true.** `provider_keys.ts` (`assistant_key_profiles_v1`), add/switch/remove in Keys screen |
| Fetch that provider's model list        | **Already true.** `fetch_model_choices()` → `GET {base_url}/v1/models`                               |
| Pick a model                            | **Already true.** Models screen / picker                                                             |
| Anthropic alongside it                  | **Already true.** Second transport                                                                   |
| Agent behaviour (tools, safety) is ours | **Already true.** Read-only loop, allowlist, approval gate                                           |
| See how many tokens a request used      | **Added this session.** Under each answer + session total                                            |

So "OpenCode-style multi-provider BYOK" is **not** a future feature. It ships.
What was missing was a clean internal seam, and a couple of gaps noted in §7.

---

## 2. The architecture as it stands

### 2.1 The whole chain, one question at a time

```
UI  ─────────────────────────────────────────────────────────────────────
  ChatScreen / KeysScreen / ModelsScreen
        │  user asks a question
        ▼
STATE ────────────────────────────────────────────────────────────────────
  store.tsx
        │  reads the active provider selection + its key
        ▼
CONFIG ───────────────────────────────────────────────────────────────────
  assistant/provider_keys.ts   ← multi-account registry (labels, base_url, model)
                                secrets per profile: secret_name(id)
  assistant/secure_key.ts      ← legacy single-profile projection (what the
                                agent still reads — see §7.1)
        │
        ▼
CONTRACT (new) ───────────────────────────────────────────────────────────
  packages/agent/src/providers/
    contracts/provider.ts        ProviderAdapter, ProviderConfig
    contracts/capabilities.ts    what a model can/can't do
    contracts/errors.ts          normalized failures
    adapters/anthropic.ts        ┐ thin wrappers: validate config, resolve
    adapters/openai_compatible.ts┘ credential lazily, build the transport
    registry/                    config registry + capability registry
        │
        ▼
TRANSPORT (unchanged, the actual network code) ───────────────────────────
  packages/agent/src/provider_client.ts            OpenAI-compatible
  packages/agent/src/anthropic_messages_client.ts  Anthropic Messages
  packages/agent/src/key_pool.ts                   multi-key retry/cooldown
        │  HTTPS + SSE
        ▼
PROVIDER ─────────────────────────────────────────────────────────────────
  Kilo free · OpenAI · OpenRouter · Groq · DeepSeek · Together · xAI ·
  local Ollama · Anthropic · …any OpenAI-compatible endpoint

AGENT BEHAVIOUR (unchanged, ours) ────────────────────────────────────────
  qa_loop.ts  ReadOnlyQaLoop — step limit, token budget, timeout
  tools.ts    read-only allowlist, Zod validation, pending-proposal-only writes
  validation  validateCompletionRequest, 64 KiB body cap, sensitive rejection,
              outbound redaction before anything leaves the device
```

### 2.2 The provider contract, precisely

The point of the contract is that **a provider is data plus a thin wrapper, not
new agent logic.** Adding a provider must never touch the QA loop.

```ts
// A configuration is safe to store, render and log: it holds a REFERENCE to a
// credential, never the key itself.
interface ProviderConfig {
  id: string; // stable, user-visible, also the key-pool nickname
  kind: "anthropic" | "openai_compatible";
  credential_ref: string; // secure-storage handle; "" = deliberately keyless
  base_url?: string; // required for openai_compatible
  default_model: string;
  key_nickname?: string;
}

// The adapter adds metadata to the client the loop already knows. It does NOT
// introduce a parallel request/result type — that was deliberate.
interface ProviderAdapter extends CompletionClient {
  id: string;
  kind: ProviderKind;
  model: string;
  capabilities(): ModelCapabilities;
}
```

Three design decisions worth knowing, because they are where mistakes would hide:

**Capabilities are three-state, and unknown stays unknown.**

```ts
type CapabilityState = boolean | "unknown";
```

The shipped default is _everything unknown_. Nothing is promoted to `true`
because a call happened to succeed. Reason: "every model streams and calls
tools" is false, and when it's false the user sees a generic assistant error
with no cause. Partial knowledge is never widened either — declaring
`streaming: true` leaves `tool_calling: "unknown"`.

**Errors carry no payload.** `MissingCredentialError`,
`InvalidProviderConfigError`, `ProviderNotConfiguredError` are message-only. An
adapter therefore _cannot_ leak a key, URL, body or stack trace by throwing,
even by accident.

**No silent switching.** One configured provider is unambiguous. With several,
`active()` **throws** rather than guessing; there is no implicit fallback to
another account, and no key switching beyond the existing key-pool policy.

### 2.3 Where the safety rules live (and stayed)

The contract is a wrapper, so every rule keeps its original home:

| Rule                                                 | Lives in                    | Changed? |
| ---------------------------------------------------- | --------------------------- | -------- |
| Fetch behaviour, SSE parsing, request/response shape | transports                  | No       |
| HTTP error classification, 400 → no fallback         | transports                  | No       |
| Retry + key cooldown policy                          | `key_pool.ts`               | No       |
| Body size, sensitive-input rejection, redaction      | `validateCompletionRequest` | No       |
| Tool allowlist, Zod validation, proposal-only writes | `tools.ts`                  | No       |
| Step limit, token budget, timeout                    | `qa_loop.ts`                | No       |
| **Config shape, credential refs, capability claims** | **contract (new)**          | New      |

That split is why this refactor was safe: the contract owns _identity and
metadata_, not _behaviour_.

---

## 3. What I did, and why

Four things, in the order they happened.

### 3.1 Removed LangChain, replaced it with a contract we own

**What:** deleted `langchain_adapter.ts` (234 lines) and its tests (469 lines),
added `packages/agent/src/providers/` (~646 lines), removed `@langchain/core`
from both `package.json`s and both lockfiles.

**Why:** it was doing nothing for you. It wrapped your transports to expose them
as a `BaseChatModel`, and the assistant used none of the wrapper's features. It
was also the direct cause of your worst bug: LangChain minted a UUID v7 run id
using `crypto.getRandomValues` _before_ every request, and Hermes has no Web
Crypto global — so every question failed before any HTTP call. That is the
`KILO_UNKNOWN` you spent several sessions chasing.

Measured effect, before → after, same command both sides:

| Measurement                      | Before      | After       |
| -------------------------------- | ----------- | ----------- |
| Android bundle (Hermes bytecode) | 5,801,607 B | 3,562,110 B |
| Modules bundled                  | 1,440       | 1,053       |
| `langchain` strings in bundle    | 149         | 0           |

**Why deleting it was safe:** 24 new tests assert the behaviour that previously
ran _through_ LangChain — read-only SQLite projections, ledger state unchanged
after a real HTTP run, no added retries, 400 without fallback, 401 → next key,
429 → exhaustion, abort text not exposed, no key nickname echoed. Nothing was
relaxed to make this pass.

### 3.2 Built the contract so a provider is a wrapper, not a rewrite

**What:** the `contracts/`, `adapters/`, `registry/` tree in §2.2.

**Why:** this is the piece that serves your actual request. With it, "support a
new provider" is ~60 lines in `adapters/` and **zero** changes to the agent's
behaviour. It is also the seam any future library must fit behind — which is why
the SDK question stopped being urgent.

### 3.3 Added the token counter you asked for

**What:** `apps/mobile/src/assistant/tokens.ts` plus wiring. Each answer shows
`<n> tokens`; the composer shows `<n> tokens this session`.

**Why:** your app already computed this for its token budget and threw it away.
It is display-only — no new measurement, no storage, no analytics row, and no
prompt/reply/key text can reach the label.

### 3.4 Wrote the device test plan you can run

**What:** `docs/provider_device_test_plan.md` — six tests: baseline streaming,
token counter, cancellation, error mapping, provider switch, diagnostics export.

**Why:** it targets the exact behaviours no Node test can prove on a phone. It is
the missing evidence, and it is the precondition for ever revisiting the SDK.

### 3.5 Two corrections I had to make (stated plainly)

Documenting these because a wrong record is worse than no record:

1. **I claimed multi-account persistence was unimplemented.** Wrong. I read
   `secure_key.ts` and stopped before `provider_keys.ts`, which already ships the
   labelled multi-profile registry. Corrected in `DECISIONS.md`, `STATE.md`,
   `Plan.md`.
2. **I claimed I moved the Node toolchain somewhere that would persist between
   sessions.** It did not persist. Sandbox-only detail, no product impact, but
   the claim was false.

---

## 4. Proven vs. assumed — the honest table

The rule for this project: _a passing Node test is not proof of Android
behaviour._ Holding to that:

| Claim                                         | Status                                                   |
| --------------------------------------------- | -------------------------------------------------------- |
| Transports work against real HTTP + SSE       | **Proven**, Node, synthetic server                       |
| Error classification, retries, key pool       | **Proven**, Node                                         |
| Read-only + approval invariants               | **Proven**, Node                                         |
| 100% line/branch/function coverage            | **Proven**, gate enforced on every run                   |
| Bundle shrank and lost LangChain              | **Proven**, measured both sides                          |
| Typecheck, lint, format, privacy, secret scan | **Proven**, all green                                    |
| **Streaming/tool-calling on Android/Hermes**  | **NOT VERIFIED** — no device, SDK or emulator here       |
| **Cancellation on `expo/fetch` on device**    | **NOT VERIFIED**                                         |
| **Live provider call with a real key**        | **NOT VERIFIED** — no credentials available or used      |
| **APK builds**                                | **NOT VERIFIED** — no Android SDK/JDK 17/adb in this env |

Current numbers: root **407 tests / 60 files at 100% coverage**; mobile
**105 tests / 16 suites**; typecheck, build, lint, format, privacy and secret-scan
all green.

---

## 5. Why we are _not_ using the Vercel AI SDK (yet)

You asked this directly, and again after hearing both conditions. The short
answer: **it fails the one gate that matters, and it saves you almost nothing
for the providers you actually want.**

Reasons, in the order they actually decide it:

**1. The deciding gate cannot be met here.** Your own standard is that Node
tests don't prove Android behaviour. There is no device, emulator or Android SDK
in this environment, so "streaming and tool calling verified on Hermes" is
unprovable. Adopting on that basis means claiming something undemonstrated —
the exact mistake that produced LangChain.

**2. Its requirements are the shape of your worst bug.** Measured: the SDK has a
hard **import-time** dependency on `TextDecoder` and `TransformStream`. Both exist
on your Expo 58 / RN 0.88. Remove either and the app dies at module evaluation,
_before any HTTP request_ — indistinguishable from `KILO_UNKNOWN`.

**3. Its error model doesn't match yours, and would have to be rebuilt on top.**

| Case                                             | AI SDK                                                         | Vittaz needs                                |
| ------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------- |
| In-band SSE error (HTTP 200 + `{"error"}` frame) | stream ends silently, `text: ""`, only `finishReason: "error"` | a classified failure, never an empty answer |
| `abort()`                                        | delta stream ends silently                                     | `aborted`/`timeout` stop reason             |

A naive port turns a provider failure into an empty answer. Preserving your eight
failure reasons, 400-no-fallback and stop reasons means rebuilding all of it.

**4. It buys almost nothing for your goal.** "OpenAI-compatible" is _one
protocol_, not one company. `@ai-sdk/openai-compatible` covers the same servers
your existing transport already covers. An SDK's real value is a bag of
_different_ protocols — you speak two, and Anthropic is stable.

**5. The real maintenance win was LangChain, and it was separable.** Done, and
it removed the cause of a device bug. That is a measurable win; the SDK
migration is not.

**The honest counterpoint, in your favour:** OpenCode does use the AI SDK for
providers while keeping its own agent loop — you were right about that. It
supports 10+ protocols and runs on desktop Node with no Hermes constraint. That
is a genuinely different problem from yours. Your instinct isn't wrong; it is
being applied to a smaller provider set than OpenCode's.

### What would change this recommendation

Both together, not one:

1. You want **3+ non-OpenAI-compatible protocols** (Gemini, Bedrock, Cohere), and
2. you have **run** the device tests — not just planned them.

Then the move is small: install only `@ai-sdk/<provider>`, wrap it in
`adapters/` (~60 lines each), change nothing in the loop, tools or safety checks.
The contract exists precisely so that stays cheap.

**Also worth saying plainly:** testing your phone **proves the current stack
works**. It is not a step toward the SDK. If all six tests pass, the honest
conclusion is "what we have is verified," not "now migrate."

---

## 6. The only open question I need you to answer

> **Which third provider protocol do you actually want — Gemini, Bedrock,
> Cohere, or simply "more OpenAI-compatible services"?**

Why it decides the next step:

| Your answer                          | Right move                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| More OpenAI-compatible services      | **Nothing to build.** Already works; just add a profile in the app                      |
| Gemini only                          | Add a `gemini` adapter (~60 lines). No new dependency, your tested error handling stays |
| Gemini **and** Bedrock/Cohere        | Now the SDK case is real — but only after the device tests run                          |
| "Stop, just make what we have solid" | Run the device plan in §3.4 (§7.1 is the only small cleanup left)                       |

Adding 1st-party Gemini isn't obviously worth a dependency; the SDK starts
winning when the _second and third_ non-compatible protocol arrive.

---

## 7. What's next

### 7.1 One small internal gap (low priority, not user-visible)

KeysScreen writes the multi-profile registry in `provider_keys.ts`. That
registry _projects_ the active profile into the older single-provider keys in
`secure_key.ts`, and **that** is what `store.tsx` reads. So the new
`ProviderRegistry`'s multi-configuration support is unused, and switching
accounts goes through the legacy projection instead of directly.

Wiring `provider_keys` into `ProviderRegistry` would remove the projection. It
adds **no user-visible capability** — everything in §1 already works — so it is
cleanup, not a feature. Worth doing before adding a third provider kind.

### 7.2 Run the device tests (the highest-value next action)

`docs/provider_device_test_plan.md`, on the diagnostics test build
(`com.vittaz.diagnostics.test`, separately installable so it can't touch the
personal app).

What I need back per run:

- build identity (workflow run id + commit SHA)
- **phone model and Android version** — missing in every previous run, and
  without it cause analysis was impossible
- network (Wi-Fi / mobile data)
- each test pass/fail, and the **exact message seen, verbatim**

The diagnostics export contains stages, reason codes, HTTP status, timing, tool
names and token counts only — never prompts, replies, ledger data, keys, URLs,
bodies or stack traces. **If you ever see prompt text in an export, stop and tell
me: that's a privacy defect, don't send the file.**

### 7.3 Then, in order

1. Answer §6.
2. Run §7.2, send findings.
3. If a third protocol is genuinely needed and the tests pass → decision on SDK
   vs hand-written adapter (currently: adapter, unless it's 3+).
4. Optional: §7.1 cleanup.
5. Per-provider pricing → real ₹ cost per answer, not just token counts.
   (Infrastructure exists: `analytics.ts` already computes cost from per-1k
   rates, but it is not wired on mobile and there is no pricing UI.)

### 7.4 Still blocked, not by me

- **No APK can be built here** (no Android SDK, JDK 17, adb, emulator).
- **No live provider call** was made; no credentials were available or used.
- Owner-side S36 acceptance (the `KILO_UNKNOWN` runs) is still open and is
  _independent_ of this refactor.

---

## 8. Glossary (no prior reading assumed)

| Term                  | Meaning                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------- |
| **Provider**          | The company/server answering AI requests (OpenAI, Anthropic, Groq, Kilo…)                    |
| **OpenAI-compatible** | Any server speaking OpenAI's HTTP/SSE format. One transport covers all of them               |
| **Transport**         | The code that actually does HTTPS + parses the stream. Only two exist                        |
| **Adapter**           | ~60-line wrapper binding one provider kind to the transport                                  |
| **Contract**          | The interface the rest of the app depends on (`ProviderAdapter`, `ProviderConfig`)           |
| **Capability**        | What a model can do (stream? call tools?). Three-state: yes / no / unknown                   |
| **BYOK**              | Bring Your Own Key — user's key, user's provider                                             |
| **Key pool**          | Multiple keys for one provider with retry and cooldown policy                                |
| **SSE**               | Server-Sent Events — how text streams back token by token                                    |
| **Hermes**            | React Native's JS engine on Android. No Web Crypto, no Node APIs                             |
| **DIAGNOSTICS build** | Separate test-only APK that records a safe stage log so failures can be analysed             |
| **The gate**          | The project rule: a Node/Jest pass is not proof of Android behaviour                         |
| **LangChain**         | The library removed this session; wrapped the transports, added nothing, caused a device bug |

---

## 9. Where to read more

| File                                           | Contains                                             |
| ---------------------------------------------- | ---------------------------------------------------- |
| `docs/ARCHITECTURE.md`                         | Layer boundaries and the provider-boundary table     |
| `docs/ai_sdk_evaluation.md`                    | The full SDK evaluation, measured, with reproduction |
| `DECISIONS.md` (2026-11-11 entry)              | This refactor's decision record and bundle numbers   |
| `docs/provider_device_test_plan.md`            | The six device tests                                 |
| `docs/PRIVACY.md`                              | What may never leave the device, and why             |
| `packages/agent/src/providers/`                | The contract itself                                  |
| `packages/agent/src/provider_pipeline.test.ts` | The behaviour that used to run through LangChain     |
| `STATE.md`                                     | Session-by-session evidence log                      |

---

## 10. One-paragraph summary

You wanted any OpenAI-compatible provider to just work with the user's own key,
model fetching included, without you maintaining provider plumbing — while the
agent's behaviour stays yours. Most of that already shipped; this session removed
the useless LangChain dependency that was silently breaking the device, put a
small Vittaz-owned contract where it used to sit (so a provider is now a ~60-line
adapter and never touches agent logic), shrank the Android bundle 38% and made it
faster to add providers than ever. The AI SDK was measured and _not_ adopted: it
can't be verified on your phone from here, it needs Web globals whose absence
caused your worst bug, and it would save nothing for the providers you actually
use. Nothing about the phone is proven yet — that's what the six-test plan is for,
and it needs one answer from you: which third protocol, if any, you want next.
