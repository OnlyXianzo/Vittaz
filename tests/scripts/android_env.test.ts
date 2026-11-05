import { describe, expect, test } from "vitest";
import {
  evaluateAndroidEnv,
  maskSerial,
  parseAdbDevices,
} from "../../scripts/android_env.js";

const ready_output = `List of devices attached
SYNTH001 device product:synthetic model:Synthetic_Phone device:synthetic transport_id:1
SYNTH002 unauthorized transport_id:2
SYNTH003 offline transport_id:3
`;

describe("android_env_s33", () => {
  test("android_env_parse_adb_devices_masks_serials_and_counts_states", () => {
    const devices = parseAdbDevices(ready_output);
    expect(devices).toEqual([
      {
        serial_masked: maskSerial("SYNTH001"),
        state: "device",
        model: "Synthetic_Phone",
        transport_id: "1",
      },
      {
        serial_masked: maskSerial("SYNTH002"),
        state: "unauthorized",
        model: null,
        transport_id: "2",
      },
      {
        serial_masked: maskSerial("SYNTH003"),
        state: "offline",
        model: null,
        transport_id: "3",
      },
    ]);
    expect(JSON.stringify(devices)).not.toContain("SYNTH001");
  });

  test("android_env_parse_empty_or_malformed_output_is_safe", () => {
    expect(parseAdbDevices("List of devices attached\n\n")).toEqual([]);
    expect(parseAdbDevices("garbage without tab")).toEqual([]);
    expect(parseAdbDevices("")).toEqual([]);
  });

  test("android_env_mask_serial_never_returns_full_serial", () => {
    expect(maskSerial("AB")).toBe("****");
    expect(maskSerial("ABCDEFGHIJ")).not.toBe("ABCDEFGHIJ");
    expect(maskSerial("ABCDEFGHIJ")).toContain("****");
  });

  const baseDeps = {
    env: { ANDROID_HOME: "/sdk" } as Record<string, string | undefined>,
    platform: "linux" as NodeJS.Platform,
    exists: (path: string) => path === "/sdk/platform-tools",
    run: (command: string, args: string[]) => {
      if (command === "java")
        return {
          status: 0,
          stdout: "",
          stderr: 'openjdk version "17.0.12" 2024-07-16',
        };
      if (command === "adb" && args[0] === "version")
        return {
          status: 0,
          stdout: "Android Debug Bridge version 1.0.41",
          stderr: "",
        };
      if (command === "adb" && args[0] === "devices")
        return { status: 0, stdout: ready_output, stderr: "" };
      return { status: 1, stdout: "", stderr: "" };
    },
  };

  test("android_env_ready_when_jdk17_sdk_adb_and_one_device", () => {
    const report = evaluateAndroidEnv(baseDeps);
    expect(report.ok).toBe(true);
    expect(report.node.ok).toBe(true);
    expect(report.java.ok).toBe(true);
    expect(report.android_sdk.ok).toBe(true);
    expect(report.adb.ok).toBe(true);
    expect(report.devices.ready).toBe(1);
    expect(report.devices.unauthorized).toBe(1);
    expect(report.devices.offline).toBe(1);
    expect(report.errors).toEqual([]);
  });

  test("android_env_reports_static_errors_without_raw_stderr", () => {
    const report = evaluateAndroidEnv({
      ...baseDeps,
      env: {},
      exists: () => false,
      run: () => ({ status: 1, stdout: "", stderr: "secret raw failure" }),
    });
    expect(report.ok).toBe(false);
    expect(report.errors).toContain("android_sdk_missing");
    expect(report.errors).toContain("java_missing_or_unsupported");
    expect(report.errors).toContain("adb_missing");
    expect(report.errors).toContain("no_ready_device");
    expect(JSON.stringify(report)).not.toContain("secret raw failure");
  });

  test("android_env_unauthorized_device_is_not_ready", () => {
    const report = evaluateAndroidEnv({
      ...baseDeps,
      run: (command: string, args: string[]) => {
        if (command === "java")
          return {
            status: 0,
            stdout: "",
            stderr: 'openjdk version "17.0.12"',
          };
        if (command === "adb" && args[0] === "version")
          return {
            status: 0,
            stdout: "Android Debug Bridge version",
            stderr: "",
          };
        if (command === "adb" && args[0] === "devices")
          return {
            status: 0,
            stdout: "List of devices attached\nSYNTH002 unauthorized\n",
            stderr: "",
          };
        return { status: 1, stdout: "", stderr: "" };
      },
    });
    expect(report.ok).toBe(false);
    expect(report.devices.ready).toBe(0);
    expect(report.errors).toContain("no_ready_device");
  });
});
