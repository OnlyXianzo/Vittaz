import Storage from "expo-sqlite/kv-store";
import { checkSensitiveMessage } from "@vittaz/core";

export const INSTRUCTIONS_KEY = "vittaz.chat.instructions.v1";
const MAX_INSTRUCTIONS = 1200;

function validate(value: string): string {
  const text = value.trim();
  if (
    text.length > MAX_INSTRUCTIONS ||
    (text && checkSensitiveMessage(text).sensitive)
  )
    throw new Error("invalid_instructions");
  return text;
}
export async function read_instructions(): Promise<string> {
  const raw = await Storage.getItemAsync(INSTRUCTIONS_KEY);
  return validate(raw ?? "");
}
export async function save_instructions(value: string): Promise<void> {
  const text = validate(value);
  if (text) await Storage.setItemAsync(INSTRUCTIONS_KEY, text);
  else await Storage.removeItemAsync(INSTRUCTIONS_KEY);
}
export function question_with_instructions(
  question: string,
  instructions: string,
): string {
  const text = validate(instructions);
  if (!text) return question;
  const combined = JSON.stringify({
    user_response_preferences: text,
    question,
  });
  if (combined.length > 8192)
    throw new Error("question_with_instructions_too_long");
  return combined;
}
