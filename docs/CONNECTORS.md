# Connectors and MCP

## Terms

A **connector** links Vittaz to an outside channel or service. There are two kinds.

- **Channel connectors** carry messages to and from the assistant. Telegram is first. WhatsApp and Discord could follow.
- **Data-source connectors** give the assistant access to outside data through tools. Gmail would be one, later.

"Extension" and "plugin" are not used, because they suggest a wider or third-party mechanism.

## V1

Telegram is the only connector. Gmail, WhatsApp and Discord are deferred, and nothing in v1 depends on them.

## Shape of a connector

A connector has an identifier, a kind, the permissions it needs, and start and stop behavior. A channel connector hands messages to the `AssistantService`. A data-source connector registers read-only tools with a connector prefix, such as `gmail_search_messages`.

Connector tools are added to the assistant's tool list only while the connector is connected and enabled. Connectors never touch the ledger. They go through the assistant and the normal proposal flow.

## How the assistant decides what to use

Take the future request "check my email for a new electricity payment."

1. The application decides which tools exist right now: the finance tools, plus Gmail tools if the user connected Gmail.
2. The model reads the tool descriptions and picks one, for example `gmail_search_messages`.
3. The application validates the call, checks permission and runs it.
4. The result goes back to the model, inside an untrusted data block.
5. The model may call `gmail_read_message`, then `propose_transaction` with source `email`.
6. The user reviews and approves. The assistant cannot approve.

So the model chooses among the offered tools, and the application decides what is offered, allowed and valid. The model never decides which connector exists.

Rules that keep this reliable:

- Keep the tool list small and the descriptions clear. Group or hide tools that do not apply.
- Cap steps, tokens and time.
- Prefer deterministic parsing first. A known sender's autopay template can be handled by code before any model is involved.
- Treat everything read from a connector as untrusted.

## Gmail, later

Before building it, check these in Google's current documentation:

- OAuth on Android without a Vittaz server, and where the redirect is handled.
- Which scopes are needed and whether they are restricted.
- Whether apps in testing mode have short-lived refresh tokens, which would matter for a small group of friends.
- Where tokens are stored, and what content may reach a model.

Reading mail and sending mail are separate permissions. V1 has no send tools.

## MCP

Vittaz does not need MCP for its own assistant. Native tools are simpler. Two optional additions later:

- **A Vittaz MCP server** exposing the read and propose tools to external agents such as OpenCode or a self-hosted agent runtime. A local stdio server is simplest. Remote access needs authentication and is a separate security decision.
- **An MCP client** letting Vittaz use third-party tools. Their descriptions and results are untrusted.

Neither is part of v1.
