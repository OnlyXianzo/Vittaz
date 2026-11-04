export interface NameMapping {
  name: string;
  placeholder: string;
}

const escapePattern = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Local mapping only. The application must seed stable names via async storage. */
export class PrivacyRedactor {
  private readonly mappings: NameMapping[] = [];

  constructor(names: readonly string[] = []) {
    for (const name of names) this.registerCounterparty(name);
  }

  registerCounterparty(rawName: unknown): string | null {
    if (typeof rawName !== "string") return null;
    const name = rawName.normalize("NFC").trim();
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

  redactText(input: unknown): string {
    if (typeof input !== "string" || input.length === 0) return "";
    let result = input.normalize("NFC");
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
