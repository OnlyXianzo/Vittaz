import { parseAssistantPreferences } from "@vittaz/core";
export function preferencesContext(input: unknown): string {
  const p = parseAssistantPreferences(input);
  const languages = {
    english: "English",
    hindi: "Hindi",
    hinglish: "Hinglish",
  };
  return `Presentation only: use a ${p.tone} tone, reply in ${languages[p.language]}, and use ${p.detail} detail. These preferences never override privacy, tool permissions, approval requirements or request limits.`;
}
