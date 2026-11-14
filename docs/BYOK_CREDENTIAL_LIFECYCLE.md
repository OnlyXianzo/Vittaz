# BYOK credential lifecycle

**Read this before changing anything about keys, profiles, or provider failures.**

Four questions were raised about how BYOK credentials behave over their
lifetime. This document answers each one against the code as merged in
`6982b0e`, states what is missing, and recommends a decision.

Nothing here is implemented. It is a decision record plus a gap list, so the
answers do not have to be rediscovered.

---

## At a glance

| #   | Question                            | Mechanism today                                                                                           | Recommendation                                                                   | Size         |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------ |
| 1   | Test the credential at setup?       | Optional manual "Fetch models" only                                                                       | Make it an explicit, recorded check — and label it honestly                      | Small        |
| 2   | Unreadable stored secret?           | **None.** Corrupt registry silently empties the list; a read error surfaces as a generic provider failure | Distinguish _absent_ from _unreadable_, and never lose the profile               | Small–medium |
| 3   | Per-task routing or fallback pools? | One active profile, no routing, no fallback by design                                                     | Keep single-active; add _named, explicit_ routes later if wanted                 | Medium       |
| 4   | Offline and rate-limit behaviour?   | Fails loudly with a per-reason code and no cross-provider fallback                                        | Already right. Add `Retry-After` honouring and a persisted per-key health record | Small        |

---

## 1. Validation at entry vs. at execution

**Before these commits.** Entry validation was syntax only: length, whitespace, control
characters, `https:`, no userinfo/query/hash (`provider_keys.ts:92`,
`:97`, `:153`). Nothing contacts the endpoint.

There _is_ an authenticated call, but it is manual and separate: the keys
screen has a **Fetch models** action (`KeysScreen.tsx:204`, button at `:440`) that runs
`fetch_model_choices` (`provider_keys.ts:438`), an authenticated
`GET {base}/{suffix}/models`. So the capability exists; what does not exist
is a _check_ whose result is kept and shown.

**What is missing.**

- The check is optional and runs before saving, never after.
- Its outcome is thrown away: a `catch` shows one generic toast
  (`KeysScreen.tsx:224`) and stores nothing, so a key that failed this
  morning looks identical to one that passed.
- Nothing distinguishes 401 from 404 from a timeout — the copy is the same.
- A profile saved _without_ pressing the button has never been tested at all.

**Implemented.** Keep syntax validation at entry as the only hard gate —
it must never depend on the network. Then:

1. After a successful save, run the model check once automatically and record
   the result per profile (ok / rejected / unreachable / untested).
2. Show it as a badge in the keys list and, when it is not `ok`, a "Test
   connection" row that repeats it on demand.
3. Report the class of failure, not just "failed": auth vs. not-found vs.
   network.

**Be honest about what a green check means.** A 200 on `/models` proves the
endpoint answers and the key is accepted _for discovery_. It does not prove
chat works: model entitlement, free-tier routing (OpenRouter) and plan quotas
all differ between the two endpoints. So the badge should read "endpoint
reachable, key accepted" — never "verified".

This is deliberately the same request the app already makes, so it adds no new
network behaviour and no new privacy surface.

---

## 2. Key lifecycle and keystore invalidation

**Before these commits: no mechanism existed, and two of the failure paths
were actively wrong.**

- `read_key_secret` (`provider_keys.ts:297`) does **not** catch a throw from
  `getItemAsync`. A keystore that refuses to decrypt propagates.
- `read_key_registry` (`:237`) has the opposite problem: if the stored blob is
  present but fails `parse_registry`, it returns
  `{ active_id: null, profiles: [] }` (`:245`). **Every profile disappears
  with no explanation**, and the legacy fallback does not run because the raw
  value was not `null`.
- The profile list itself lives in SecureStore (`KEY_PROFILES_NAME`,
  `provider_keys.ts:21`), so keystore metadata shares the fate of the secrets.
  Base URL, model, and label are not secrets but are stored as if they were.
- When a read throws during a question, `store.tsx:774` records
  `secure_credential_read_failed` and rethrows, and the user is shown
  `mobile_qa_failure_message("provider_error")` (`store.tsx:1040`) — i.e.
  "the provider failed". The diagnostics know the real cause; the person
  holding the phone does not.
- A corrupt _value_ (not a throw) is silently mapped to `null`
  (`read_key_secret`), which is indistinguishable from "no key saved".

**Expected behaviour to adopt.**

| Situation                          | What the user should see                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| No key was ever saved              | "No API key is saved." (exists today)                                             |
| Key exists but cannot be decrypted | "Your saved key can no longer be read on this device. Re-enter it for _<label>_." |
| Registry unreadable                | The profiles are still listed, marked unreadable, each with re-entry              |
| Full data clear                    | Empty state — correct, and already correct                                        |

The rule: **never delete a profile because a secret could not be read.** A
profile that stays visible with "re-enter the key" is recoverable; an empty
list looks like the app forgot the user's setup.

Worth knowing: on Android, SecureStore entries are invalidated when the
lock-screen credential changes. Reads can start failing for keys that were
written fine, with no user action. That is exactly why this must be a
first-class state rather than an exception.

**Implemented:** all three. The manifest is the owner's decision of 2026-11-11
and is recorded in `DECISIONS.md`.

The three changes are:

1. Wrap the reads: a throw becomes a typed `unreadable` state, not an
   exception and not `null`.
2. Keep a non-secret manifest (profile id, provider kind, label) outside
   SecureStore so the list survives keystore loss.
3. Map `unreadable` to its own user-facing message and its own stop reason,
   separate from `provider_error`.

Point 2 is a privacy trade-off and was the owner's call: it makes provider
choice, label, endpoint and model readable at rest. It was accepted, because
the alternative is losing the list entirely. What is written is an explicit
allowlist of named fields — no spread, so a future credential field cannot ride
along — and a test asserts that an `api_key` on the input never reaches the
stored blob. The keys screen discloses the plain-storage copy.

The recovery is deliberately read-only: `read_key_registry` rebuilds the rows
from the manifest when the keystore refuses, writes nothing, and marks the
registry `source: "manifest"`. A keystore that comes back after a restart
therefore finds its contents untouched. Writing only happens when the user acts
on a row — re-entering a key is what repairs storage.

---

## 3. Multi-profile routing vs. single active key

**Unchanged.** Profiles are a list, but only one is active, and it is projected
onto the legacy single-key slots (`activate_key_profile`, and the projection
read in `store.tsx:735`). There is no per-task routing, no capability
selection, and no pool across profiles.

The absence of fallback is not an oversight — it is the contract.
`ProviderRegistry` refuses to substitute a configuration, and since `6982b0e`
it also refuses to share one key pool across configurations.

**Recommendation: do not add automatic fallback pools.** Automatically
sending a question to a different provider would cross the privacy boundary
the product exists to protect, and it would silently change who sees the
question. It also conflicts with the existing no-fallback rule.

If per-task routing is wanted, model it as **named routes the user configures
explicitly**, not as adaptive behaviour:

- "Quick categorisations → _<profile>_" and "Questions → _<profile>_,"
  both visible in settings.
- A route is data: one profile, one model, chosen by the user.
- When the routed profile fails, the request fails. It does not divert.

That is a real feature with a clear place to live, and it is safe precisely
because nothing is decided at runtime. It is also not urgent: with a single
active profile it changes nothing for most installs.

**Non-goal.** "Use the local model for easy tasks, the expensive key for hard
ones" is a policy that cannot be evaluated without looking at the question,
which means sending it somewhere first. That is the silent fallback in
disguise.

---

## 4. Offline and rate-limit behaviour

**The failure path was already correct in the two ways that matter:**

- Every stop reason has its own copy with a stable code —
  `BYOK_AUTH`, `BYOK_RATE_LIMIT`, `BYOK_REQUEST_REJECTED`,
  `BYOK_CONNECTION` (`mobile_qa.ts:83`–`:97`).
- There is no cross-provider fallback anywhere. A rate-limited key does not
  quietly switch providers.

**What is missing.**

- **`Retry-After` is ignored.** `markRateLimited` accepts `retryAfterMs`
  (`key_pool.ts:132`) but the adapter calls it with no argument
  (`ai_sdk.ts:495`), so cooldown is always the 30 s default. The Telegram
  transport already reads `retry_after` (`telegram.ts:114`) — follow that
  precedent rather than inventing one.
- **Cooldown does not survive the question.** Mobile builds a fresh agent, and
  therefore a fresh `KeyPool`, per question (`create_mobile_qa_agent`,
  `mobile_qa.ts:223`). A 429 marks a key that is discarded immediately, so
  asking again straight away repeats the same failure with no backoff.
- **Offline is not detected before dispatch.** A flight-mode question is sent,
  fails, and is reported as `BYOK_CONNECTION` — accurate but late, and it
  spends a request to discover something the OS already knows.
- **No health history.** Diagnostics record the events, but nothing feeds a
  per-key "last failed at T for reason R" back into the keys screen.

**Implemented:** points 1, 2 and 4 (the cooldown is per process, not per
question). Point 3 is **not** implemented — see below.

**Recommendation.** Keep the no-fallback stance exactly as it is, and make the
failures cheaper to recover from:

1. Read `Retry-After` and pass it to `markRateLimited`.
2. Persist a per-profile health record (last outcome, reason, timestamp) —
   reuse the diagnostics data rather than adding a store.
3. Check connectivity before dispatch and fail with a distinct offline
   message without spending the request. **Not built:** React Native exposes
   no connectivity API without adding a dependency, and a dependency for one
   message was not worth taking unasked. A flight-mode question is still
   discovered by spending one request; the message afterwards is correct.
4. Surface the health record next to the profile, so the reason is visible
   before the next question rather than after it.

---

## Order I would do these in

1. **Question 2** — it is the only one that loses user data today, and the
   corrupt-registry path silently empties the list.
2. **Question 4** — small, and it turns an existing correct-but-opaque failure
   into a recoverable one.
3. **Question 1** — mostly reusing the fetch-models call, after 2 and 4 have
   given it somewhere to display.
4. **Question 3** — only if per-task routing is actually wanted. Designing it
   is cheap; building it before there is a use case is not.

## Decisions only the owner can make

- **Q2, point 2 (decided 2026-11-11): yes.** Non-secret metadata lives outside
  the keystore, and connection checks now survive a relaunch because they are
  stored with it. See `DECISIONS.md`. Provider _health_ (the rate-limit
  cooldown from question 4) is still process-only: it describes this run, not
  the key.
- **Q1 (chosen):** the check runs automatically after a save. Chosen over a
  button because a key that has never been tried is the common case, and the
  call is the same one the screen already makes. Easy to reverse.
- **Q3 (not built):** per-task routing. The recommendation is to keep
  single-active, and to add routing only as named, explicit routes. Nothing
  here blocks that later.
