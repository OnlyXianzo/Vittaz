import type { AppState } from "../types";
import { PageHeader, SettingRow, Toggle } from "../components";
import type { DispatchAction } from "../components";

const MODEL_LABEL: Record<AppState["model"], string> = {
  auto: "Auto, Qwen 1.5B on this phone",
  "qwen-1.5b": "Qwen 1.5B on this phone",
  "qwen-3b": "Qwen 3B on this phone",
  claude: "Auto, Claude",
  gemini: "Auto, Gemini",
  free: "Free tier models",
};

export function SettingsScreen({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: DispatchAction;
}) {
  const digest =
    state.settings.reviewDigest === "off"
      ? "Off"
      : state.settings.reviewDigest === "once"
        ? "Once a day"
        : "Twice a day";
  return (
    <div className="s">
      <PageHeader large title="Settings" />
      <div className="sec">AI</div>
      <div className="c" style={{ padding: "2px 16px" }}>
        <SettingRow
          title="Model and keys"
          subtitle={MODEL_LABEL[state.model]}
          right={
            <span className="m" style={{ fontSize: 13 }}>
              Auto
            </span>
          }
          onClick={() => dispatch({ type: "navigate", screen: "models" })}
        />
        <SettingRow
          title="Telegram bot"
          subtitle="Bot token and chat ID"
          right={
            <span className="m" style={{ fontSize: 13 }}>
              Not connected
            </span>
          }
          onClick={() =>
            dispatch({
              type: "show_toast",
              message: "Telegram pairing is not connected in this UI preview.",
            })
          }
        />
      </div>
      <div className="sec">Safety</div>
      <div className="c" style={{ padding: "2px 16px" }}>
        <SettingRow
          title="Ask before saving"
          subtitle="The AI drafts, you approve"
          right={
            <Toggle
              label="Ask before saving"
              checked={state.settings.askBeforeSaving}
              onChange={() =>
                dispatch({ type: "toggle_setting", key: "askBeforeSaving" })
              }
            />
          }
        />
        <SettingRow
          title="Replace names"
          subtitle="Before anything goes to the cloud"
          right={
            <Toggle
              label="Replace names"
              checked={state.settings.replaceNames}
              onChange={() =>
                dispatch({ type: "toggle_setting", key: "replaceNames" })
              }
            />
          }
        />
        <SettingRow
          title="Send notes to cloud"
          subtitle="Off keeps notes on your phone"
          right={
            <Toggle
              label="Send notes to cloud"
              checked={state.settings.sendNotesToCloud}
              onChange={() =>
                dispatch({ type: "toggle_setting", key: "sendNotesToCloud" })
              }
            />
          }
        />
      </div>
      <div className="sec">Review and data</div>
      <div className="c" style={{ padding: "2px 16px" }}>
        <SettingRow
          title="Review digest"
          subtitle="Unverified entries, twice a day"
          right={
            <span className="m" style={{ fontSize: 13 }}>
              {digest}
            </span>
          }
          onClick={() =>
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
          onClick={() =>
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
          right={<span className="u">Sensitive</span>}
          onClick={() =>
            dispatch({
              type: "show_toast",
              message: "Export is not connected in this UI preview.",
            })
          }
        />
      </div>
      <div className="sec">Preview</div>
      <div className="c" style={{ padding: "2px 16px" }}>
        <SettingRow
          title="Replay onboarding"
          subtitle="Welcome, how it works, pick your AI"
          onClick={() => dispatch({ type: "set_onboarding_step", step: 0 })}
        />
      </div>
    </div>
  );
}
