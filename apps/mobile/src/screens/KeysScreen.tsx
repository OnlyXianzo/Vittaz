import { useCallback, useEffect, useState } from "react";
import { Pressable } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { useApp } from "../store";
import {
  add_key_profile,
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
          ...(api_key.trim() ? { api_key } : {}),
        });
      } else {
        await add_key_profile(SecureStore, {
          provider,
          label,
          base_url,
          model,
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
