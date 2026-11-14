# Core Domain Logic

## Overview

Framework-free core domain boundary combining deterministic ledger accounting, privacy guards, notification parsers, import engines, conversation history, user preferences, assistant rules, and local model task contracts.

## Interface

- **Conversations**: `ConversationHistoryError`, `parseConversation`, `parseConversationMessage`, `parseHistoryId`, `parseHistoryLimit`, `startConversation`, `recordConversationMessage`, `ConversationRow`, `ConversationMessageRow`, `ConversationHistoryStore`.
- **Preferences**: `defaultAssistantPreferences`, `parseAssistantPreferences`, `getAssistantPreferences`, `setAssistantPreferences`, `AssistantPreferencesError`, `AssistantPreferences`, `AssistantPreferencesStore`.
- **Rules**: `AssistantRulesError`, `parseAssistantRules`, `parseMessageOrigin`, `evaluateMessageConditions`, `getAssistantRules`, `setAssistantRules`, `MessageOrigin`, `MessageSource`, `AssistantRule`, `AssistantRulesStore`.
- **Assistant & Local Tasks**: `AssistantService`, `AssistantRequest`, `AssistantOptions`, `AssistantReply`, `LocalModelTasks`, `LocalModelRunner`, `LocalModelTaskName`, `LocalTaskInput`, `LocalTaskOptions`, `LocalEntryDraft`, `LocalTaskResult`.
- **Package Version**: `VERSION = '0.0.1'`.
- Subdirectories:
  - [importers](./importers/README.md) - Spreadsheet transaction ingestion engine.
  - [ledger](./ledger/README.md) - Double-entry ledger accounting, money math, and audit trail.
  - [parsers](./parsers/README.md) - Notification parsing and deduplication.
  - [privacy](./privacy/README.md) - Privacy boundary, sensitive message filtering, and redactor.

## Invariants

- Framework-free pure business logic: zero UI dependencies, zero external AI provider SDKs, zero native storage dependencies.
- Conversation message contents are validated (<= 8192 characters, non-empty, no null bytes) and checked against sensitive message filters before storage.
- Telegram messages are rejected unless coming from an authenticated, paired device.
- Local model outputs enter as untrusted drafts (`LocalEntryDraft`) requiring explicit proposal and user approval workflows.
- Preferences and rules enforce strict schemas and structural immutability.

## Side Effects

- Executes persistence operations via abstract repository interfaces (`ConversationHistoryStore`, `AssistantPreferencesStore`, `AssistantRulesStore`, `LedgerStore`).

## Verification

- Run: `npm test`
