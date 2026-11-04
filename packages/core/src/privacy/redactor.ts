import { checkSensitiveMessage } from "./sensitiveFilter.js";
import { scrubOutboundText } from "./scrubber.js";

export interface NameMapping {
  name: string;
  placeholder: string;
}

const escapePattern = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const nonPersonWords = new Set([
  "me",
  "him",
  "her",
  "us",
  "them",
  "you",
  "self",
  "wo",
  "woh",
  "vo",
  "main",
  "mai",
  "hum",
  "tum",
  "aap",
  "kisi",
  "khud",
  "aadha",
  "kal",
  "aaj",
  "bank",
  "cash",
  "card",
  "lunch",
  "dinner",
  "chai",
  "tea",
  "coffee",
  "food",
  "shop",
  "store",
  "home",
  "office",
  "auto",
  "मुझे",
  "हमको",
  "किसी",
  "आज",
  "कल",
  "बैंक",
  "घर",
  "चाय",
  "जी",
]);
const inlinePatterns = [
  /\b(?:to|from|with|by)\s+([A-Za-z]{2,24}(?:[ \t]+[A-Z][a-zA-Z]{1,23})?)(?![\p{L}\p{M}\p{N}_])/gu,
  /\b([A-Za-z]{2,24})\s+owes\b/gu,
  /\b([A-Za-z]{2,24}(?:\s+(?:ji|bhai|bhaiya|didi))?)\s+(?:ko|se|ne|ke\s+saath|k\s+saath)\b/giu,
  /(?<![\p{L}\p{M}\p{N}_])([\p{Script_Extensions=Devanagari}]{2,24}(?:\s+जी)?)\s+(?:को|से|ने|के\s+साथ)(?![\p{L}\p{M}\p{N}_])/gu,
];

/** Local mapping only. The application must seed stable names via async storage. */
export class PrivacyRedactor {
  private readonly mappings: NameMapping[] = [];

  constructor(names: readonly string[] = []) {
    for (const name of names) this.registerCounterparty(name);
  }

  registerCounterparty(rawName: unknown): string | null {
    if (typeof rawName !== "string") return null;
    const name = rawName
      .normalize("NFKC")
      .replace(/\p{Cf}/gu, "")
      .trim();
    if (!name || /Person_\d+/iu.test(name)) return null;
    const existing = this.mappings.find(
      (entry) => entry.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing.placeholder;
    const placeholder = `Person_${this.mappings.length + 1}`;
    this.mappings.push({ name, placeholder });
    return placeholder;
  }

  getAllMappings(): NameMapping[] {
    return this.mappings.map((entry) => ({ ...entry }));
  }

  discoverAndRegisterInlineNames(input: unknown): void {
    if (typeof input !== "string" || checkSensitiveMessage(input).sensitive)
      return;
    for (const pattern of inlinePatterns) {
      for (const match of input.matchAll(pattern)) {
        const candidate = match[1]!;
        const words = candidate.toLowerCase().split(/\s+/);
        if (
          words.some(
            (word, index) =>
              nonPersonWords.has(word) && !(index > 0 && word === "जी"),
          ) ||
          /\p{N}/u.test(candidate)
        )
          continue;
        this.registerCounterparty(candidate);
      }
    }
  }

  redactText(input: unknown): string {
    if (typeof input !== "string" || checkSensitiveMessage(input).sensitive)
      return "";
    let result = scrubOutboundText(input)
      .normalize("NFC")
      .replace(
        /(?<![\p{L}\p{M}\p{N}_])Person_\d+(?![\p{L}\p{M}\p{N}_])/giu,
        "[PERSON_TOKEN]",
      );
    this.discoverAndRegisterInlineNames(result);
    const longestFirst = this.getAllMappings().sort(
      (a, b) => b.name.length - a.name.length,
    );
    for (const { name, placeholder } of longestFirst) {
      const pattern = new RegExp(
        String.raw`(?<![\p{L}\p{M}\p{N}_])${escapePattern(name)}(?![\p{L}\p{M}\p{N}_])`,
        "giu",
      );
      result = result.replace(pattern, () => placeholder);
    }
    return result;
  }

  unredactText(input: unknown): string {
    if (typeof input !== "string" || input.length === 0) return "";
    const byPlaceholder = new Map(
      this.mappings.map((entry) => [entry.placeholder, entry.name]),
    );
    return input.replace(
      /(?<![\p{L}\p{M}\p{N}_])Person_[1-9]\d*(?![\p{L}\p{M}\p{N}_])/gu,
      (token) => byPlaceholder.get(token) ?? token,
    );
  }
}
