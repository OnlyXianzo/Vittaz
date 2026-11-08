import { useApp } from "../store";
import { DIAGNOSTICS_BUILD_ENABLED } from "../assistant/diagnostics";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import type { AppState } from "../domain";
import {
  Card,
  M,
  PageHeader,
  Pill,
  Screen,
  SectionLabel,
  SettingRow,
} from "../ui";

const MODEL_LABEL: Record<AppState["model"], string> = {
  auto: "Kilo Auto Free (read-only questions)",
  "openai-compatible": "OpenAI-compatible BYOK (read-only questions)",
  "qwen-1.5b": "Qwen 1.5B on this phone",
  "qwen-3b": "Qwen 3B on this phone",
  claude: "Auto, Claude",
  gemini: "Auto, Gemini",
  free: "Free tier models",
};

export function SettingsScreen() {
  const { state, dispatch } = useApp();
  const model_status =
    state.model === "openai-compatible"
      ? "Your key"
      : state.model === "auto"
        ? "Free / optional key"
        : "Not configured";
  const digest =
    state.settings.reviewDigest === "off"
      ? "Off"
      : state.settings.reviewDigest === "once"
        ? "Once a day"
        : "Twice a day";

  return (
    <Screen>
      <PageHeader large title="Settings" />
      <SectionLabel>AI</SectionLabel>
      <Card style={{ paddingVertical: 2 }}>
        <SettingRow
          first
          title="Model and keys"
          subtitle={MODEL_LABEL[state.model]}
          right={<M>{model_status}</M>}
          onPress={() => dispatch({ type: "navigate", screen: "models" })}
        />
        <SettingRow
          title="Telegram bot"
          subtitle="Bot token and chat ID"
          right={<M>Not connected</M>}
          onPress={() =>
            dispatch({
              type: "show_toast",
              message: "Telegram pairing is not connected in this UI preview.",
            })
          }
        />
      </Card>

      <SectionLabel>Assistant privacy and permissions</SectionLabel>
      <Card>
        <M style={{ lineHeight: 19 }}>
          The selected provider answers read-only ledger questions. It cannot
          draft, save, or approve entries. Questions and read-only ledger
          context may leave this device; Kilo Auto Free can route to providers
          that log prompts, and BYOK services follow their own policies. Do not
          treat name replacement as guaranteed anonymization; use synthetic data
          only.
        </M>
      </Card>

      <SectionLabel>Review and data</SectionLabel>
      <Card style={{ paddingVertical: 2 }}>
        <SettingRow
          first
          title="Review digest"
          subtitle="Unverified entries, twice a day"
          right={<M>{digest}</M>}
          onPress={() =>
            dispatch({
              type: "set_review_digest",
              value:
                state.settings.reviewDigest === "twice"
                  ? "once"
                  : state.settings.reviewDigest === "once"
                    ? "off"
                    : "twice",
            })
          }
        />
        <SettingRow
          title="Backups and restore"
          subtitle="No backup in this preview"
          onPress={() =>
            dispatch({
              type: "show_toast",
              message:
                "Backup and restore are backend features and are not connected here.",
            })
          }
        />
        <SettingRow
          title="Export data and logs"
          subtitle="Logs can include names and amounts"
          right={<Pill tone="amber">Sensitive</Pill>}
          onPress={() =>
            dispatch({
              type: "show_toast",
              message: "Export is not connected in this UI preview.",
            })
          }
        />
      </Card>

      {DIAGNOSTICS_BUILD_ENABLED ? <DiagnosticsPanel enabled /> : null}

      <SectionLabel>Preview</SectionLabel>
      <Card style={{ paddingVertical: 2 }}>
        <SettingRow
          first
          title="Replay onboarding"
          subtitle="Welcome, how it works, pick your AI"
          onPress={() => dispatch({ type: "set_onboarding_step", step: 0 })}
        />
      </Card>
    </Screen>
  );
}
