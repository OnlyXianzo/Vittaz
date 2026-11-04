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
