import { expect, test, vi } from "vitest";

const runCli = vi.hoisted(() => vi.fn(async () => 0));
vi.mock("./cli.js", () => ({ runCli }));

test("cli_main_delegates_argv_to_run_cli", async () => {
  const oldArgv = process.argv;
  const oldCode = process.exitCode;
  process.argv = ["node", "main.js", "--version"];
  await import("./main.js");
  expect(runCli).toHaveBeenCalledWith(["--version"]);
  expect(process.exitCode).toBe(0);
  process.argv = oldArgv;
  process.exitCode = oldCode;
});
