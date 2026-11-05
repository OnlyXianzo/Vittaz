import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface AndroidEnvDeps {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  exists: (path: string) => boolean;
  run: (command: string, args: string[]) => CommandResult;
  node_version?: string;
}

export interface AdbDevice {
  serial_masked: string;
  state: string;
  model: string | null;
  transport_id: string | null;
}

export interface AndroidEnvReport {
  ok: boolean;
  node: { ok: boolean; version: string };
  java: { ok: boolean; major: number | null };
  android_sdk: { ok: boolean; path: string | null };
  adb: { ok: boolean };
  devices: {
    ready: number;
    unauthorized: number;
    offline: number;
    items: AdbDevice[];
  };
  errors: string[];
}

const known_states = new Set([
  "device",
  "offline",
  "unauthorized",
  "recovery",
  "bootloader",
  "sideload",
]);

export function maskSerial(serial: string): string {
  if (serial.length <= 4) return "****";
  return `${serial.slice(0, 2)}****${serial.slice(-2)}`;
}

export function parseAdbDevices(output: string): AdbDevice[] {
  const devices: AdbDevice[] = [];
  for (const raw_line of output.split(/\r?\n/)) {
    const line = raw_line.trim();
    if (line.length === 0 || line.startsWith("List of devices")) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2 || !known_states.has(parts[1])) continue;
    const fields = new Map<string, string>();
    for (const part of parts.slice(2)) {
      const index = part.indexOf(":");
      if (index > 0) fields.set(part.slice(0, index), part.slice(index + 1));
    }
    devices.push({
      serial_masked: maskSerial(parts[0]),
      state: parts[1],
      model: fields.get("model") ?? null,
      transport_id: fields.get("transport_id") ?? null,
    });
  }
  return devices;
}

function nodeOk(version: string): boolean {
  const match = /^v(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (major !== 24) return false;
  if (minor > 22) return true;
  if (minor < 22) return false;
  return patch >= 2;
}

function javaMajor(stderr: string, stdout: string): number | null {
  const text = `${stderr}\n${stdout}`;
  const match = /version "(\d+)/.exec(text) ?? /openjdk (\d+)/.exec(text);
  return match ? Number(match[1]) : null;
}

export function evaluateAndroidEnv(deps: AndroidEnvDeps): AndroidEnvReport {
  const errors: string[] = [];
  const node_version = deps.node_version ?? process.version;
  const node_ok = nodeOk(node_version);
  if (!node_ok) errors.push("node_unsupported");

  const java_result = deps.run("java", ["-version"]);
  const java_major =
    java_result.status === 0
      ? javaMajor(java_result.stderr, java_result.stdout)
      : null;
  const java_ok = java_major !== null && java_major >= 17;
  if (!java_ok) errors.push("java_missing_or_unsupported");

  const sdk_path = deps.env.ANDROID_HOME ?? deps.env.ANDROID_SDK_ROOT ?? null;
  const sdk_ok =
    sdk_path !== null &&
    sdk_path.length > 0 &&
    deps.exists(join(sdk_path, "platform-tools"));
  if (!sdk_ok) errors.push("android_sdk_missing");

  const adb_version = deps.run("adb", ["version"]);
  const adb_ok = adb_version.status === 0;
  if (!adb_ok) errors.push("adb_missing");

  let items: AdbDevice[] = [];
  if (adb_ok) {
    const adb_devices = deps.run("adb", ["devices", "-l"]);
    if (adb_devices.status === 0) {
      items = parseAdbDevices(adb_devices.stdout);
    } else {
      errors.push("adb_devices_failed");
    }
  }
  const ready = items.filter((device) => device.state === "device").length;
  const unauthorized = items.filter(
    (device) => device.state === "unauthorized",
  ).length;
  const offline = items.filter((device) => device.state === "offline").length;
  if (ready === 0) errors.push("no_ready_device");

  return {
    ok: errors.length === 0,
    node: { ok: node_ok, version: node_version },
    java: { ok: java_ok, major: java_major },
    android_sdk: { ok: sdk_ok, path: sdk_ok ? sdk_path : null },
    adb: { ok: adb_ok },
    devices: { ready, unauthorized, offline, items },
    errors,
  };
}

export function runAndroidEnvCli(): number {
  const report = evaluateAndroidEnv({
    env: process.env,
    platform: process.platform,
    exists: existsSync,
    run: (command, args) => {
      const result = spawnSync(command, args, {
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      });
      return {
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      };
    },
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return report.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runAndroidEnvCli();
}
