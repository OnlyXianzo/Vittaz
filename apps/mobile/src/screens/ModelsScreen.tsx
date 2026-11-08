import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useApp } from "../store";
import {
  DEFAULT_ASSISTANT_PROVIDER_PROFILE,
  read_assistant_provider_profile,
  read_kilo_key,
  read_openai_compatible_key,
  save_assistant_provider_profile,
  save_kilo_key,
  save_openai_compatible_key,
} from "../assistant/secure_key";
import type {
  AssistantProviderProfile,
  AssistantProviderSelection,
} from "../assistant/secure_key";
import {
  B,
  Button,
  Card,
  Input,
  M,
  PageHeader,
  Pill,
  Radio,
  Row,
  Screen,
  SectionLabel,
} from "../ui";

export function ModelsScreen() {
  const { state, dispatch } = useApp();
  const [profile, set_profile] = useState<AssistantProviderProfile>(
    DEFAULT_ASSISTANT_PROVIDER_PROFILE,
  );
  const [base_url, set_base_url] = useState(
    DEFAULT_ASSISTANT_PROVIDER_PROFILE.base_url,
  );
  const [model, set_model] = useState(DEFAULT_ASSISTANT_PROVIDER_PROFILE.model);
  const [kilo_key_value, set_kilo_key_value] = useState("");
  const [openai_key_value, set_openai_key_value] = useState("");
  const [has_kilo_key, set_has_kilo_key] = useState(false);
  const [has_openai_key, set_has_openai_key] = useState(false);
  const [saving_kilo, set_saving_kilo] = useState(false);
  const [saving_openai, set_saving_openai] = useState(false);
  const [saving_profile, set_saving_profile] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      read_assistant_provider_profile(SecureStore),
      read_kilo_key(SecureStore),
      read_openai_compatible_key(SecureStore),
    ])
      .then(([saved_profile, kilo_key, openai_key]) => {
        if (!active) return;
        set_profile(saved_profile);
        set_base_url(saved_profile.base_url);
        set_model(saved_profile.model);
        set_has_kilo_key(kilo_key !== null);
        set_has_openai_key(openai_key !== null);
        dispatch({
          type: "select_model",
          model:
            saved_profile.selected_provider === "openai_compatible"
              ? "openai-compatible"
              : "auto",
        });
      })
      .catch(() => {
        if (!active) return;
        set_has_kilo_key(false);
        set_has_openai_key(false);
      });
    return () => {
      active = false;
    };
  }, [dispatch]);

  const set_provider = async (
    selected_provider: AssistantProviderSelection,
  ) => {
    const next_profile: AssistantProviderProfile = {
      selected_provider,
      base_url,
      model,
    };
    set_profile(next_profile);
    dispatch({
      type: "select_model",
      model:
        selected_provider === "openai_compatible"
          ? "openai-compatible"
          : "auto",
    });
    try {
      await save_assistant_provider_profile(SecureStore, next_profile);
      dispatch({
        type: "show_toast",
        message:
          selected_provider === "openai_compatible"
            ? "OpenAI-compatible provider selected."
            : "Kilo Auto Free selected.",
      });
    } catch {
      set_profile(profile);
      dispatch({
        type: "select_model",
        model:
          profile.selected_provider === "openai_compatible"
            ? "openai-compatible"
            : "auto",
      });
      dispatch({
        type: "show_toast",
        message:
          "Could not save provider selection. Check the endpoint settings.",
      });
    }
  };

  const save_provider_settings = async () => {
    set_saving_profile(true);
    const next_profile: AssistantProviderProfile = {
      selected_provider: profile.selected_provider,
      base_url,
      model,
    };
    try {
      await save_assistant_provider_profile(SecureStore, next_profile);
      set_profile(next_profile);
      dispatch({
        type: "show_toast",
        message: "Provider settings saved securely.",
      });
    } catch {
      dispatch({
        type: "show_toast",
        message:
          "Could not save settings. Use an HTTPS endpoint and a valid model name.",
      });
    } finally {
      set_saving_profile(false);
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

  const save_openai_credential = async (value: string) => {
    set_saving_openai(true);
    try {
      await save_openai_compatible_key(SecureStore, value);
      set_has_openai_key(value.trim().length > 0);
      set_openai_key_value("");
      dispatch({
        type: "show_toast",
        message: value.trim()
          ? "OpenAI-compatible key saved securely."
          : "OpenAI-compatible key removed. Provider selection was not changed.",
      });
    } catch {
      dispatch({
        type: "show_toast",
        message: "Could not save that key. Check its format and try again.",
      });
    } finally {
      set_saving_openai(false);
    }
  };

  return (
    <Screen>
      <PageHeader
        title="Choose model"
        onBack={() => dispatch({ type: "back" })}
      />
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel="Kilo Auto Free"
        accessibilityState={{ checked: state.model === "auto" }}
        onPress={() => void set_provider("kilo")}
        style={({ pressed }) => [pressed && { opacity: 0.8 }]}
      >
        <Card
          tone="soft"
          style={{ marginTop: 14, borderColor: "rgba(184,242,60,0.5)" }}
        >
          <Row start gap={12} style={{ alignItems: "flex-start" }}>
            <Radio on={state.model === "auto"} />
            <View style={{ flex: 1 }}>
              <B>Kilo Auto Free</B>
              <M style={{ marginTop: 4, lineHeight: 18 }}>
                Read-only ledger questions. Works without a key; adding ledger
                entries remains a separate, on-device action.
              </M>
            </View>
            {state.model === "auto" ? <Pill>Selected</Pill> : null}
          </Row>
        </Card>
      </Pressable>

      <SectionLabel>Kilo Gateway key (optional)</SectionLabel>
      <Card style={{ gap: 12 }}>
        <M style={{ lineHeight: 18 }}>
          {has_kilo_key
            ? "A key is stored in Android secure storage. The key itself is never shown."
            : "No key is required for Kilo Auto Free. Add your own Kilo Gateway key if you prefer."}
        </M>
        <Input
          label="Kilo Gateway API key"
          value={kilo_key_value}
          onChangeText={set_kilo_key_value}
          placeholder="Paste your key"
          secure
          textStyle={{ minHeight: 48 }}
        />
        <Row gap={8}>
          <Button
            label={saving_kilo ? "Saving…" : "Save key"}
            disabled={saving_kilo || !kilo_key_value.trim()}
            onPress={() => void save_kilo_credential(kilo_key_value)}
            style={{ flex: 1 }}
          />
          {has_kilo_key ? (
            <Button
              label="Remove key"
              variant="ghost"
              disabled={saving_kilo}
              onPress={() => void save_kilo_credential("")}
              style={{ flex: 1 }}
            />
          ) : null}
        </Row>
      </Card>

      <Pressable
        accessibilityRole="radio"
        accessibilityLabel="OpenAI-compatible BYOK"
        accessibilityState={{ checked: state.model === "openai-compatible" }}
        onPress={() => void set_provider("openai_compatible")}
        style={({ pressed }) => [pressed && { opacity: 0.8 }]}
      >
        <Card
          style={{
            marginTop: 16,
            borderColor:
              state.model === "openai-compatible"
                ? "rgba(184,242,60,0.5)"
                : undefined,
          }}
        >
          <Row start gap={12} style={{ alignItems: "flex-start" }}>
            <Radio on={state.model === "openai-compatible"} />
            <View style={{ flex: 1 }}>
              <B>OpenAI-compatible BYOK</B>
              <M style={{ marginTop: 4, lineHeight: 18 }}>
                Use your own API key with a compatible endpoint and model. This
                route is selected explicitly and never falls back to Kilo.
              </M>
            </View>
            {state.model === "openai-compatible" ? <Pill>Selected</Pill> : null}
          </Row>
        </Card>
      </Pressable>

      <SectionLabel>OpenAI-compatible endpoint</SectionLabel>
      <Card style={{ gap: 12 }}>
        <Input
          label="OpenAI-compatible API base URL"
          value={base_url}
          onChangeText={set_base_url}
          placeholder="https://api.example.com/v1"
          textStyle={{ minHeight: 48 }}
        />
        <Input
          label="OpenAI-compatible model"
          value={model}
          onChangeText={set_model}
          placeholder="Model name"
          textStyle={{ minHeight: 48 }}
        />
        <Button
          label={saving_profile ? "Saving…" : "Save provider settings"}
          disabled={saving_profile}
          onPress={() => void save_provider_settings()}
        />
        <M style={{ lineHeight: 18 }}>
          Use an HTTPS base URL, optionally ending in /v1. The model name is
          sent to the selected service. Check its pricing and data policy before
          use.
        </M>
      </Card>

      <SectionLabel>OpenAI-compatible API key</SectionLabel>
      <Card style={{ gap: 12 }}>
        <M style={{ lineHeight: 18 }}>
          {has_openai_key
            ? "A key is stored in Expo SecureStore and is never shown."
            : "Add your own key for the selected endpoint. No key is bundled or requested by Vittaz."}
        </M>
        <Input
          label="OpenAI-compatible API key"
          value={openai_key_value}
          onChangeText={set_openai_key_value}
          placeholder="Paste your key"
          secure
          textStyle={{ minHeight: 48 }}
        />
        <Row gap={8}>
          <Button
            label={saving_openai ? "Saving…" : "Save OpenAI-compatible key"}
            disabled={saving_openai || !openai_key_value.trim()}
            onPress={() => void save_openai_credential(openai_key_value)}
            style={{ flex: 1 }}
          />
          {has_openai_key ? (
            <Button
              label="Remove OpenAI-compatible key"
              variant="ghost"
              disabled={saving_openai}
              onPress={() => void save_openai_credential("")}
              style={{ flex: 1 }}
            />
          ) : null}
        </Row>
      </Card>

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
