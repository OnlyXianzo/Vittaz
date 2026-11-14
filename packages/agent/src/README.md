# Agent Orchestration Engine

## Overview

AI agent orchestration layer managing resilient key pooling, OpenAI-compatible streaming clients, Anthropic Messages API BYOK clients, read-only Q&A execution loops, LangChain adapter isolation, local model tasks, assistant services, background notification workers, and Telegram bot connectors.

## Interface

- **Key Pool (`key_pool.ts`)**: `KeyPool`, `BadRequestNoFallbackError`, `AllKeysFailedError`, `KeyConfig`, `KeyStatusSnapshot`, `KeyFailureRecord`.
- **Provider Clients (`provider_client.ts`, `anthropic_messages_client.ts`)**:
  - `OpenAICompatibleClient`, `CompletionClient`, `validateCompletionRequest`, `ChatMessage`, `ToolCallPayload`, `ToolSpec`, `TokenUsage`, `ChatCompletionResult`, `ChatCompletionParams`.
  - `AnthropicMessagesClient`, `ANTHROPIC_MESSAGES_URL`, `ANTHROPIC_API_VERSION`, `ANTHROPIC_DEFAULT_MODEL`.
- **HTTP Transport Utilities (`http_body.ts`)**: `ProtocolError`, `readText`.
- **Agent Diagnostics (`diagnostics.ts`)**: `report_agent_diagnostic`, `AgentDiagnosticEvent`, `AgentDiagnosticReporter`, `AgentDiagnosticCode`, `AgentDiagnosticReason`, `AgentDiagnosticSource`, `AgentDiagnosticFailureStage`.
- **Tools & Registry (`tools.ts`)**: `createQaToolExecutor`, `createDraftToolExecutor`, `validateAndCreateProposalFromToolCall`, `PROPOSE_TRANSACTION_TOOL_SPEC`, `QA_READ_ONLY_TOOL_SPECS`, `ToolValidationError`, `ReadOnlyViolationError`, `ToolExecutionError`, `ToolRegistry`, `QaDataSource`, `ProposePending`.
- **Q&A Loop (`qa_loop.ts`)**: `ReadOnlyQaLoop`, `QaValidationError`, `AnswerQuestionOptions`, `AnswerQuestionResult`, `QaStopReason`, `QaToolEvent`, `QaToolName`, `QuestionAnsweringAgent`.
- **Analytics & LangChain Bridge (`analytics.ts`, `langchain_adapter.ts`)**: `AnalyticsClient`, `AnalyticsError`, `LangChainCompletionClient`, `LangChainQaAgent`, `LangChainAdapterError`.
- **Local Tasks (`local_tasks.ts`)**: `ValidatedLocalModelTasks`, `LocalModelTaskError`, `LocalTaskErrorCode`.
- **Assistant & Notification Worker (`assistant.ts`, `notification_worker.ts`, `preferences.ts`, `rules.ts`)**: `SharedAssistantService`, `AssistantServiceDependencies`, `createPendingDraft`, `AssistantNotificationWorker`, `preferencesContext`, `rulesContext`.
- **Telegram Integration (`telegram.ts`)**: `TelegramConnector`, `TelegramHttpApi`, `TelegramHttpError`, `buildTelegramDigest`, `TelegramSettingsPort`, `TelegramConnectorDependencies`, `TelegramResult`.

## Invariants

- Strict read-only isolation: Q&A agent loop only receives `QA_READ_ONLY_TOOL_SPECS`; cannot draft, modify, or commit transactions.
- Proposal creation is strictly confined to pending drafts via `propose_transaction`; direct ledger commits from AI tools are impossible.
- `KeyPool` automatically disables unauthorized keys (401), applies cooldowns to rate-limited keys (429), and halts fallback on 400 Bad Request to prevent key burning.
- Privacy protection: all outbound messages and tool arguments pass through `PrivacyRedactor` and `scrubOutboundText` before transmission.
- LangChain adapter strictly disables all callbacks and telemetry via `NoTelemetryCallbacks`.
- Telegram bot connector enforces 6-digit numeric pairing codes with 5-minute expiry and max 5 attempts, restricted to private chats.

## Side Effects

- Dispatches outbound HTTPS network calls to LLM provider endpoints and Telegram Bot API.
- Creates pending proposals in `proposals` table and records conversation messages via injected stores.

## Verification

- Run: `npm test`
