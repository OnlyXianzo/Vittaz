import { useCallback, useEffect, useState } from "react";
import { Pressable } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { useApp } from "../store";
import {
  add_key_profile,
  type AuthHeader,
  activate_key_profile,
  fetch_model_choices,
  read_key_registry,
  read_key_secret,
  remove_key_profile,
  update_key_profile,
} from "../assistant/provider_keys";
import type {
  KeyProfile,
  KeyProvider,
  ModelChoice,
} from "../assistant/provider_keys";
import { PROVIDER_PRESETS } from "../../../../packages/agent/src/providers";
import type { AppState } from "../domain";
import {
  B,
  Button,
  Card,
  Input,
  M,
  PageHeader,
  Pill,
  Row,
  Screen,
  SectionLabel,
} from "../ui";

const MODEL_FOR_PROVIDER: Record<KeyProvider, AppState["model"]> = {
  kilo: "auto",
  openai_compatible: "openai-compatible",
  anthropic: "claude",
};

/** Prefills for known endpoints; everything else is a custom entry. */
const PRESET_CHOICES = [
  { id: "openai", label: "OpenAI" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "groq", label: "Groq" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "together", label: "Together" },
  { id: "xai", label: "xAI" },
  { id: "mistral", label: "Mistral" },
  { id: "gemini", label: "Gemini" },
  { id: "ollama", label: "Ollama (LAN)" },
  { id: "anthropic", label: "Anthropic" },
] as const;

const AUTH_CHOICES = [
  { id: "authorization", label: "Bearer" },
  { id: "x-api-key", label: "x-api-key" },
  { id: "x-goog-api-key", label: "x-goog-api-key" },
  { id: "api-key", label: "api-key" },
] as const;

const PROVIDER_LABEL: Record<KeyProvider, string> = {
  kilo: "Kilo Gateway",
  openai_compatible: "OpenAI-compatible",
  anthropic: "Anthropic",
};

export function KeysScreen() {
  const { dispatch } = useApp();
  const [profiles, set_profiles] = useState<KeyProfile[]>([]);
  const [active_id, set_active_id] = useState<string | null>(null);
  const [hints, set_hints] = useState<Record<string, string>>({});
  const [revealed, set_revealed] = useState<Record<string, string | null>>({});
  const [provider, set_provider] = useState<KeyProvider>("openai_compatible");
  const [label, set_label] = useState("");
  const [api_key, set_api_key] = useState("");
  const [base_url, set_base_url] = useState("https://api.openai.com/v1");
  const [model, set_model] = useState("");
  const [show_form_key, set_show_form_key] = useState(false);
  const [models, set_models] = useState<ModelChoice[]>([]);
  const [busy, set_busy] = useState(false);
  const [editing_id, set_editing_id] = useState<string | null>(null);
  const [api_suffix, set_api_suffix] = useState("/v1");
  const [auth_header, set_auth_header] = useState<AuthHeader>("authorization");
  const [auth_scheme, set_auth_scheme] = useState("Bearer");
  const [show_advanced, set_show_advanced] = useState(false);
  const [preset_id, set_preset_id] = useState<string>("custom");

  /** Advanced fields open automatically when a preset deviates from /v1+Bearer. */
  const setShowAdvancedForPreset = (id: string) => {
    const preset = PROVIDER_PRESETS.find((entry) => entry.id === id);
    const deviates =
      (preset?.api_suffix !== undefined && preset.api_suffix !== "/v1") ||
      (preset?.auth?.header !== undefined &&
        preset.auth.header !== "authorization");
    if (deviates) set_show_advanced(true);
  };

  const refresh = useCallback(async () => {
    const registry = await read_key_registry(SecureStore);
    set_profiles(registry.profiles);
    set_active_id(registry.active_id);
    const next_hints: Record<string, string> = {};
    for (const profile of registry.profiles) {
      const secret = await read_key_secret(SecureStore, profile.id);
      next_hints[profile.id] = secret ? `••••${secret.slice(-4)}` : "No key";
    }
    set_hints(next_hints);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh().catch(() => {
      dispatch({ type: "show_toast", message: "Could not read saved keys." });
    });
  }, [refresh, dispatch]);

  const reset_form = () => {
    set_editing_id(null);
    set_label("");
    set_api_key("");
    set_model("");
    set_models([]);
    set_show_form_key(false);
    set_api_suffix("/v1");
    set_auth_header("authorization");
    set_auth_scheme("Bearer");
    set_show_advanced(false);
    set_preset_id("custom");
  };

  /**
   * Applies a preset: a base URL plus how that server wants its key. This is
   * pure prefill — the user can then edit anything, which is what makes
   * "custom provider" the same code path as a listed one.
   */
  const apply_preset = (id: string) => {
    const preset = PROVIDER_PRESETS.find((entry) => entry.id === id);
    set_preset_id(id);
    if (!preset) return;
    set_provider(
      preset.kind === "anthropic" ? "anthropic" : "openai_compatible",
    );
    if (preset.base_url) set_base_url(preset.base_url);
    set_api_suffix(preset.api_suffix ?? "/v1");
    set_auth_header(preset.auth?.header ?? "authorization");
    set_auth_scheme(preset.auth?.scheme ?? "Bearer");
    if (preset.default_model) set_model(preset.default_model);
    if (!label) setLabel(preset.label);
    setShowAdvancedForPreset(preset.id);
  };

  const save = async () => {
    set_busy(true);
    try {
      if (editing_id) {
        await update_key_profile(SecureStore, editing_id, {
          provider,
          label,
          base_url,
          model,
          api_suffix,
          auth_header,
          auth_scheme,
          ...(api_key.trim() ? { api_key } : {}),
        });
      } else {
        await add_key_profile(SecureStore, {
          provider,
          label,
          base_url,
          model,
          api_suffix,
          auth_header,
          auth_scheme,
          api_key,
          activate: true,
        });
        dispatch({ type: "select_model", model: MODEL_FOR_PROVIDER[provider] });
      }
      dispatch({ type: "show_toast", message: "Key profile saved securely." });
      reset_form();
      await refresh();
    } catch {
      dispatch({
        type: "show_toast",
        message:
          "Could not save that key. Check the label, HTTPS endpoint, model and key.",
      });
    } finally {
      set_busy(false);
    }
  };

  const fetch_models = async () => {
    set_busy(true);
    try {
      const draft: KeyProfile = {
        id: editing_id ?? "draft",
        provider,
        label: label || "Draft",
        base_url,
        model: model || "draft",
        api_suffix,
        auth_header,
        auth_scheme,
      };
      const choices = await fetch_model_choices(
        SecureStore,
        draft,
        undefined,
        api_key.trim() || undefined,
      );
      set_models(choices);
      if (choices.length === 0)
        dispatch({ type: "show_toast", message: "No models were returned." });
    } catch {
      dispatch({
        type: "show_toast",
        message: "Could not fetch models. Check the endpoint and key.",
      });
    } finally {
      set_busy(false);
    }
  };

  const paste_key = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) set_api_key(text);
  };

  const copy_key = async (profile: KeyProfile) => {
    const secret = await read_key_secret(SecureStore, profile.id);
    if (!secret) return;
    await Clipboard.setStringAsync(secret, { android: { isSensitive: true } });
    dispatch({ type: "show_toast", message: "Key copied to clipboard." });
  };

  const toggle_reveal = async (profile: KeyProfile) => {
    if (revealed[profile.id]) {
      set_revealed((current) => ({ ...current, [profile.id]: null }));
      return;
    }
    const secret = await read_key_secret(SecureStore, profile.id);
    set_revealed((current) => ({ ...current, [profile.id]: secret }));
  };

  const edit = (profile: KeyProfile) => {
    set_editing_id(profile.id);
    set_provider(profile.provider);
    set_label(profile.label);
    set_base_url(profile.base_url || "https://api.openai.com/v1");
    set_model(profile.model);
    set_api_key("");
    set_models([]);
    set_api_suffix(profile.api_suffix ?? "/v1");
    set_auth_header(profile.auth_header ?? "authorization");
    set_auth_scheme(profile.auth_scheme ?? "Bearer");
    set_preset_id("custom");
    set_show_advanced(
      (profile.api_suffix !== undefined && profile.api_suffix !== "/v1") ||
        (profile.auth_header !== undefined &&
          profile.auth_header !== "authorization"),
    );
  };

  const use_profile = async (profile: KeyProfile) => {
    try {
      await activate_key_profile(SecureStore, profile.id);
      dispatch({
        type: "select_model",
        model: MODEL_FOR_PROVIDER[profile.provider],
      });
      await refresh();
    } catch {
      dispatch({ type: "show_toast", message: "Could not select that key." });
    }
  };

  const remove = async (profile: KeyProfile) => {
    try {
      await remove_key_profile(SecureStore, profile.id);
      await refresh();
      dispatch({ type: "show_toast", message: "Key profile removed." });
    } catch {
      dispatch({ type: "show_toast", message: "Could not remove that key." });
    }
  };

  return (
    <Screen>
      <PageHeader
        title="Keys and models"
        onBack={() => dispatch({ type: "back" })}
      />
      <M size={12} style={{ marginBottom: 12 }}>
        Keys stay in this device's secure store. Choose one active profile; the
        assistant never falls back to another key silently.
      </M>

      <Card tone="soft">
        <SectionLabel>
          {editing_id ? "Edit key profile" : "Add key profile"}
        </SectionLabel>
        <Row gap={8} style={{ flexWrap: "wrap", marginBottom: 10 }}>
          {(Object.keys(PROVIDER_LABEL) as KeyProvider[]).map((kind) => (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityLabel={PROVIDER_LABEL[kind]}
              onPress={() => set_provider(kind)}
              style={{ opacity: provider === kind ? 1 : 0.55 }}
            >
              <Pill tone={provider === kind ? "lime" : "amber"}>
                {PROVIDER_LABEL[kind]}
              </Pill>
            </Pressable>
          ))}
        </Row>
        <M size={11} style={{ marginBottom: 6 }}>
          Start from a preset, or pick Custom and type any HTTPS endpoint.
        </M>
        <Row gap={8} style={{ flexWrap: "wrap", marginBottom: 10 }}>
          {PRESET_CHOICES.map((choice) => (
            <Pressable
              key={choice.id}
              accessibilityRole="button"
              accessibilityLabel={`Preset ${choice.label}`}
              onPress={() => apply_preset(choice.id)}
              style={{ opacity: preset_id === choice.id ? 1 : 0.55 }}
            >
              <Pill tone={preset_id === choice.id ? "lime" : "amber"}>
                {choice.label}
              </Pill>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Preset Custom"
            onPress={() => {
              set_preset_id("custom");
              set_provider("openai_compatible");
            }}
            style={{ opacity: preset_id === "custom" ? 1 : 0.55 }}
          >
            <Pill tone={preset_id === "custom" ? "lime" : "amber"}>Custom</Pill>
          </Pressable>
        </Row>
        <Input label="Label" value={label} onChangeText={set_label} />
        <Input
          label="API key"
          value={api_key}
          onChangeText={set_api_key}
          secure={!show_form_key}
        />
        <Row gap={8} style={{ marginTop: 8, flexWrap: "wrap" }}>
          <Button
            label={show_form_key ? "Hide key" : "Show key"}
            variant="ghost"
            small
            onPress={() => set_show_form_key((value) => !value)}
          />
          <Button label="Paste key" variant="ghost" small onPress={paste_key} />
        </Row>
        {provider === "openai_compatible" ? (
          <Input
            label="Base URL"
            value={base_url}
            onChangeText={set_base_url}
          />
        ) : null}
        <Input label="Model" value={model} onChangeText={set_model} />
        {provider === "openai_compatible" ? (
          <>
            <Row gap={8} style={{ marginTop: 6, flexWrap: "wrap" }}>
              <Button
                label={show_advanced ? "Hide advanced" : "Advanced"}
                variant="ghost"
                small
                onPress={() => set_show_advanced((value) => !value)}
              />
            </Row>
            {show_advanced ? (
              <>
                <M size={11}>
                  API path is appended to the base URL. Gemini needs
                  /v1beta/openai; servers with no version segment need an empty
                  path.
                </M>
                <Input
                  label="API path (default /v1)"
                  value={api_suffix}
                  onChangeText={set_api_suffix}
                  autoCapitalize="none"
                />
                <M size={11} style={{ marginTop: 6 }}>
                  Where the key is sent. Bearer is the OpenAI convention.
                </M>
                <Row gap={8} style={{ flexWrap: "wrap" }}>
                  {AUTH_CHOICES.map((choice) => (
                    <Pressable
                      key={choice.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Auth header ${choice.label}`}
                      onPress={() => {
                        set_auth_header(choice.id);
                        set_auth_scheme(
                          choice.id === "authorization" ? "Bearer" : "",
                        );
                      }}
                      style={{ opacity: auth_header === choice.id ? 1 : 0.55 }}
                    >
                      <Pill tone={auth_header === choice.id ? "lime" : "amber"}>
                        {choice.label}
                      </Pill>
                    </Pressable>
                  ))}
                </Row>
                <Input
                  label="Auth scheme (empty sends the bare key)"
                  value={auth_scheme}
                  onChangeText={set_auth_scheme}
                  autoCapitalize="none"
                />
              </>
            ) : null}
          </>
        ) : null}
        <Row gap={8} style={{ marginTop: 8, flexWrap: "wrap" }}>
          <Button
            label="Fetch models"
            variant="ghost"
            small
            disabled={busy}
            onPress={fetch_models}
          />
          <Button
            label={editing_id ? "Save changes" : "Save and use"}
            small
            disabled={busy}
            onPress={save}
          />
          {editing_id ? (
            <Button label="Cancel" variant="ghost" small onPress={reset_form} />
          ) : null}
        </Row>
        {models.length > 0 ? (
          <Row gap={8} style={{ marginTop: 10, flexWrap: "wrap" }}>
            {models.map((choice) => (
              <Pressable
                key={choice.id}
                accessibilityRole="button"
                accessibilityLabel={choice.label}
                onPress={() => set_model(choice.id)}
                style={{ opacity: model === choice.id ? 1 : 0.55 }}
              >
                <Pill tone={model === choice.id ? "lime" : "amber"}>
                  {choice.label}
                </Pill>
              </Pressable>
            ))}
          </Row>
        ) : null}
      </Card>

      <SectionLabel>Saved keys</SectionLabel>
      {profiles.length === 0 ? (
        <M>No key profiles saved yet.</M>
      ) : (
        profiles.map((profile) => (
          <Card key={profile.id} tone="soft">
            <Row>
              <B>{profile.label}</B>
              {active_id === profile.id ? <Pill>Active</Pill> : null}
            </Row>
            <M size={12}>
              {PROVIDER_LABEL[profile.provider]} · {profile.model || "default"}
              {profile.base_url ? ` · ${profile.base_url}` : ""}
              {profile.api_suffix !== undefined && profile.api_suffix !== "/v1"
                ? ` · path ${profile.api_suffix || "(none)"}`
                : ""}
              {profile.auth_header !== undefined &&
              profile.auth_header !== "authorization"
                ? ` · ${profile.auth_header}`
                : ""}
            </M>
            <M size={12} style={{ marginTop: 4 }}>
              {revealed[profile.id] ?? hints[profile.id] ?? "No key"}
            </M>
            <Row gap={8} style={{ marginTop: 10, flexWrap: "wrap" }}>
              <Button
                label="Use"
                small
                disabled={active_id === profile.id}
                onPress={() => void use_profile(profile)}
              />
              <Button
                label={revealed[profile.id] ? "Hide" : "Show"}
                variant="ghost"
                small
                accessibilityLabel={`${revealed[profile.id] ? "Hide" : "Show"} key for ${profile.label}`}
                onPress={() => void toggle_reveal(profile)}
              />
              <Button
                label="Copy"
                variant="ghost"
                small
                accessibilityLabel={`Copy key for ${profile.label}`}
                onPress={() => void copy_key(profile)}
              />
              <Button
                label="Edit"
                variant="ghost"
                small
                accessibilityLabel={`Edit key for ${profile.label}`}
                onPress={() => edit(profile)}
              />
              <Button
                label="Remove"
                variant="ghost"
                small
                accessibilityLabel={`Remove key for ${profile.label}`}
                onPress={() => void remove(profile)}
              />
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}
