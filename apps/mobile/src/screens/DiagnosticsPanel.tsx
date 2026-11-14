import { useEffect, useState } from "react";
import { View } from "react-native";
import { mobile_diagnostics } from "../assistant/diagnostics";
import type { MobileDiagnostics } from "../assistant/diagnostics";
import { DiagnosticExportError } from "../assistant/diagnostic_export";
import { export_mobile_diagnostic_log } from "../assistant/expo_diagnostic_storage";
import { Button, Card, M, SectionLabel, T } from "../ui";

export function DiagnosticsPanel({
  enabled,
  diagnostics = mobile_diagnostics,
  save_log = export_mobile_diagnostic_log,
}: {
  enabled: boolean;
  diagnostics?: MobileDiagnostics;
  save_log?: () => Promise<{ relative_path: string }>;
}) {
  const [entries, set_entries] = useState(() => diagnostics.snapshot());
  const [busy, set_busy] = useState(false);
  const [status, set_status] = useState("");

  useEffect(
    () => diagnostics.subscribe(() => set_entries(diagnostics.snapshot())),
    [diagnostics],
  );

  if (!enabled) return null;

  const save = async () => {
    set_busy(true);
    set_status("");
    try {
      const result = await save_log();
      set_status(`Saved: ${result.relative_path}`);
    } catch (error) {
      set_status(
        error instanceof DiagnosticExportError &&
          error.code === "export_permission_denied"
          ? "Save canceled or denied. Choose Downloads or any folder."
          : "Could not save the test log. Check available storage and try again.",
      );
    } finally {
      set_busy(false);
    }
  };

  const clear = () => {
    diagnostics.clear();
    diagnostics.record(
      "diagnostics_cleared",
      "log_export",
      "completed",
      undefined,
      "ok",
    );
    set_status("In-memory test log cleared.");
  };

  return (
    <View>
      <SectionLabel>Diagnostics — TEST ONLY</SectionLabel>
      <Card>
        <T size={14} weight="bold" color="#f5a524">
          TEST BUILD ONLY — NOT FOR PERSONAL USE
        </T>
        <M style={{ marginTop: 7, lineHeight: 18 }}>
          Use synthetic data only. Provider requests may leave this device. Logs
          include high-detail stages and fixed failure reasons, but never
          prompts, replies, ledger contents, keys, URLs, response bodies, or
          exception text.
        </M>
        <Button
          label={busy ? "Saving test log…" : "Save test log to Downloads"}
          onPress={() => void save()}
          disabled={busy}
          style={{ marginTop: 12 }}
        />
        <Button
          label="Clear in-memory test log"
          variant="ghost"
          small
          onPress={clear}
          style={{ marginTop: 8 }}
        />
        {status ? <M style={{ marginTop: 8 }}>{status}</M> : null}
        <M style={{ marginTop: 12, lineHeight: 18 }}>
          Select the Downloads folder or any folder you prefer when Android
          asks. Saved under Vittaz. The exported JSON stays on this device until
          you share or delete it.
        </M>
      </Card>
      <SectionLabel>Recent diagnostic events ({entries.length})</SectionLabel>
      <Card>
        {entries.length === 0 ? (
          <M>No diagnostic events captured yet.</M>
        ) : (
          entries
            .slice(-40)
            .reverse()
            .map((entry) => (
              <T
                key={entry.sequence}
                size={10}
                style={{
                  fontFamily: "monospace",
                  lineHeight: 16,
                  marginBottom: 6,
                }}
              >
                {JSON.stringify(entry)}
              </T>
            ))
        )}
      </Card>
    </View>
  );
}
