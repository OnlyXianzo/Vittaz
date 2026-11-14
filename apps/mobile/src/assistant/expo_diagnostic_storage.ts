import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { save_diagnostic_log } from "./diagnostic_export";
import type {
  DiagnosticDownloadStorage,
  DiagnosticDirectorySelection,
} from "./diagnostic_export";
import { mobile_diagnostics } from "./diagnostics";
import { saveJsonToDownloadsDirectly } from "../../modules/vittaz-mediastore";

const diagnostic_folder_name = "Vittaz" as const;

function decoded_uri(uri: string): string {
  try {
    return decodeURIComponent(uri).replace(/\\/g, "/").toLowerCase();
  } catch {
    return "";
  }
}

function selected_download_location(
  uri: string,
): DiagnosticDirectorySelection["selected_location"] {
  const decoded = decoded_uri(uri);
  if (/(?:^|[:/])download\/vittaz$/.test(decoded)) return "diagnostics_folder";
  if (/(?:^|[:/])download$/.test(decoded)) return "downloads_root";
  return "other";
}

export const expo_diagnostic_download_storage: DiagnosticDownloadStorage = {
  async request_download_directory() {
    if (Platform.OS !== "android")
      return { granted: false, selected_location: "other" };
    const initial_uri =
      FileSystem.StorageAccessFramework.getUriForDirectoryInRoot("Download");
    const selection =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
        initial_uri,
      );
    if (!selection.granted || !selection.directoryUri)
      return { granted: false, selected_location: "cancelled" };
    return {
      granted: true,
      directory_uri: selection.directoryUri,
      selected_location: selected_download_location(selection.directoryUri),
    };
  },

  async find_diagnostics_directory(downloads_uri) {
    const files =
      await FileSystem.StorageAccessFramework.readDirectoryAsync(downloads_uri);
    return files.find((uri) => decoded_uri(uri).endsWith("/vittaz")) ?? null;
  },

  create_diagnostics_directory(downloads_uri, directory_name) {
    if (directory_name !== diagnostic_folder_name)
      throw new Error("Invalid diagnostics directory");
    return FileSystem.StorageAccessFramework.makeDirectoryAsync(
      downloads_uri,
      diagnostic_folder_name,
    );
  },

  create_json_file(folder_uri, filename_base) {
    if (!/^vittaz-diagnostics-[0-9TZ-]+$/.test(filename_base))
      throw new Error("Invalid diagnostic filename");
    return FileSystem.StorageAccessFramework.createFileAsync(
      folder_uri,
      `${filename_base}.json`,
      "application/json",
    );
  },

  write_utf8(file_uri, contents) {
    return FileSystem.StorageAccessFramework.writeAsStringAsync(
      file_uri,
      contents,
      { encoding: FileSystem.EncodingType.UTF8 },
    );
  },
};

function file_timestamp(value: Date): string {
  return Number.isFinite(value.valueOf())
    ? value.toISOString().replace(/[:.]/g, "-")
    : "invalid-time";
}

export async function export_mobile_diagnostic_log(
  clock: () => Date = () => new Date(),
): Promise<{ relative_path: string }> {
  if (Platform.OS === "android") {
    try {
      const filename_base = `vittaz-diagnostics-${file_timestamp(clock())}`;
      mobile_diagnostics.record(
        "diagnostic_export_started",
        "log_export",
        "started",
      );
      const direct_path = await saveJsonToDownloadsDirectly(
        "Vittaz",
        filename_base,
        mobile_diagnostics.dump_json(),
      );
      if (direct_path) {
        mobile_diagnostics.record(
          "diagnostic_export_succeeded",
          "log_export",
          "completed",
          undefined,
          "ok",
        );
        return { relative_path: direct_path };
      }
    } catch {
      // Direct MediaStore save failed; fall back cleanly to SAF
    }
  }
  return save_diagnostic_log(
    expo_diagnostic_download_storage,
    mobile_diagnostics,
    clock,
  );
}
