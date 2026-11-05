import { parseAssistantRules } from "@vittaz/core";
export function rulesContext(input: unknown): string {
  return parseAssistantRules(input)
    .filter((r) => r.kind === "behavior")
    .map((r) =>
      r.rule === "amounts_in_rupees"
        ? "Display monetary amounts in INR rupees; never guess or change integer paise values."
        : "Keep summaries short while showing numbers used and uncertainty.",
    )
    .join(" ");
}
