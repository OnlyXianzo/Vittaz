import { z } from "zod";
import {
  processNotification,
  defaultLedgerRuntime,
  parseMessageOrigin,
  evaluateMessageConditions,
} from "@vittaz/core";
import type {
  LedgerStore,
  LedgerRuntime,
  PrivacyRedactor,
  MessageOrigin,
  AssistantRulesStore,
  ProcessNotificationResult,
} from "@vittaz/core";
import { ValidatedLocalModelTasks } from "./local_tasks.js";
import { createPendingDraft } from "./assistant.js";
const inputSchema = z.strictObject({
  appPackage: z.string().max(256),
  text: z.string().max(8192),
  postTime: z.union([z.string().max(64), z.number()]),
});
export class AssistantNotificationWorker {
  constructor(
    private readonly p: {
      ledger: LedgerStore;
      local: ValidatedLocalModelTasks;
      redactor: PrivacyRedactor;
      rules: AssistantRulesStore;
      runtime?: LedgerRuntime;
    },
  ) {}
  async process(
    input: unknown,
    rawOrigin: MessageOrigin,
    options: { signal?: AbortSignal } = {},
  ): Promise<{
    status: "processed" | "rejected" | "unavailable";
    result: ProcessNotificationResult | null;
    proposal_id: string | null;
  }> {
    const reply = (
      status: "processed" | "rejected" | "unavailable",
      result: ProcessNotificationResult | null = null,
      proposal_id: string | null = null,
    ) => ({ status, result, proposal_id });
    try {
      const origin = parseMessageOrigin(rawOrigin);
      if (origin.source !== "app" || !evaluateMessageConditions([], origin))
        return reply("rejected");
      const request = inputSchema.parse(input);
      const signal = options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000);
      const expires = performance.now() + 30000;
      const check = () => {
        if (performance.now() >= expires) throw new Error();
        signal.throwIfAborted();
      };
      check();
      const runtime = this.p.runtime ?? defaultLedgerRuntime;
      const result = await processNotification(
        this.p.ledger,
        request,
        { localParserAvailable: true },
        runtime,
      );
      check();
      if (result.action !== "routed_unknown_format")
        return reply("processed", result);
      if (!evaluateMessageConditions(await this.p.rules.get(), origin))
        return reply("rejected", result);
      check();
      const draft = await this.p.local.parse_entry(
        { text: request.text },
        {
          signal,
          timeout_ms: Math.max(1, Math.floor(expires - performance.now())),
        },
      );
      check();
      if (draft.status !== "ok") return reply("processed", result);
      const proposal = await createPendingDraft(
        this.p.ledger,
        draft.value,
        this.p.redactor,
        check,
        runtime,
      );
      check();
      return reply("processed", result, proposal.id);
    } catch {
      return reply("unavailable");
    }
  }
}
