import { jest } from "@jest/globals";

jest.mock("expo-file-system/legacy", () => ({
  EncodingType: { UTF8: "utf8" },
  StorageAccessFramework: {
    getUriForDirectoryInRoot: jest.fn(),
    requestDirectoryPermissionsAsync: jest.fn(),
    readDirectoryAsync: jest.fn(),
    makeDirectoryAsync: jest.fn(),
    createFileAsync: jest.fn(),
    writeAsStringAsync: jest.fn(),
  },
}));

import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { expo_diagnostic_download_storage as storage } from "./expo_diagnostic_storage";

const saf = FileSystem.StorageAccessFramework;

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "android",
  });
});

test("Android SAF starts at Downloads and classifies a granted Downloads selection", async () => {
  const root_uri = "content://downloads/tree/primary%3ADownload";
  jest.mocked(saf.getUriForDirectoryInRoot).mockReturnValue(root_uri);
  jest.mocked(saf.requestDirectoryPermissionsAsync).mockResolvedValue({
    granted: true,
    directoryUri: root_uri,
  });

  await expect(storage.request_download_directory()).resolves.toEqual({
    granted: true,
    directory_uri: root_uri,
    selected_location: "downloads_root",
  });
  expect(saf.getUriForDirectoryInRoot).toHaveBeenCalledWith("Download");
  expect(saf.requestDirectoryPermissionsAsync).toHaveBeenCalledWith(root_uri);
});

test("Android SAF accepts only the dedicated Vittaz folder directly under Downloads", async () => {
  const folder_uri =
    "content://downloads/tree/primary%3ADownload%2FVittaz-Diagnostics";
  jest.mocked(saf.requestDirectoryPermissionsAsync).mockResolvedValueOnce({
    granted: true,
    directoryUri: folder_uri,
  });
  await expect(storage.request_download_directory()).resolves.toEqual({
    granted: true,
    directory_uri: folder_uri,
    selected_location: "diagnostics_folder",
  });
  jest.mocked(saf.requestDirectoryPermissionsAsync).mockResolvedValueOnce({
    granted: true,
    directoryUri:
      "content://downloads/tree/primary%3APictures%2FVittaz-Diagnostics",
  });
  await expect(storage.request_download_directory()).resolves.toEqual({
    granted: true,
    directory_uri:
      "content://downloads/tree/primary%3APictures%2FVittaz-Diagnostics",
    selected_location: "other",
  });

  jest.mocked(saf.requestDirectoryPermissionsAsync).mockResolvedValueOnce({
    granted: false,
  });
  await expect(storage.request_download_directory()).resolves.toEqual({
    granted: false,
    selected_location: "cancelled",
  });
});

test("writes a JSON-named document through SAF UTF-8 with a fixed content type", async () => {
  jest
    .mocked(saf.createFileAsync)
    .mockResolvedValue("content://document/log.json");
  jest.mocked(saf.writeAsStringAsync).mockResolvedValue(undefined);

  const file_uri = await storage.create_json_file(
    "content://downloads/vittaz",
    "vittaz-diagnostics-2026-11-05T10-11-12-000Z",
  );
  await storage.write_utf8(file_uri, '{"schema_version":1}');

  expect(saf.createFileAsync).toHaveBeenCalledWith(
    "content://downloads/vittaz",
    "vittaz-diagnostics-2026-11-05T10-11-12-000Z.json",
    "application/json",
  );
  expect(saf.writeAsStringAsync).toHaveBeenCalledWith(
    "content://document/log.json",
    '{"schema_version":1}',
    { encoding: "utf8" },
  );
});

test("refuses non-Android targets and non-allowlisted folder or filenames", async () => {
  Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
  await expect(storage.request_download_directory()).resolves.toEqual({
    granted: false,
    selected_location: "other",
  });
  expect(() =>
    storage.create_diagnostics_directory(
      "content://downloads/root",
      "Personal" as never,
    ),
  ).toThrow("Invalid diagnostics directory");
  expect(() =>
    storage.create_json_file(
      "content://downloads/root",
      "vittaz-diagnostics-../../secret",
    ),
  ).toThrow("Invalid diagnostic filename");
});
