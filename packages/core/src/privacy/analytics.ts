/** Operational metadata only. Never accept prompt, reply, arguments or credentials. */
export interface AiAnalyticsMetadata {
  provider: string;
  model: string;
  key_nickname: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  cost_estimate_micros: number;
  outcome: "success" | "usage_unknown" | "unpriced";
}
export interface AiAnalyticsRow extends AiAnalyticsMetadata {
  id: string;
  created_at: string;
}
export type AppendAnalytics = (metadata: AiAnalyticsMetadata) => Promise<void>;
