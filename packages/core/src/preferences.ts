export interface AssistantPreferences {
  tone: "neutral" | "friendly" | "formal";
  language: "english" | "hindi" | "hinglish";
  detail: "concise" | "balanced" | "detailed";
}
export interface AssistantPreferencesStore {
  get(): Promise<AssistantPreferences>;
  set(value: AssistantPreferences): Promise<void>;
}
export class AssistantPreferencesError extends Error {
  constructor(readonly code: "invalid_input" | "unavailable") {
    super("Assistant preferences operation failed");
    this.name = "AssistantPreferencesError";
  }
}
export function defaultAssistantPreferences(): AssistantPreferences {
  return { tone: "neutral", language: "english", detail: "balanced" };
}
export function parseAssistantPreferences(
  value: unknown,
): AssistantPreferences {
  try {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length !== 3 ||
      !["tone", "language", "detail"].every((k) => Object.hasOwn(value, k))
    )
      throw new Error();
    const v = value as AssistantPreferences;
    const { tone, language, detail } = v;
    if (
      (tone !== "neutral" && tone !== "friendly" && tone !== "formal") ||
      (language !== "english" &&
        language !== "hindi" &&
        language !== "hinglish") ||
      (detail !== "concise" && detail !== "balanced" && detail !== "detailed")
    )
      throw new Error();
    return { tone, language, detail };
  } catch {
    throw new AssistantPreferencesError("invalid_input");
  }
}
export async function getAssistantPreferences(
  store: AssistantPreferencesStore,
): Promise<AssistantPreferences> {
  try {
    return parseAssistantPreferences(await store.get());
  } catch {
    throw new AssistantPreferencesError("unavailable");
  }
}
export async function setAssistantPreferences(
  store: AssistantPreferencesStore,
  input: AssistantPreferences,
): Promise<AssistantPreferences> {
  const p = parseAssistantPreferences(input);
  try {
    await store.set({ ...p });
    return p;
  } catch {
    throw new AssistantPreferencesError("unavailable");
  }
}
