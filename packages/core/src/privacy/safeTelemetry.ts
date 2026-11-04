const operationalEvents = new Set([
  "operation_started",
  "operation_succeeded",
  "operation_failed",
  "request_rejected",
  "provider_unavailable",
]);

/** Codebook-only diagnostics: never retain keys or inspect arbitrary payloads. */
export class SecretSanitizer {
  registerSecret(secret: unknown): void {
    void secret;
  }
  sanitizeString(input: unknown): string {
    return typeof input === "string" && operationalEvents.has(input)
      ? input
      : "[REDACTED_TEXT]";
  }
  sanitizeValue(value: unknown): string {
    void value;
    return "[OMITTED]";
  }
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  meta: string;
}

export class SafeLogger {
  private readonly records: LogEntry[] = [];
  constructor(
    public readonly sanitizer = new SecretSanitizer(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  get entries(): LogEntry[] {
    return this.records.map((entry) => ({ ...entry }));
  }
  log(level: unknown, message: unknown, meta?: unknown): LogEntry {
    const entry: LogEntry = {
      timestamp: this.clock().toISOString(),
      level:
        level === "info" || level === "warn" || level === "error"
          ? level
          : "error",
      message: this.sanitizer.sanitizeString(message),
      meta: this.sanitizer.sanitizeValue(meta),
    };
    this.records.push(entry);
    if (this.records.length > 100) this.records.shift();
    return { ...entry };
  }
  info(message: unknown, meta?: unknown): LogEntry {
    return this.log("info", message, meta);
  }
  warn(message: unknown, meta?: unknown): LogEntry {
    return this.log("warn", message, meta);
  }
  error(message: unknown, meta?: unknown): LogEntry {
    return this.log("error", message, meta);
  }
  dumpText(): string {
    return JSON.stringify(this.records);
  }
}

export interface CrashReport {
  id: string;
  captured_at: string;
  error: string;
  context: string;
}

export class CrashReporter {
  private readonly reports: CrashReport[] = [];
  private nextId = 0;
  constructor(
    public readonly sanitizer = new SecretSanitizer(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  captureException(error: unknown, context?: unknown): CrashReport {
    const report: CrashReport = {
      id: `crash_${++this.nextId}`,
      captured_at: this.clock().toISOString(),
      error: this.sanitizer.sanitizeValue(error),
      context: this.sanitizer.sanitizeValue(context),
    };
    this.reports.push(report);
    if (this.reports.length > 100) this.reports.shift();
    return { ...report };
  }
  getReports(): CrashReport[] {
    return this.reports.map((report) => ({ ...report }));
  }
  dumpText(): string {
    return JSON.stringify(this.reports);
  }
}
