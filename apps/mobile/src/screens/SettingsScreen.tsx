import { useApp } from "../store";
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
  "qwen-1.5b": "Qwen 1.5B on this phone",
  "qwen-3b": "Qwen 3B on this phone",
  claude: "Auto, Claude",
  gemini: "Auto, Gemini",
  free: "Free tier models",
};

export function SettingsScreen() {
  const { state, dispatch } = useApp();
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
          right={<M>Free</M>}
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
          Kilo Auto Free currently answers read-only ledger questions. It cannot
          draft, save, or approve entries. Ledger notes and notifications are
          not included in read-only tool results, but anything you type in a
          question may be sent to Kilo. Name replacement is not guaranteed
          anonymization; use synthetic data only.
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
