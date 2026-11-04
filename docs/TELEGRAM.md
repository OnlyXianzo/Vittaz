# Telegram connector

Telegram is an optional channel to the same assistant. It has no AI, memory or finance logic of its own.

## Setup

1. The user creates a bot with BotFather and copies the token.
2. The user enters the token in Vittaz. It is stored in platform secure storage.
3. Vittaz shows a one-time pairing code.
4. The user sends the code to the bot.
5. Vittaz records that chat as the paired chat and discards the code.

Entering a chat identifier by hand is an advanced fallback. The code is the normal path, because a typed identifier alone proves nothing.

## Message flow

```text
Telegram -> connector (long polling) -> paired-chat check -> sensitive-word filter
         -> AssistantService (source = telegram) -> reply to the paired chat
```

- Messages from any other chat are ignored, not answered and not stored.
- Messages matching the sensitive-word filter are dropped before the assistant or storage sees them.
- Accepted messages join the shared conversation history.

## Where it runs

The connector runs inside a Vittaz process, either the Android app or the CLI. It uses long polling, so no public server or webhook is needed.

- Only one device may poll a bot token. Two pollers conflict. A primary-device setting decides which one polls, and a conflict error is reported to the user.
- On Android the app needs a foreground service. Phones may still stop it.
- If no Vittaz process is running, nothing is processed. Telegram keeps unread messages for a limited time, so the connector may catch up when it restarts. Check Telegram's current documentation for how long.

## Digests

When a process is running, the connector can send a short digest once or twice a day: the number of unverified entries and the day's spending allowance. It does not ping every few minutes. Real-time alerts while everything is closed are not promised.

## Privacy

Telegram can read bot messages. They are not end-to-end encrypted. See [Privacy](PRIVACY.md).

## Out of scope for v1

Webhooks, a hosted bot, voice messages, file uploads and group chats.

## Tests

Run against a fake Telegram API: pairing, code expiry, chat lock, ignored strangers, sensitive-word drop, shared history, digest content, poller conflict handling, and token redaction in logs.
