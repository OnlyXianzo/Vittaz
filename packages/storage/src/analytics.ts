import { z } from "zod";
import { checkSensitiveMessage } from "@vittaz/core";
import type { AiAnalyticsMetadata } from "@vittaz/core";
const count = z
  .int()
  .nonnegative()
  .refine((v) => !Object.is(v, -0));
const code = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_./:@-]+$/);
const metadata = z
  .strictObject({
    provider: code,
    model: code,
    key_nickname: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
    prompt_tokens: count,
    completion_tokens: count,
    total_tokens: count,
    latency_ms: count,
    cost_estimate_micros: count,
    outcome: z.enum(["success", "usage_unknown", "unpriced"]),
  })
  .refine(
    (v) =>
      BigInt(v.total_tokens) >=
      BigInt(v.prompt_tokens) + BigInt(v.completion_tokens),
  )
  .refine((v) =>
    v.outcome === "usage_unknown"
      ? v.total_tokens === 0 && v.cost_estimate_micros === 0
      : v.total_tokens > 0,
  )
  .refine((v) => v.outcome !== "unpriced" || v.cost_estimate_micros === 0);
export function parseAnalyticsMetadata(value: unknown): AiAnalyticsMetadata {
  try {
    const parsed = metadata.parse(value);
    if (checkSensitiveMessage(JSON.stringify(parsed)).sensitive)
      throw new Error();
    return parsed;
  } catch {
    throw new Error("Invalid analytics metadata");
  }
}
