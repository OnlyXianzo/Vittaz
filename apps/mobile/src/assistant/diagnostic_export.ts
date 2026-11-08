import type { MobileDiagnostics } from "./diagnostics";

export type DiagnosticSelectedLocation =
  "downloads_root" | "diagnostics_folder" | "other" | "cancelled";

export interface DiagnosticDirectorySelection {
  granted: boolean;
  directory_uri?: string;
  selected_location: DiagnosticSelectedLocation;
}

/** Small adapter surface so storage behavior can be tested without Android APIs. */
export interface DiagnosticDownloadStorage {
  request_download_directory(): Promise<DiagnosticDirectorySelection>;
  find_diagnostics_directory(downloads_uri: string): Promise<string | null>;
  create_diagnostics_directory(
    downloads_uri: string,
    directory_name: "Vittaz-Diagnostics",
  ): Promise<string>;
  create_json_file(folder_uri: string, filename_base: string): Promise<string>;
  write_utf8(file_uri: string, contents: string): Promise<void>;
}

export class DiagnosticExportError extends Error {
  readonly code: "export_permission_denied" | "export_io_error";
  constructor(code: "export_permission_denied" | "export_io_error") {
    super(code);
    this.name = "DiagnosticExportError";
    this.code = code;
  }
}

function file_timestamp(value: Date): string {
  return Number.isFinite(value.valueOf())
    ? value.toISOString().replace(/[:.]/g, "-")
    : "invalid-time";
}

export async function save_diagnostic_log(
  storage: DiagnosticDownloadStorage,
  diagnostics: MobileDiagnostics,
  clock: () => Date = () => new Date(),
): Promise<{ relative_path: string }> {
  diagnostics.record("diagnostic_export_started", "log_export", "started");
  try {
    const selection = await storage.request_download_directory();
    if (
      !selection.granted ||
      !selection.directory_uri ||
      selection.selected_location === "cancelled"
    ) {
      throw new DiagnosticExportError("export_permission_denied");
    }
    if (
      selection.selected_location !== "downloads_root" &&
      selection.selected_location !== "diagnostics_folder"
    ) {
      throw new DiagnosticExportError("export_permission_denied");
    }

    const folder_uri =
      selection.selected_location === "diagnostics_folder"
        ? selection.directory_uri
        : ((await storage.find_diagnostics_directory(
            selection.directory_uri,
          )) ??
          (await storage.create_diagnostics_directory(
            selection.directory_uri,
            "Vittaz-Diagnostics",
          )));
    const filename_base = `vittaz-diagnostics-${file_timestamp(clock())}`;
    const file_uri = await storage.create_json_file(folder_uri, filename_base);
    await storage.write_utf8(file_uri, diagnostics.dump_json());
    diagnostics.record(
      "diagnostic_export_succeeded",
      "log_export",
      "completed",
      undefined,
      "ok",
    );
    return {
      relative_path: `Downloads/Vittaz-Diagnostics/${filename_base}.json`,
    };
  } catch (error) {
    const reason =
      error instanceof DiagnosticExportError ? error.code : "export_io_error";
    diagnostics.record(
      "diagnostic_export_failed",
      "log_export",
      "failed",
      undefined,
      reason,
    );
    throw new DiagnosticExportError(reason);
  }
}
