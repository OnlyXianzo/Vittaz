import { z } from "zod";
import type { AppendAnalytics } from "@vittaz/core";
import type {
  ChatCompletionParams,
  ChatCompletionResult,
  OpenAICompatibleClient,
} from "./provider_client.js";
import type { KeyPool } from "./key_pool.js";
export class AnalyticsError extends Error {
  constructor() {
    super("Analytics metadata could not be recorded");
    this.name = "AnalyticsError";
  }
}
const integer = z
  .int()
  .nonnegative()
  .refine((v) => !Object.is(v, -0));
const ratesSchema = z.record(
  z.string(),
  z.strictObject({
    input_micros_per_1k: integer,
    output_micros_per_1k: integer,
  }),
);
const usageSchema = z
  .strictObject({
    prompt_tokens: integer,
    completion_tokens: integer,
    total_tokens: integer,
  })
  .refine(
    (v) =>
      BigInt(v.total_tokens) >=
      BigInt(v.prompt_tokens) + BigInt(v.completion_tokens),
  );
/** App-owned completion decorator: sink receives a newly built metadata object only. */
export class AnalyticsClient {
  private readonly rates;
  private readonly now;
  constructor(
    private readonly params: {
      client: Pick<OpenAICompatibleClient, "chatCompletion">;
      keyPool: Pick<KeyPool, "getStatusSnapshot">;
      append: AppendAnalytics;
      rates?: Record<
        string,
        { input_micros_per_1k: number; output_micros_per_1k: number }
      >;
      nowFn?: () => number;
    },
  ) {
    try {
      this.rates = new Map(
        Object.entries(ratesSchema.parse(params.rates ?? {})),
      );
    } catch {
      throw new AnalyticsError();
    }
    this.now = params.nowFn ?? (() => performance.now());
  }
  async chatCompletion(
    params: ChatCompletionParams,
  ): Promise<ChatCompletionResult> {
    let start: number;
    try {
      start = z.number().finite().parse(this.now());
    } catch {
      throw new AnalyticsError();
    }
    // Provider rejection/sensitive drop never creates an operational row.
    const result = await this.params.client.chatCompletion(params);
    try {
      const usage = usageSchema.parse(result.usage);
      const metadata = this.params.keyPool
        .getStatusSnapshot()
        .find((v) => v.nickname === result.keyNickname);
      if (!metadata) throw new AnalyticsError();
      const rate = this.rates.get(metadata.model);
      const latency = Math.round(this.now() - start);
      integer.parse(latency);
      let cost = 0n;
      if (rate)
        cost =
          (BigInt(usage.prompt_tokens) * BigInt(rate.input_micros_per_1k) +
            BigInt(usage.completion_tokens) *
              BigInt(rate.output_micros_per_1k) +
            500n) /
          1000n;
      if (cost > BigInt(Number.MAX_SAFE_INTEGER)) throw new AnalyticsError();
      await this.params.append({
        provider: metadata.provider,
        model: metadata.model,
        key_nickname: metadata.nickname,
        ...usage,
        latency_ms: latency,
        cost_estimate_micros: usage.total_tokens === 0 ? 0 : Number(cost),
        outcome:
          usage.total_tokens === 0
            ? "usage_unknown"
            : rate
              ? "success"
              : "unpriced",
      });
    } catch {
      throw new AnalyticsError();
    }
    return result;
  }
}
