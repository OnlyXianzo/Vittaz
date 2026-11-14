# Privacy and security

Vittaz handles sensitive personal financial information. Privacy is a product requirement, not an optional enhancement.

## Data ownership and storage

The intended v1 model is one local ledger per device. Vittaz does not require a Vittaz-operated server or cloud synchronization.

The active database is stored locally using SQLite. A private application sandbox is useful protection, but it is not equivalent to encryption of every database file or exported backup. The implementation must document the actual protection provided by the operating system and any encryption that is enabled.

## AI and external services

AI features are optional. A user's own provider key does not mean that the provider cannot receive or process the submitted prompt.

The application should:

- Keep raw financial notifications and personal notes on-device by default.
- Never send OTPs, PINs, CVVs, passwords, authentication codes, or content marked as private to a cloud model.
- Send the minimum structured context required for a request.
- Avoid sending full account numbers, payment references, or unnecessary counterparty details.
- Make cloud processing an explicit user choice.
- Explain which provider receives the request.
- Provide a way to inspect the outbound context before enabling or using cloud processing.
- Avoid including prompts, replies, secrets, or raw financial text in analytics and crash reports.

## Name replacement and anonymization

Replacing known counterparty names with placeholders can reduce exposure, but it cannot guarantee anonymity. Exact-match replacement may miss spelling variations, nicknames, transliterations, names embedded in free text, or indirect identifiers.

Therefore:

- Do not describe name replacement as complete anonymization.
- Do not send notes or raw notification text to cloud providers by default.
- Treat uncertain or unrecognized content as sensitive.
- Prefer local parsing for raw messages.
- Make the final outbound payload subject to a separate privacy policy and validation step.

## Notification access

Android notification access can expose sensitive information from other applications. It must be optional and accompanied by a clear explanation of:

- Which source apps are supported.
- What fields are read.
- What is discarded.
- What is stored locally.
- Whether any information can leave the device.

The implementation should use an allowlist, reject sensitive content early, avoid logging notification text, and discard raw content when it is no longer required.

## Credentials and secrets

Provider API keys and Telegram bot tokens must be stored using platform secure storage. They must not be stored in plaintext settings, source code, test fixtures, exported logs, or crash reports.

Tests must use fake credentials and synthetic data. Never commit real transaction records, bank messages, personal names, provider keys, or private spreadsheets.

**One documented exception: provider metadata is not a credential.** The key profile list
also keeps a plain-storage copy — profile id, provider kind, label, endpoint URL, model,
wire-shape overrides and the last connection check — in
`vittaz.assistant.key_manifest.v1` (`apps/mobile/src/assistant/profile_manifest.ts`). It
exists because Android invalidates secure-storage entries when the lock-screen credential
changes, and keeping the list encrypted meant the whole list vanished with the keys.

The exception is bounded by construction, not by convention: the writer copies an explicit
allowlist of named fields and never spreads the profile object, a test asserts that an
`api_key` added to the input does not reach the stored blob, and the key itself stays in
secure storage. Everything in the manifest is already visible on the keys screen.

To prevent offline extraction of plain-storage manifest records and local SQLite databases into cloud backups or unauthenticated ADB dumps, Android Auto Backup is explicitly disabled via `allowBackup: false` in `apps/mobile/app.json`.

If this trade-off is ever rejected, deleting the manifest module restores the previous
behaviour: the list is lost on invalidation, and the screen says so.

## AI permissions

The AI may propose a transaction and perform approved read-only queries. It must not:

- Approve or reject a proposal.
- Directly insert or update a confirmed transaction.
- Undo a financial change.
- Import a spreadsheet.
- Create or restore a backup.
- Change security settings or credentials.

All financial mutations must pass through validated application use cases initiated by the user.

## Backups and exports

A backup or export can contain names, amounts, notes, and transaction history. Treat it as sensitive.

Before release, define:

- Whether backups are encrypted.
- How encryption keys are generated and recovered.
- What happens when a user loses a key.
- Whether temporary export files are cleaned up.
- How restore validates integrity and schema compatibility.

A checksum can detect accidental corruption; it does not provide confidentiality or prove that a backup is authentic.

## Logging and diagnostics

Logs should contain operational metadata only. Redact tokens, names, account identifiers, notification contents, prompts, and model replies. Error messages shown to users should be useful without exposing private payloads.

## Security testing

Privacy and security tests should cover sensitive-word filtering, name replacement limitations, account/reference scrubbing, log redaction, provider payload inspection, notification allowlisting, proposal-only AI permissions, and backup/restore behaviour.

## Telegram

Telegram bot messages travel through Telegram's servers and are not end-to-end encrypted. Anything typed to the bot is visible to Telegram. Users should not send secrets through it, and Vittaz drops incoming messages that match the sensitive-word filter before they reach the assistant or storage.

The bot token goes in platform secure storage. Pairing uses a one-time code, and only the paired chat is served.

## Conversation history and model context

Conversation history is stored on the device. When history is sent to a cloud model as context, it is limited to recent turns, passes the same sensitive-word filter and name replacement as any other outbound text, and excludes notes by default. Local models receive history without name replacement.

## Untrusted content

Notifications, imported files, emails, web pages, tool outputs and messages from unpaired chats are data, not instructions. See [Agent policy](AGENT_POLICY.md).

## Future connectors

A connector that reads external data, such as Gmail, needs its own review of scopes, token storage, retention and what can reach a model, before it is built. Reading and sending are separate permissions.

## Implemented Phase D primitives (2026-11-04; G2 not signed off)

- Pure sensitive classifier + guarded callback: rejects before processor invocation,
  returns static reason codes; English/Hinglish/Devanagari patterns, invalid input
  fails closed. Future ingress paths must call it before persistence/logging/network.
- Local in-memory known-name mappings: longest-first Unicode-token replacement,
  case/canonical/compatibility normalization, reversible Person_N; masks original
  Person_N tokens to prevent impersonation. Basic inline payment-name heuristics
  are NOT universal name recognition. Seed stable names via future async storage.
- Outbound-copy scrubbing: UPI URI/reference/handle, IFSC, account/card, phone and
  long numeric identifiers. Broad matches may over-redact; encoded/unknown formats
  and indirect identifiers are not comprehensively recognized.
- Safe diagnostics: only fixed event codes, generated clock/id and omitted markers.
  Never retain raw messages/stack/metadata/context or traverse untrusted values.
- Fail-closed CI requires actual passing primitive suites, no bootstrap escape;
  downstream test/security/build jobs remain gated on privacy.

This is NOT proof of zero trace across all application entry points, full reference
layer2 integration, Android/Expo parity, anonymity, encrypted backups or secure
provider/device configuration. Those actual pipelines/device adapters do not yet
exist. Unknown aliases/typos/homographs and free-text notes remain local-only by
policy; S17/S27d must enforce that policy with real integration tests before use.
See DECISIONS.md for explicit name/diagnostic tradeoffs. G1 is owner-approved;
G2 was subsequently accepted; owner authorized checked autonomous backend checkpoints. G3 technical evidence is still incomplete. Do not use real messages or credentials.

## Current backend boundary update (2026-11-04, S17–S22)

Node notification ingestion and provider wire guards now reject known-sensitive
inputs before financial/queue persistence or outbound HTTP, respectively. Tool
read projections omit raw names/notes/account/reference/IDs and unsafe custom
category labels; AI draft capability creates pending proposals only. These are
actual unit/adapter fixtures, not proof of full AssistantService/provider/Telegram
zero-trace, persistent redactor mappings, real listener or Expo/device behavior.
Those gates remain incomplete; primitive-report caveats above describe the earlier
foundation snapshot and must not be read as proof of application-wide privacy.

S23 adds bounded read-only Q&A with actual Node HTTP and readonly SQLite fixtures.
Sensitive questions drop before redactor/provider/query calls, replies buffered,
tool data projected; raw errors and free text with tool calls never re-enter wire.
Internal generated call IDs prevent model-returned identifiers being echoed;
validated argument echo is canonicalized then redacted/scrubbed. Full channel,
persistent context and outbound policy acceptance still S27d/e, not claimed here.

S24 opt-in metadata-only analytics receives constructed usage/public model-key codes,
never prompt/reply/HTTP/error objects. Storage rejects extra fields and invalid
numbers/outcomes. Configured public metadata cannot contain any configured raw
credential bytes; this is not an arbitrary unknown-secret detector. Sensitive and
provider-rejected requests create no analytics. Operational rows excluded from
financial backups/restore payloads and inaccessible to model tools.

S25 used a private LangChain callback manager whose copy remained restrictive and
whose addHandler always failed before message dispatch. Ambient tracing/verbose/
context-hook requests therefore failed closed; parent callbacks were not inherited.
**Superseded 2026-11-11:** the LangChain decorator is gone, so that manager no longer
exists. The privacy properties it was built to protect are unchanged and now hold
because there is no third-party callback surface at all: the provider contract has
no tracing, no callbacks and no ambient context, and `ProviderAdapter` only exposes
`id`, `kind`, `model`, `capabilities()` and `chatCompletion`. Malformed, sensitive or
pre-aborted requests still never reach a transport; native message/result objects
stay transient with no cache, and the validated wire is retained only for the
controlled provider call. Adapters resolve credentials through a closure, so a key
never enters a config object, diagnostic, log or error.

S26 local task port retains raw local names (no cloud callback accepted), drops
sensitive input before fake/driver invocation, rejects malformed or sensitive
output, exposes static error codes only. Suggestions do not persist or mutate a
ledger. Future platform runner must actually be local; no Node interface can
certify arbitrary trusted callback side effects or real on-device offline status.

### Local conversation persistence

S27a stores ordinary user/assistant text locally with channel source and conversation
ID. Both use case and storage API reject sensitive-classified content before SQL;
no history analytics/cloud/model callback is invoked. Runtime input is cloned and
strictly bounded, errors are constant, and source/role allowlists do not confer
channel authentication. The host must authenticate/pair channels and filter input
BEFORE creating a new conversation (service/channel steps pending). A separately
requested empty conversation is not a sensitive-message persistence side effect.

This is not proof of encrypted storage, secure deletion or outbound-history privacy.
Raw local names/text require S27d's recent-context privacy policy before any cloud
request. Ledger JSON exports exclude chats and restore preserves local chats.
