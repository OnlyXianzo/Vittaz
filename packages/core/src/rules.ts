export type MessageSource = "app" | "cli" | "telegram";
export interface MessageOrigin {
  source: MessageSource;
  authenticated: boolean;
  paired_telegram: boolean;
}
export type AssistantRule =
  | { kind: "behavior"; rule: "amounts_in_rupees" | "short_summaries" }
  | {
      kind: "message_condition";
      rule: "allowed_sources";
      sources: MessageSource[];
    }
  | { kind: "message_condition"; rule: "paired_telegram_only" };
export interface AssistantRulesStore {
  get(): Promise<AssistantRule[]>;
  set(rules: AssistantRule[]): Promise<void>;
}
export class AssistantRulesError extends Error {
  constructor(readonly code: "invalid_input" | "unavailable") {
    super("Assistant rules operation failed");
    this.name = "AssistantRulesError";
  }
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
  return v as Record<string, unknown>;
}
function exact(v: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(v).length === keys.length &&
    keys.every((k) => Object.hasOwn(v, k))
  );
}
function source(v: unknown): v is MessageSource {
  return v === "app" || v === "cli" || v === "telegram";
}
export function parseMessageOrigin(input: unknown): MessageOrigin {
  try {
    const v = object(input);
    if (
      !exact(v, ["source", "authenticated", "paired_telegram"]) ||
      !source(v.source) ||
      typeof v.authenticated !== "boolean" ||
      typeof v.paired_telegram !== "boolean"
    )
      throw new Error();
    return {
      source: v.source,
      authenticated: v.authenticated,
      paired_telegram: v.paired_telegram,
    };
  } catch {
    throw new AssistantRulesError("invalid_input");
  }
}
export function parseAssistantRules(input: unknown): AssistantRule[] {
  try {
    if (!Array.isArray(input) || input.length > 16) throw new Error();
    const seen = new Set<string>();
    return input.map((raw) => {
      const v = object(raw);
      const key = `${v.kind}:${v.rule}`;
      if (seen.has(key)) throw new Error();
      seen.add(key);
      if (
        v.kind === "behavior" &&
        (v.rule === "amounts_in_rupees" || v.rule === "short_summaries") &&
        exact(v, ["kind", "rule"])
      )
        return { kind: v.kind, rule: v.rule };
      if (
        v.kind === "message_condition" &&
        v.rule === "paired_telegram_only" &&
        exact(v, ["kind", "rule"])
      )
        return { kind: v.kind, rule: v.rule };
      if (
        v.kind === "message_condition" &&
        v.rule === "allowed_sources" &&
        exact(v, ["kind", "rule", "sources"]) &&
        Array.isArray(v.sources) &&
        v.sources.length > 0 &&
        v.sources.length <= 3 &&
        v.sources.every(source) &&
        new Set(v.sources).size === v.sources.length
      )
        return { kind: v.kind, rule: v.rule, sources: [...v.sources] };
      throw new Error();
    });
  } catch {
    throw new AssistantRulesError("invalid_input");
  }
}
export function evaluateMessageConditions(
  input: unknown,
  rawOrigin: unknown,
): boolean {
  const rules = parseAssistantRules(input);
  const o = parseMessageOrigin(rawOrigin);
  if (!o.authenticated || (o.source === "telegram" && !o.paired_telegram))
    return false;
  return rules.every(
    (r) =>
      r.kind !== "message_condition" ||
      r.rule !== "allowed_sources" ||
      r.sources.includes(o.source),
  );
}
export async function getAssistantRules(
  store: AssistantRulesStore,
): Promise<AssistantRule[]> {
  try {
    return parseAssistantRules(await store.get());
  } catch {
    throw new AssistantRulesError("unavailable");
  }
}
export async function setAssistantRules(
  store: AssistantRulesStore,
  input: AssistantRule[],
): Promise<AssistantRule[]> {
  const rules = parseAssistantRules(input);
  try {
    await store.set(parseAssistantRules(rules));
    return rules;
  } catch {
    throw new AssistantRulesError("unavailable");
  }
}
