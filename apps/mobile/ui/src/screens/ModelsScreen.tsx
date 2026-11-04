import { Plus } from "lucide-react";
import type { AppState, ModelId } from "../types";
import { PageHeader } from "../components";
import type { DispatchAction } from "../components";

function Radio({ on }: { on: boolean }) {
  return <span className={`rd ${on ? "on" : ""}`} aria-hidden="true" />;
}

export function ModelsScreen({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: DispatchAction;
}) {
  const select = (model: ModelId) => dispatch({ type: "select_model", model });
  return (
    <div className="s">
      <PageHeader
        title="Choose model"
        onBack={() => dispatch({ type: "back" })}
      />
      <button
        className="c model-auto"
        onClick={() => select("auto")}
        type="button"
      >
        <div className="mr" style={{ padding: 0 }}>
          <Radio on={state.model === "auto"} />
          <div style={{ flex: 1, textAlign: "left" }}>
            <div className="b">Auto</div>
            <div className="m" style={{ marginTop: 4, lineHeight: 1.4 }}>
              Adding entries runs on your phone. Hard questions go to your cloud
              key with names replaced and notes left out.
            </div>
          </div>
        </div>
      </button>
      <div className="sec">On this phone</div>
      <div className="c" style={{ padding: "4px 16px" }}>
        <button
          className="mr setting-button"
          onClick={() => select("qwen-1.5b")}
          type="button"
        >
          <Radio on={state.model === "qwen-1.5b"} />
          <div style={{ flex: 1, textAlign: "left" }}>
            <div className="b" style={{ fontSize: 15 }}>
              Qwen 1.5B
            </div>
            <div className="m" style={{ fontSize: 12, marginTop: 2 }}>
              Downloaded, 1.1 GB, about 8 tokens a second
            </div>
          </div>
          <span className="p">Stays on phone</span>
        </button>
        <div className="mr">
          <Radio on={state.model === "qwen-3b"} />
          <div style={{ flex: 1 }}>
            <div className="b" style={{ fontSize: 15 }}>
              Qwen 3B
            </div>
            <div className="m" style={{ fontSize: 12, marginTop: 2 }}>
              2 GB, slower, better at questions
            </div>
          </div>
          <button
            className="ghost"
            style={{ height: 44, padding: "0 14px", fontSize: 13 }}
            onClick={() =>
              dispatch({
                type: "show_toast",
                message:
                  "Model downloads are not connected in this UI preview.",
              })
            }
            type="button"
          >
            Download
          </button>
        </div>
      </div>
      <div className="sec">Cloud, your keys</div>
      <div className="c" style={{ padding: "4px 16px" }}>
        <button
          className="mr setting-button"
          onClick={() => select("claude")}
          type="button"
        >
          <Radio on={state.model === "claude"} />
          <div style={{ flex: 1, textAlign: "left" }}>
            <div className="b" style={{ fontSize: 15 }}>
              Claude
            </div>
            <div className="m" style={{ fontSize: 12, marginTop: 2 }}>
              Preview only
            </div>
          </div>
        </button>
        <button
          className="mr setting-button"
          onClick={() => select("gemini")}
          type="button"
        >
          <Radio on={state.model === "gemini"} />
          <div style={{ flex: 1, textAlign: "left" }}>
            <div className="b" style={{ fontSize: 15 }}>
              Gemini
            </div>
            <div className="m" style={{ fontSize: 12, marginTop: 2 }}>
              Preview only
            </div>
          </div>
        </button>
        <button
          className="mr setting-button"
          onClick={() => select("free")}
          type="button"
        >
          <Radio on={state.model === "free"} />
          <div style={{ flex: 1, textAlign: "left" }}>
            <div className="b" style={{ fontSize: 15 }}>
              Free tier models
            </div>
            <div className="m" style={{ fontSize: 12, marginTop: 2 }}>
              May train on your data
            </div>
          </div>
          <span className="u">Not private</span>
        </button>
        <button
          className="mr setting-button"
          onClick={() =>
            dispatch({
              type: "show_toast",
              message: "Key storage is not connected in this UI preview.",
            })
          }
          type="button"
        >
          <span
            className="k"
            style={{ width: 22, height: 22, borderRadius: "50%", fontSize: 16 }}
          >
            <Plus size={14} />
          </span>
          <div className="b" style={{ fontSize: 15 }}>
            Add API key
          </div>
        </button>
      </div>
      <div
        className="m"
        style={{ margin: "14px 4px", fontSize: 12, lineHeight: 1.4 }}
      >
        Preview only. No keys are stored and no cloud model is called.
      </div>
    </div>
  );
}
