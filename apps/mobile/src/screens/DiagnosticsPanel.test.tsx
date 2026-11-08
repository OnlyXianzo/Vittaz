import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { jest } from "@jest/globals";
import { MobileDiagnostics } from "../assistant/diagnostics";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

const fixed_time = new Date("2026-11-05T10:11:12.000Z");

test("diagnostic panel is absent from ordinary builds", async () => {
  await render(<DiagnosticsPanel enabled={false} />);
  expect(screen.queryByText(/Diagnostics — TEST ONLY/)).toBeNull();
});

test("test build shows safe events and explicitly exports to the Downloads folder", async () => {
  const diagnostics = new MobileDiagnostics({
    enabled: true,
    clock: () => new Date(fixed_time),
    console_sink: () => undefined,
  });
  diagnostics.record(
    "provider_profile_read_succeeded",
    "secure_store",
    "completed",
    "kilo",
    "ok",
  );
  diagnostics.record(
    "provider_failure_classified",
    "provider_protocol",
    "failed",
    "kilo",
    "protocol_error",
  );
  const save_log = jest.fn(async () => ({
    relative_path: "Downloads/Vittaz-Diagnostics/vittaz-diagnostics-test.json",
  }));

  await render(
    <DiagnosticsPanel enabled diagnostics={diagnostics} save_log={save_log} />,
  );
  expect(screen.getByText(/TEST ONLY/)).toBeTruthy();
  expect(
    screen.getByText(/prompts, replies, ledger contents, keys, URLs/i),
  ).toBeTruthy();
  expect(screen.getByText(/provider_failure_classified/)).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "Save test log to Downloads" }),
  );
  await waitFor(() =>
    expect(screen.getByText(/Downloads\/Vittaz-Diagnostics/)).toBeTruthy(),
  );
  expect(save_log).toHaveBeenCalledTimes(1);
});
