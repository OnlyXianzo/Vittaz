# Core Privacy Boundary

## Overview

Deterministic privacy boundary enforcement, sensitive credential detection (English, Hindi, Hinglish), reversible counterparty pseudonymization, regex PII scrubbing, and codebook-only telemetry logging.

## Interface

- **Sensitive Filter**: `checkSensitiveMessage(text: unknown): SensitiveCheckResult`, `withNonSensitiveMessage<T>(text: unknown, process: (text: string) => T | Promise<T>): Promise<{ dropped: true; reason: SensitiveReason } | { dropped: false; value: T }>`, `SensitiveReason`, `SensitiveCheckResult`.
- **Redactor**: `PrivacyRedactor` class (`registerCounterparty`, `getAllMappings`, `discoverAndRegisterInlineNames`, `redactText`, `unredactText`, `redactOutboundText`), `NameMapping`.
- **Scrubber**: `scrubOutboundText(input: unknown): string`.
- **Safe Telemetry**: `SecretSanitizer`, `SafeLogger`, `CrashReporter`, `LogEntry`, `CrashReport`.
- **Analytics Contracts**: `AiAnalyticsMetadata`, `AiAnalyticsRow`, `AppendAnalytics`.

## Invariants

- Sensitive filter checks bounded regexes for OTP, PIN, CVV, password, "do not share", Hinglish phrases, and Devanagari Hindi phrases without returning or logging matched sensitive substrings.
- Counterparties are pseudonymized to stable tokens (`Person_1`, `Person_2`) matching in longest-first order to prevent substring collision.
- `scrubOutboundText` sanitizes UPI URIs, UPI transaction references, VPAs, IFSC codes, bank/card account numbers, phone numbers, and digit sequences >= 9 into safe replacement tokens.
- `SafeLogger` and `CrashReporter` enforce codebook-only sanitization: non-allowlisted string payloads are redacted to `[REDACTED_TEXT]` or `[OMITTED]`.
- Ring buffers in `SafeLogger` and `CrashReporter` cap retained diagnostic records at 100 entries.
- Analytics contracts strictly forbid prompt text, completions, arguments, or API keys; operational token usage, latency, and cost estimates only.

## Side Effects

- In-memory mapping state maintained in `PrivacyRedactor` instances and fixed 100-entry ring buffers in `SafeLogger` and `CrashReporter`.

## Verification

- Run: `npm test`
