import { describe, expect, it, jest } from "@jest/globals";
import { MobileDiagnostics } from "./diagnostics";
import {
  DiagnosticExportError,
  save_diagnostic_log,
  type DiagnosticDownloadStorage,
} from "./diagnostic_export";

const fixed_time = new Date("2026-11-05T10:11:12.000Z");

function storage(overrides: Partial<DiagnosticDownloadStorage> = {}) {
  const port: DiagnosticDownloadStorage = {
    request_download_directory: jest.fn(async () => ({
      granted: true,
      directory_uri: "downloads://root",
      selected_location: "downloads_root" as const,
    })),
    find_diagnostics_directory: jest.fn(async () => null),
    create_diagnostics_directory: jest.fn(
      async () => "downloads://root/Vittaz",
    ),
    create_json_file: jest.fn(
      async () =>
        "downloads://root/Vittaz/vittaz-diagnostics-2026-11-05T10-11-12-000Z.json",
    ),
    write_utf8: jest.fn(async () => undefined),
    ...overrides,
  };
  return port;
}

function logger() {
  return new MobileDiagnostics({
    enabled: true,
    clock: () => new Date(fixed_time),
    console_sink: () => undefined,
  });
}

describe("diagnostic log export", () => {
  it("creates/reuses the dedicated Downloads folder and exports only the safe log", async () => {
    const diagnostics = logger();
    diagnostics.record("app_started", "app", "completed");
    const port = storage();

    const result = await save_diagnostic_log(
      port,
      diagnostics,
      () => fixed_time,
    );

    expect(port.request_download_directory).toHaveBeenCalledTimes(1);
    expect(port.find_diagnostics_directory).toHaveBeenCalledWith(
      "downloads://root",
    );
    expect(port.create_diagnostics_directory).toHaveBeenCalledWith(
      "downloads://root",
      "Vittaz",
    );
    expect(port.create_json_file).toHaveBeenCalledWith(
      "downloads://root/Vittaz",
      "vittaz-diagnostics-2026-11-05T10-11-12-000Z",
    );
    const [written_uri, content] = (port.write_utf8 as jest.Mock).mock
      .calls[0]!;
    expect(written_uri).toContain("Vittaz");
    expect(JSON.parse(content as string).events[0].event_code).toBe(
      "app_started",
    );
    expect(result.relative_path).toBe(
      "Downloads/Vittaz/vittaz-diagnostics-2026-11-05T10-11-12-000Z.json",
    );
    expect(diagnostics.snapshot().at(-1)).toMatchObject({
      event_code: "diagnostic_export_succeeded",
      outcome: "completed",
    });
  });

  it("does not write when folder permission is denied and records a fixed reason", async () => {
    const diagnostics = logger();
    const port = storage({
      request_download_directory: jest.fn(async () => ({
        granted: false,
        selected_location: "cancelled" as const,
      })),
    });

    await expect(
      save_diagnostic_log(port, diagnostics, () => fixed_time),
    ).rejects.toBeInstanceOf(DiagnosticExportError);
    expect(port.create_json_file).not.toHaveBeenCalled();
    expect(diagnostics.snapshot().at(-1)).toMatchObject({
      event_code: "diagnostic_export_failed",
      reason_code: "export_permission_denied",
    });
  });

  it("writes directly to a custom user-selected folder when granted", async () => {
    const diagnostics = logger();
    const port = storage({
      request_download_directory: jest.fn(async () => ({
        granted: true,
        directory_uri: "content://custom/user-folder",
        selected_location: "other" as const,
      })),
      create_json_file: jest.fn(
        async () =>
          "content://custom/user-folder/vittaz-diagnostics-2026-11-05T10-11-12-000Z.json",
      ),
    });

    const result = await save_diagnostic_log(
      port,
      diagnostics,
      () => fixed_time,
    );
    expect(port.create_json_file).toHaveBeenCalledWith(
      "content://custom/user-folder",
      "vittaz-diagnostics-2026-11-05T10-11-12-000Z",
    );
    expect(result.relative_path).toBe(
      "Selected Folder/vittaz-diagnostics-2026-11-05T10-11-12-000Z.json",
    );
    expect(diagnostics.snapshot().at(-1)).toMatchObject({
      event_code: "diagnostic_export_succeeded",
      outcome: "completed",
    });
  });

  it("converts storage exceptions to a static export failure without echoing them", async () => {
    const diagnostics = logger();
    const port = storage({
      write_utf8: jest.fn(async () => {
        throw new Error("synthetic_private_storage_error");
      }),
    });

    await expect(
      save_diagnostic_log(port, diagnostics, () => fixed_time),
    ).rejects.toBeInstanceOf(DiagnosticExportError);
    expect(JSON.stringify(diagnostics.snapshot())).not.toContain(
      "synthetic_private_storage_error",
    );
    expect(diagnostics.snapshot().at(-1)).toMatchObject({
      event_code: "diagnostic_export_failed",
      reason_code: "export_io_error",
    });
  });
});
