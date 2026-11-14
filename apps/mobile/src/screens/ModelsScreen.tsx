import { useCallback, useEffect, useState } from "react";
import { BackHandler, Pressable, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useApp } from "../store";
import {
  DEFAULT_ASSISTANT_PROVIDER_PROFILE,
  read_anthropic_api_key,
  read_assistant_provider_profile,
  read_kilo_key,
  read_openai_compatible_key,
  save_anthropic_api_key,
  save_assistant_provider_profile,
  save_kilo_key,
  save_openai_compatible_key,
} from "../assistant/secure_key";
import type {
  AssistantProviderProfile,
  AssistantProviderSelection,
} from "../assistant/secure_key";
import { ProviderField } from "./ProviderField";
import { ANTHROPIC_DEFAULT_MODEL } from "../assistant/mobile_qa";
import type { AppState } from "../domain";
import {
  B,
  Button,
  Card,
  M,
  PageHeader,
  Radio,
  Row,
  Screen,
  SectionLabel,
} from "../ui";

interface OpenAiFieldErrors {
  base_url?: string;
  model?: string;
  key?: string;
}

/** Inline, field-level validation mirroring the secure-store/provider rules. */
function validate_openai_form(
  base_url: string,
  model: string,
  key_buffer: string,
  has_key: boolean,
): OpenAiFieldErrors {
  const errors: OpenAiFieldErrors = {};
  try {
    const url = new URL(base_url.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
  } catch {
    errors.base_url =
      "Enter an HTTPS base URL with no query, fragment, or embedded credentials.";
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model.trim()))
    errors.model = "Enter a valid model name.";
  if (!has_key && !key_buffer.trim())
    errors.key = "Enter an API key for this endpoint.";
  return errors;
}

const MODEL_FOR_PROVIDER: Record<
  AssistantProviderSelection,
  AppState["model"]
> = {
  kilo: "auto",
  openai_compatible: "openai-compatible",
  anthropic: "claude",
};

export function ModelsScreen() {
  const { dispatch } = useApp();
  const [profile, set_profile] = useState<AssistantProviderProfile>(
    DEFAULT_ASSISTANT_PROVIDER_PROFILE,
  );
  const [base_url, set_base_url] = useState(
    DEFAULT_ASSISTANT_PROVIDER_PROFILE.base_url,
  );
  const [model, set_model] = useState(DEFAULT_ASSISTANT_PROVIDER_PROFILE.model);
  const [kilo_key_value, set_kilo_key_value] = useState("");
  const [openai_key_value, set_openai_key_value] = useState("");
  const [anthropic_key_value, set_anthropic_key_value] = useState("");
  const [has_kilo_key, set_has_kilo_key] = useState(false);
  const [has_openai_key, set_has_openai_key] = useState(false);
  const [has_anthropic_key, set_has_anthropic_key] = useState(false);
  const [saving_kilo, set_saving_kilo] = useState(false);
  const [saving_openai, set_saving_openai] = useState(false);
  const [saving_anthropic, set_saving_anthropic] = useState(false);
  const [openai_errors, set_openai_errors] = useState<OpenAiFieldErrors>({});
  const [anthropic_error, set_anthropic_error] = useState<string | null>(null);

  const selected = profile.selected_provider;
  const [editing, set_editing] = useState(false);
  const saving = saving_kilo || saving_openai || saving_anthropic;
  const editor_title =
    selected === "kilo"
      ? "Kilo setup"
      : selected === "anthropic"
        ? "Anthropic setup"
        : "OpenAI-compatible setup";
  const close_editor = useCallback(() => {
    if (saving) return;
    set_editing(false);
    set_kilo_key_value("");
    set_openai_key_value("");
    set_anthropic_key_value("");
    set_openai_errors({});
    set_anthropic_error(null);
    set_base_url(profile.base_url);
    set_model(profile.model);
  }, [saving, profile]);

  useEffect(() => {
    if (!editing) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        close_editor();
        return true;
      },
    );
    return () => subscription.remove();
  }, [editing, close_editor]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      read_assistant_provider_profile(SecureStore),
      read_kilo_key(SecureStore),
      read_openai_compatible_key(SecureStore),
      read_anthropic_api_key(SecureStore),
    ])
      .then(([saved_profile, kilo_key, openai_key, anthropic_key]) => {
        if (!active) return;
        set_profile(saved_profile);
        set_base_url(saved_profile.base_url);
        set_model(saved_profile.model);
        set_has_kilo_key(kilo_key !== null);
        set_has_openai_key(openai_key !== null);
        set_has_anthropic_key(anthropic_key !== null);
        dispatch({
          type: "select_model",
          model: MODEL_FOR_PROVIDER[saved_profile.selected_provider],
        });
      })
      .catch(() => {
        if (!active) return;
        set_has_kilo_key(false);
        set_has_openai_key(false);
        set_has_anthropic_key(false);
      });
    return () => {
      active = false;
    };
  }, [dispatch]);

  const set_provider = async (next: AssistantProviderSelection) => {
    const next_profile: AssistantProviderProfile = {
      selected_provider: next,
      base_url,
      model,
    };
    set_profile(next_profile);
    set_openai_errors({});
    set_anthropic_error(null);
    dispatch({
      type: "select_model",
      model: MODEL_FOR_PROVIDER[next],
    });
    try {
      await save_assistant_provider_profile(SecureStore, next_profile);
    } catch {
      set_profile(profile);
      dispatch({
        type: "select_model",
        model: MODEL_FOR_PROVIDER[profile.selected_provider],
      });
      dispatch({
        type: "show_toast",
        message:
          "Could not save provider selection. Check the endpoint settings.",
      });
    }
  };

  const save_openai_provider = async () => {
    const errors = validate_openai_form(
      base_url,
      model,
      openai_key_value,
      has_openai_key,
    );
    set_openai_errors(errors);
    if (errors.base_url || errors.model || errors.key) return;
    set_saving_openai(true);
    try {
      const next_profile: AssistantProviderProfile = {
        selected_provider: "openai_compatible",
        base_url,
        model,
      };
      await save_assistant_provider_profile(SecureStore, next_profile);
      if (openai_key_value.trim()) {
        await save_openai_compatible_key(SecureStore, openai_key_value);
        set_has_openai_key(true);
        set_openai_key_value("");
      }
      set_profile(next_profile);
      dispatch({
        type: "show_toast",
        message: "OpenAI-compatible provider saved securely.",
      });
    } catch {
      dispatch({
        type: "show_toast",
        message:
          "Could not save settings. Use an HTTPS endpoint, a valid model name, and a valid key.",
      });
    } finally {
      set_saving_openai(false);
    }
  };

  const remove_openai_key = async () => {
    set_saving_openai(true);
    try {
      await save_openai_compatible_key(SecureStore, "");
      set_has_openai_key(false);
      dispatch({
        type: "show_toast",
        message:
          "OpenAI-compatible key removed. Provider selection was not changed.",
      });
    } catch {
      dispatch({ type: "show_toast", message: "Could not remove that key." });
    } finally {
      set_saving_openai(false);
    }
  };

  const save_anthropic_provider = async () => {
    if (!anthropic_key_value.trim() && !has_anthropic_key) {
      set_anthropic_error("Enter an Anthropic Console API key.");
      return;
    }
    set_anthropic_error(null);
    set_saving_anthropic(true);
    try {
      if (anthropic_key_value.trim()) {
        await save_anthropic_api_key(SecureStore, anthropic_key_value);
        set_has_anthropic_key(true);
        set_anthropic_key_value("");
      }
      dispatch({
        type: "show_toast",
        message: "Anthropic provider saved securely.",
      });
    } catch {
      dispatch({
        type: "show_toast",
        message: "Could not save that key. Check its format and try again.",
      });
    } finally {
      set_saving_anthropic(false);
    }
  };

  const remove_anthropic_key = async () => {
    set_saving_anthropic(true);
    try {
      await save_anthropic_api_key(SecureStore, "");
      set_has_anthropic_key(false);
      dispatch({
        type: "show_toast",
        message:
          "Anthropic API key removed. Provider selection was not changed.",
      });
    } catch {
      dispatch({ type: "show_toast", message: "Could not remove that key." });
    } finally {
      set_saving_anthropic(false);
    }
  };

  const save_kilo_credential = async (value: string) => {
    set_saving_kilo(true);
    try {
      await save_kilo_key(SecureStore, value);
      set_has_kilo_key(value.trim().length > 0);
      set_kilo_key_value("");
      dispatch({
        type: "show_toast",
        message: value.trim()
          ? "Kilo key saved securely."
          : "Kilo key removed. Keyless free access remains available.",
      });
    } catch {
      dispatch({
        type: "show_toast",
        message: "Could not save that key. Check its format and try again.",
      });
    } finally {
      set_saving_kilo(false);
    }
  };

  const provider_card = (
    kind: AssistantProviderSelection,
    label: string,
    description: string,
    status: string,
  ) => {
    const is_selected = selected === kind;
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ checked: is_selected }}
        onPress={() => void set_provider(kind)}
        style={({ pressed }) => [pressed && { opacity: 0.8 }]}
      >
        <Card
          tone={kind === "kilo" ? "soft" : undefined}
          style={{
            marginTop: 12,
            borderColor: is_selected ? "rgba(184,242,60,0.5)" : undefined,
          }}
        >
          <Row start gap={12} style={{ alignItems: "flex-start" }}>
            <Radio on={is_selected} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <B>{label}</B>
              <M style={{ marginTop: 4, lineHeight: 18 }}>{description}</M>
              <M size={12} style={{ marginTop: 6, color: "#9aa0a6" }}>
                {status}
              </M>
            </View>
          </Row>
        </Card>
      </Pressable>
    );
  };

  return (
    <Screen>
      <PageHeader
        title={editing ? editor_title : "Choose model"}
        onBack={editing ? close_editor : () => dispatch({ type: "back" })}
      />
      {!editing ? (
        <>
          <M style={{ marginTop: 8, lineHeight: 19 }}>
            Pick the route used for chat. Only your selection is used; there is
            no automatic fallback.
          </M>
          <SectionLabel>Provider</SectionLabel>
          {provider_card(
            "kilo",
            "Kilo Auto Free",
            "Read-only ledger questions. Works without a key.",
            "Ready · no key needed",
          )}
          {provider_card(
            "openai_compatible",
            "OpenAI-compatible BYOK",
            "Your own key, endpoint, and model. Never falls back to Kilo.",
            has_openai_key ? "Key saved" : "Needs endpoint, model, and key",
          )}
          {provider_card(
            "anthropic",
            "Anthropic API-key BYOK",
            `Direct Anthropic Messages API with ${ANTHROPIC_DEFAULT_MODEL}. Never falls back to Kilo.`,
            has_anthropic_key ? "Key saved" : "Needs API key",
          )}
          <View style={{ gap: 12, marginTop: 24 }}>
            <Button
              label="Configure provider"
              onPress={() => set_editing(true)}
            />
            <Button
              label="Manage providers"
              variant="ghost"
              onPress={() => dispatch({ type: "navigate", screen: "keys" })}
            />
            <M size={12} style={{ lineHeight: 18 }}>
              Add, edit and remove saved profiles in Providers. Configure
              provider updates this route's existing settings.
            </M>
          </View>
        </>
      ) : null}

      {editing && selected === "kilo" ? (
        <>
          <Card style={{ gap: 16, marginTop: 24 }}>
            <M style={{ lineHeight: 18 }}>
              {has_kilo_key
                ? "A key is stored in Android secure storage. The key itself is never shown."
                : "No key is required for Kilo Auto Free. Add your own Kilo Gateway key only if you prefer."}
            </M>
            <ProviderField
              label="Kilo Gateway API key"
              value={kilo_key_value}
              onChangeText={set_kilo_key_value}
              placeholder="Paste your key (optional)"
              secure
              textStyle={{ minHeight: 48 }}
            />
            <Row gap={8} style={{ flexWrap: "wrap" }}>
              <Button
                label={saving_kilo ? "Saving…" : "Save key"}
                disabled={saving_kilo || !kilo_key_value.trim()}
                onPress={() => void save_kilo_credential(kilo_key_value)}
                style={{ flex: 1, minWidth: 112 }}
              />
              {has_kilo_key ? (
                <Button
                  label="Remove key"
                  variant="ghost"
                  disabled={saving_kilo}
                  onPress={() => void save_kilo_credential("")}
                  style={{ flex: 1, minWidth: 112 }}
                />
              ) : null}
            </Row>
          </Card>
        </>
      ) : null}

      {editing && selected === "openai_compatible" ? (
        <>
          <Card style={{ gap: 16, marginTop: 24 }}>
            <M style={{ lineHeight: 18 }}>
              Enter the endpoint, model, and key together, then save once. The
              key is stored in Expo SecureStore and is never shown.
            </M>
            <View>
              <ProviderField
                label="OpenAI-compatible API base URL"
                value={base_url}
                onChangeText={set_base_url}
                placeholder="https://api.example.com/v1"
                textStyle={{ minHeight: 48 }}
              />
              {openai_errors.base_url ? (
                <M size={12} style={{ marginTop: 4, color: "#ff8a80" }}>
                  {openai_errors.base_url}
                </M>
              ) : null}
            </View>
            <View>
              <ProviderField
                label="OpenAI-compatible model"
                value={model}
                onChangeText={set_model}
                placeholder="Model name"
                textStyle={{ minHeight: 48 }}
              />
              {openai_errors.model ? (
                <M size={12} style={{ marginTop: 4, color: "#ff8a80" }}>
                  {openai_errors.model}
                </M>
              ) : null}
            </View>
            <View>
              <ProviderField
                label="OpenAI-compatible API key"
                value={openai_key_value}
                onChangeText={set_openai_key_value}
                placeholder={
                  has_openai_key
                    ? "Key saved — paste to replace"
                    : "Paste your key"
                }
                secure
                textStyle={{ minHeight: 48 }}
              />
              {openai_errors.key ? (
                <M size={12} style={{ marginTop: 4, color: "#ff8a80" }}>
                  {openai_errors.key}
                </M>
              ) : null}
            </View>
            <Row gap={8} style={{ flexWrap: "wrap" }}>
              <Button
                label={saving_openai ? "Saving…" : "Save and use"}
                disabled={saving_openai}
                onPress={() => void save_openai_provider()}
                style={{ flex: 1, minWidth: 112 }}
              />
              {has_openai_key ? (
                <Button
                  label="Remove key"
                  variant="ghost"
                  disabled={saving_openai}
                  onPress={() => void remove_openai_key()}
                  style={{ flex: 1, minWidth: 112 }}
                />
              ) : null}
            </Row>
            <M size={12} style={{ lineHeight: 17 }}>
              Use an HTTPS base URL, optionally ending in /v1. Check the
              service's pricing and data policy before use.
            </M>
          </Card>
        </>
      ) : null}

      {editing && selected === "anthropic" ? (
        <>
          <Card style={{ gap: 16, marginTop: 24 }}>
            <M style={{ lineHeight: 18 }}>
              {has_anthropic_key
                ? "An Anthropic API key is stored in Expo SecureStore and is never shown."
                : "Add your own Anthropic Console API key. No subscription login or bundled key is used."}
            </M>
            <View>
              <ProviderField
                label="Anthropic API key"
                value={anthropic_key_value}
                onChangeText={set_anthropic_key_value}
                placeholder={
                  has_anthropic_key
                    ? "Key saved — paste to replace"
                    : "Paste your API key"
                }
                secure
                textStyle={{ minHeight: 48 }}
              />
              {anthropic_error ? (
                <M size={12} style={{ marginTop: 4, color: "#ff8a80" }}>
                  {anthropic_error}
                </M>
              ) : null}
            </View>
            <Row gap={8} style={{ flexWrap: "wrap" }}>
              <Button
                label={saving_anthropic ? "Saving…" : "Save and use"}
                disabled={saving_anthropic}
                onPress={() => void save_anthropic_provider()}
                style={{ flex: 1, minWidth: 112 }}
              />
              {has_anthropic_key ? (
                <Button
                  label="Remove key"
                  variant="ghost"
                  disabled={saving_anthropic}
                  onPress={() => void remove_anthropic_key()}
                  style={{ flex: 1, minWidth: 112 }}
                />
              ) : null}
            </Row>
          </Card>
        </>
      ) : null}

      {editing ? (
        <Button
          label="Done"
          variant="ghost"
          disabled={saving}
          onPress={close_editor}
          style={{ marginTop: 16 }}
        />
      ) : null}
      <SectionLabel>Privacy</SectionLabel>
      <Card>
        <M style={{ lineHeight: 19 }}>
          Questions and read-only ledger context leave this device for the
          selected provider. Kilo Auto Free may route prompts to providers that
          log them; BYOK services follow their own terms and data policies. Do
          not send real names, account details, personal messages, or other
          confidential information. Use synthetic data only. The assistant has
          read-only tools and cannot create or approve entries.
        </M>
      </Card>
      <M
        size={12}
        style={{ marginVertical: 14, marginHorizontal: 4, lineHeight: 17 }}
      >
        Provider API keys stay in Expo SecureStore. Removing a key does not
        switch providers; select Kilo Auto Free explicitly to use its keyless
        route.
      </M>
    </Screen>
  );
}
