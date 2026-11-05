import { z } from "zod";
import {
  checkSensitiveMessage,
  parseMessageOrigin,
  evaluateMessageConditions,
  createProposal,
  recordConversationMessage,
} from "@vittaz/core";
import type {
  AssistantService,
  AssistantReply,
  AssistantOptions,
  MessageOrigin,
  ConversationHistoryStore,
  AssistantPreferencesStore,
  AssistantRulesStore,
  LedgerStore,
  LedgerRuntime,
  PrivacyRedactor,
  LocalEntryDraft,
  CreateProposalInput,
} from "@vittaz/core";
import { defaultLedgerRuntime } from "@vittaz/core";
import type { QuestionAnsweringAgent } from "./qa_loop.js";
import { ValidatedLocalModelTasks } from "./local_tasks.js";
import { validateAndCreateProposalFromToolCall } from "./tools.js";
const requestSchema = z.strictObject({
  request_id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/),
  conversation_id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/),
  action: z.enum(["question", "draft_entry", "improve_note"]),
  text: z.string().trim().min(1).max(8192),
});
const optionsSchema = z.strictObject({
  signal: z.instanceof(AbortSignal).optional(),
  timeout_ms: z.int().min(1).max(120000).default(30000),
});
const reply = (
  status: AssistantReply["status"],
  text: string | null = null,
  proposal_id: string | null = null,
): AssistantReply => ({ status, text, proposal_id });
export interface AssistantServiceDependencies {
  ledger: LedgerStore;
  history: ConversationHistoryStore;
  preferences: AssistantPreferencesStore;
  rules: AssistantRulesStore;
  qa: QuestionAnsweringAgent;
  local: ValidatedLocalModelTasks;
  redactor: PrivacyRedactor;
  runtime?: LedgerRuntime;
}
/** Host wiring owns capabilities. No model is given this service or any write handle. */
export class SharedAssistantService implements AssistantService {
  #tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly p: AssistantServiceDependencies) {}
  async handle(
    raw: unknown,
    rawOrigin: MessageOrigin,
    rawOptions: AssistantOptions = {},
  ): Promise<AssistantReply> {
    let request: z.infer<typeof requestSchema>;
    let origin: MessageOrigin;
    let options: z.infer<typeof optionsSchema>;
    try {
      origin = parseMessageOrigin(rawOrigin);
      if (!evaluateMessageConditions([], origin)) return reply("rejected");
      request = requestSchema.parse(raw);
      options = optionsSchema.parse(rawOptions);
    } catch {
      return reply("invalid_request");
    }
    if (checkSensitiveMessage(request.text).sensitive)
      return reply("sensitive_dropped");
    if (options.signal?.aborted) return reply("aborted");
    const deadline = new AbortController();
    const expires = performance.now() + options.timeout_ms;
    const signal = options.signal
      ? AbortSignal.any([deadline.signal, options.signal])
      : deadline.signal;
    const stop = () => reply(options.signal?.aborted ? "aborted" : "timeout");
    const check = () => {
      if (performance.now() >= expires) deadline.abort();
      signal.throwIfAborted();
    };
    const timer = setTimeout(() => deadline.abort(), options.timeout_ms);
    let notify!: () => void;
    const aborted = new Promise<AssistantReply>((resolve) => {
      notify = () => resolve(stop());
      signal.addEventListener("abort", notify, { once: true });
    });
    const operation = this.#tail.then(async () => {
      try {
        check();
        const value = await this.run(request, origin, signal, check, expires);
        check();
        return value;
      } catch {
        return signal.aborted || performance.now() >= expires
          ? stop()
          : reply("unavailable");
      }
    });
    this.#tail = operation.then(() => undefined);
    try {
      const result = await Promise.race([operation, aborted]);
      if (performance.now() >= expires || signal.aborted) return stop();
      return result;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", notify);
    }
  }
  private async run(
    request: z.infer<typeof requestSchema>,
    origin: MessageOrigin,
    signal: AbortSignal,
    check: () => void,
    expires: number,
  ): Promise<AssistantReply> {
    const rules = await this.p.rules.get();
    check();
    if (!evaluateMessageConditions(rules, origin)) return reply("rejected");
    const preferences = await this.p.preferences.get();
    check();
    const runtime = this.p.runtime ?? defaultLedgerRuntime;
    await this.p.history.ensureConversation({
      id: request.conversation_id,
      created_at: runtime.now(),
    });
    check();
    const history = await this.p.history.listMessages(
      request.conversation_id,
      6,
    );
    check();
    await recordConversationMessage(this.p.history, {
      id: request.request_id + "_u",
      conversation_id: request.conversation_id,
      source: origin.source,
      role: "user",
      content: request.text,
      created_at: runtime.now(),
    });
    check();
    let result: AssistantReply;
    if (request.action === "question") {
      const qa = await this.p.qa.answerQuestion(request.text, {
        signal,
        timeoutMs: Math.max(1, Math.floor(expires - performance.now())),
        preferences,
        rules,
        origin,
        history: history.map((m) => ({ role: m.role, content: m.content })),
      });
      check();
      result =
        qa.answered && qa.answer
          ? reply("answered", qa.answer)
          : reply("unavailable");
    } else if (request.action === "improve_note") {
      const value = await this.p.local.improve_note(
        { text: request.text },
        {
          signal,
          timeout_ms: Math.max(1, Math.floor(expires - performance.now())),
        },
      );
      check();
      result =
        value.status === "ok"
          ? reply("note_suggestion", value.value)
          : reply("not_understood", "Could not improve this note safely.");
    } else {
      const value = await this.p.local.parse_entry(
        { text: request.text },
        {
          signal,
          timeout_ms: Math.max(1, Math.floor(expires - performance.now())),
        },
      );
      check();
      if (value.status !== "ok")
        result = reply(
          "not_understood",
          "Could not understand an entry without guessing.",
        );
      else {
        const proposal = await createPendingDraft(
          this.p.ledger,
          value.value,
          this.p.redactor,
          check,
          runtime,
        );
        check();
        result = reply(
          "pending_proposal",
          "Pending proposal created; user approval required.",
          proposal.id,
        );
      }
    }
    if (result.text !== null) {
      if (
        result.text.length > 8192 ||
        checkSensitiveMessage(result.text).sensitive
      )
        return reply("unavailable");
      await recordConversationMessage(this.p.history, {
        id: request.request_id + "_a",
        conversation_id: request.conversation_id,
        source: origin.source,
        role: "assistant",
        content: result.text,
        created_at: runtime.now(),
      });
      check();
    }
    return result;
  }
}
/** Guard is checked inside the native queued transaction, both before and after writes. */
export async function createPendingDraft(
  ledger: LedgerStore,
  draft: LocalEntryDraft,
  redactor: PrivacyRedactor,
  check: () => void,
  runtime: LedgerRuntime = defaultLedgerRuntime,
) {
  const guarded: LedgerStore = {
    read: ledger.read,
    close: ledger.close,
    transaction: (work) =>
      ledger.transaction(async (repos) => {
        check();
        const value = await work(repos);
        check();
        return value;
      }),
  };
  const input = {
    amount_paise: draft.amount_paise,
    direction: draft.direction,
    category: draft.category,
    split_owed_paise: draft.split_owed_paise,
    ...(draft.counterparty_name
      ? { counterparty: redactor.registerCounterparty(draft.counterparty_name) }
      : {}),
  };
  return validateAndCreateProposalFromToolCall(
    (value: CreateProposalInput) =>
      createProposal(guarded, { ...value, note: draft.note }, runtime),
    redactor,
    { function: { name: "propose_transaction", arguments: input } },
  );
}
