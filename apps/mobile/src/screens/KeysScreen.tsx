import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import {
  Check,
  ChevronRight,
  KeyRound,
  MoreHorizontal,
  Plus,
  Search,
  X,
} from "lucide-react-native";
import { ProviderField } from "./ProviderField";
import { colors } from "../theme";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { useApp } from "../store";
import {
  add_key_profile,
  type AuthHeader,
  activate_key_profile,
  fetch_model_choices,
  mobile_supports_preset,
  KeyRegistryUnreadableError,
  read_connection_check,
  read_key_registry,
  read_key_secret_state,
  reset_key_registry,
  test_connection,
  type ConnectionCheck,
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
  IconBtn,
  T,
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
// Only presets this app can actually save are offered: the key flow requires a
// credential and an https endpoint, so a keyless local server is not listed
// here even though the registry defines it for the CLI.
const PRESET_CHOICES = [
  { id: "openai", label: "OpenAI" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "groq", label: "Groq" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "together", label: "Together" },
  { id: "xai", label: "xAI" },
  { id: "mistral", label: "Mistral" },
  { id: "gemini", label: "Gemini" },
  { id: "anthropic", label: "Anthropic" },
]
  .filter((choice) => {
    const preset = PROVIDER_PRESETS.find((entry) => entry.id === choice.id);
    return preset === undefined || mobile_supports_preset(preset);
  })
  .map((choice) => choice as { id: string; label: string });

/**
 * What the last connection check found.
 *
 * "Accepted" rather than "verified": a 200 from the model list proves the key
 * is accepted for discovery, not that chat will work. Claiming more would be a
 * promise this check cannot keep.
 */
function check_label(check: ConnectionCheck | undefined): string {
  switch (check?.state) {
    case "reachable":
      return `Endpoint reachable · key accepted · ${check.models} models`;
    case "rejected":
      return "Last check: the endpoint rejected this key";
    case "not_found":
      return "Last check: path not found (404) · check URL";
    case "unreachable":
      return "Last check: could not reach the endpoint";
    default:
      return "Endpoint not checked yet";
  }
}

const PINNED_HOSTS = new Set([
  "api.openai.com",
  "api.anthropic.com",
  "ai-gateway.kilo.ai",
]);

function is_pinned_endpoint(url: string | undefined): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      !parsed.port &&
      !parsed.username &&
      !parsed.password &&
      PINNED_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

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
  const [view, set_view] = useState<"list" | "choose" | "edit">("list");
  const [action_id, set_action_id] = useState<string | null>(null);
  const [errors, set_errors] = useState<Record<string, string>>({});
  const [model_query, set_model_query] = useState("");
  const operation = useRef(false);
  const [profiles, set_profiles] = useState<KeyProfile[]>([]);
  const [active_id, set_active_id] = useState<string | null>(null);
  const [hints, set_hints] = useState<Record<string, string>>({});
  const [revealed, set_revealed] = useState<Record<string, string | null>>({});
  const reveal_version = useRef(0);
  const clear_revealed = () => {
    reveal_version.current += 1;
    set_revealed({});
  };
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
  /**
   * The stored profile list exists but cannot be read. Distinct from "no
   * profiles", which is what an empty array means everywhere else.
   */
  const [registry_unreadable, set_registry_unreadable] = useState(false);
  /**
   * The list came back from the non-secret mirror because the keystore would
   * not open. Every row is real, every key is unusable until re-entered.
   */
  const [registry_from_manifest, set_registry_from_manifest] = useState(false);
  /** Last connection check per profile, for this session. */
  const [checks, set_checks] = useState<Record<string, ConnectionCheck>>({});

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
    let registry;
    try {
      registry = await read_key_registry(SecureStore);
    } catch (error) {
      // The list could not be read. Say so and keep the screen usable; never
      // render it as "no keys saved", which looks like the app forgot them.
      if (error instanceof KeyRegistryUnreadableError) {
        // Neither the keystore nor the mirror had anything: this really is
        // indistinguishable from a fresh install, so say that.
        set_registry_unreadable(true);
        set_registry_from_manifest(false);
        set_profiles([]);
        set_active_id(null);
        set_hints({});
        set_checks({});
        return;
      }
      throw error;
    }
    set_registry_unreadable(false);
    set_registry_from_manifest(registry.source === "manifest");
    set_profiles(registry.profiles);
    set_active_id(registry.active_id);
    const next_hints: Record<string, string> = {};
    for (const profile of registry.profiles) {
      const read = await read_key_secret_state(SecureStore, profile.id);
      // "No key" and "key that cannot be read" are different problems.
      next_hints[profile.id] =
        read.state === "ok"
          ? `••••${read.value.slice(-4)}`
          : read.state === "unreadable"
            ? "Key unreadable — re-enter"
            : "No key";
    }
    set_hints(next_hints);
    const next_checks: Record<string, ConnectionCheck> = {};
    for (const profile of registry.profiles)
      next_checks[profile.id] = await read_connection_check(profile.id);
    set_checks(next_checks);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh().catch(() => {
      dispatch({ type: "show_toast", message: "Could not read saved keys." });
    });
  }, [refresh, dispatch]);

  const reset_form = useCallback(() => {
    set_errors({});
    set_model_query("");
    set_view("list");
    set_provider("openai_compatible");
    set_base_url("https://api.openai.com/v1");
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
  }, []);

  /**
   * Applies a preset: a base URL plus how that server wants its key. This is
   * pure prefill — the user can then edit anything, which is what makes
   * "custom provider" the same code path as a listed one.
   */
  const apply_preset = (id: string) => {
    const preset = PROVIDER_PRESETS.find((entry) => entry.id === id);
    set_models([]);
    set_model_query("");
    set_errors({});
    set_show_advanced(false);
    set_model(preset?.default_model ?? "");
    if (!preset) {
      set_provider("openai_compatible");
      set_view("edit");
      return;
    }
    set_provider(
      preset.kind === "anthropic" ? "anthropic" : "openai_compatible",
    );
    if (preset.base_url) set_base_url(preset.base_url);
    set_api_suffix(preset.api_suffix ?? "/v1");
    set_auth_header(preset.auth?.header ?? "authorization");
    set_auth_scheme(preset.auth?.scheme ?? "Bearer");
    if (preset.default_model) set_model(preset.default_model);
    if (!label) set_label(preset.label);
    setShowAdvancedForPreset(preset.id);
    set_view("edit");
  };

  const save = async () => {
    if (operation.current) return;
    const next_errors: Record<string, string> = {};
    if (
      !label.trim() ||
      label.trim().length > 64 ||
      Array.from(label).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      next_errors.label = "Enter a profile name.";
    if (!editing_id && provider !== "kilo" && !api_key.trim())
      next_errors.key = "Enter an API key.";
    if (
      api_key.trim() &&
      (api_key.trim().length > 4096 || /\s/.test(api_key.trim()))
    )
      next_errors.key = "Enter a key without spaces.";
    if (
      (provider === "openai_compatible" || model.trim()) &&
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model.trim())
    )
      next_errors.model = "Enter a valid model name.";
    if (provider === "openai_compatible") {
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
        next_errors.url =
          "Enter an HTTPS URL without credentials, query or fragment.";
      }
    }
    set_errors(next_errors);
    if (Object.keys(next_errors).length) return;
    operation.current = true;
    set_busy(true);
    try {
      let saved_id = editing_id;
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
        const added = await add_key_profile(SecureStore, {
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
        saved_id = added.id;
        dispatch({ type: "select_model", model: MODEL_FOR_PROVIDER[provider] });
      }
      dispatch({ type: "show_toast", message: "Key profile saved securely." });
      reset_form();
      await refresh();
      // Pinned standard providers are checked once automatically.
      // Custom endpoints require an explicit user test to prevent credential exfiltration.
      if (saved_id) {
        void check_saved_profile(saved_id, { auto: true });
      }
    } catch {
      set_errors({
        form: "Could not save this provider. Your changes are still here; try again.",
      });
    } finally {
      operation.current = false;
      set_busy(false);
    }
  };

  /**
   * Check a saved profile against its endpoint and report the class of
   * result. Deliberately reports "accepted", never "verified": discovery and
   * chat are different endpoints on every provider that matters here.
   */
  const check_saved_profile = async (
    target_id?: string,
    options?: { auto?: boolean },
  ) => {
    try {
      const registry = await read_key_registry(SecureStore);
      const target =
        (target_id
          ? registry.profiles.find((entry) => entry.id === target_id)
          : undefined) ??
        registry.profiles.find((entry) => entry.id === registry.active_id) ??
        registry.profiles[0];
      if (!target) return;
      if (
        options?.auto &&
        target.base_url &&
        !is_pinned_endpoint(target.base_url)
      ) {
        return;
      }
      const check = await test_connection(SecureStore, target);
      set_checks((current) => ({ ...current, [target.id]: check }));
      dispatch({
        type: "show_toast",
        message:
          check.state === "reachable"
            ? "Endpoint reachable and key accepted. No request was sent to a model."
            : check.state === "rejected"
              ? "The endpoint rejected this key. Check it and save again."
              : check.state === "not_found"
                ? "The endpoint path was not found (404). Check the base URL."
                : "Could not reach that endpoint. Check the URL and your connection.",
      });
    } catch {
      // A failed check is not a failed save; stay quiet rather than nagging.
    }
  };

  const fetch_models = async () => {
    if (operation.current) return;
    operation.current = true;
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
      set_model_query("");
      if (choices.length === 0)
        dispatch({ type: "show_toast", message: "No models were returned." });
    } catch {
      dispatch({
        type: "show_toast",
        message: "Could not fetch models. Check the endpoint and key.",
      });
    } finally {
      operation.current = false;
      set_busy(false);
    }
  };

  const paste_key = async () => {
    if (operation.current) return;
    operation.current = true;
    set_busy(true);
    try {
      const text = await Clipboard.getStringAsync();
      if (text) set_api_key(text);
    } catch {
      set_errors({
        key: "Could not read the clipboard. Paste or type the key manually.",
      });
    } finally {
      operation.current = false;
      set_busy(false);
    }
  };

  const copy_key = async (profile: KeyProfile) => {
    const read = await read_key_secret_state(SecureStore, profile.id);
    if (read.state !== "ok") {
      // Doing nothing here looked like a broken button. Say which problem it is.
      dispatch({
        type: "show_toast",
        message:
          read.state === "unreadable"
            ? "This key can no longer be read on this device. Re-enter it."
            : "No key is saved for this profile.",
      });
      return;
    }
    await Clipboard.setStringAsync(read.value, {
      android: { isSensitive: true },
    });
    dispatch({ type: "show_toast", message: "Key copied to clipboard." });
  };

  const toggle_reveal = async (profile: KeyProfile) => {
    const request_version = ++reveal_version.current;
    if (revealed[profile.id]) {
      set_revealed((current) => ({ ...current, [profile.id]: null }));
      return;
    }
    const read = await read_key_secret_state(SecureStore, profile.id);
    if (request_version !== reveal_version.current) return;
    set_revealed((current) => ({
      ...current,
      [profile.id]: read.state === "ok" ? read.value : null,
    }));
    if (read.state === "unreadable")
      dispatch({
        type: "show_toast",
        message: "This key can no longer be read on this device. Re-enter it.",
      });
  };

  const edit = (profile: KeyProfile) => {
    set_errors({});
    set_model_query("");
    set_show_form_key(false);
    clear_revealed();
    set_action_id(null);
    set_view("edit");
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

  const close_editor = () => {
    if (!operation.current) reset_form();
  };
  useEffect(() => {
    if (view === "list") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (!operation.current) reset_form();
        return true;
      },
    );
    return () => subscription.remove();
  }, [view, reset_form]);
  const shown_models = models.filter((choice) =>
    choice.label.toLowerCase().includes(model_query.trim().toLowerCase()),
  );

  if (view === "choose")
    return (
      <Screen>
        <PageHeader title="Add provider" onBack={close_editor} />
        <M style={styles.intro}>
          Choose a service. Its connection settings will be filled in for you.
        </M>
        <View style={styles.stack}>
          {[
            ...PRESET_CHOICES,
            { id: "kilo", label: "Kilo Gateway" },
            { id: "custom", label: "Custom" },
          ].map((choice) => (
            <Pressable
              key={choice.id}
              accessibilityRole="button"
              accessibilityLabel={`Preset ${choice.label}`}
              onPress={() => {
                if (choice.id === "kilo") {
                  set_provider("kilo");
                  set_label("Kilo Gateway");
                  set_view("edit");
                } else apply_preset(choice.id);
              }}
              style={({ pressed }) => [
                styles.choice,
                pressed && { opacity: 0.75 },
              ]}
            >
              <View style={styles.glyph}>
                <KeyRound size={20} color={colors.lime} />
              </View>
              <View style={styles.grow}>
                <B>{choice.label}</B>
                {choice.id === "custom" ? (
                  <M size={12}>Any supported HTTPS endpoint</M>
                ) : null}
              </View>
              <ChevronRight size={18} color={colors.dim} />
            </Pressable>
          ))}
        </View>
      </Screen>
    );

  if (view === "edit")
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Screen>
          <PageHeader
            title={editing_id ? "Edit provider" : "Add provider"}
            onBack={close_editor}
          />
          <View style={styles.editorIntro}>
            <Pill>{PROVIDER_LABEL[provider]}</Pill>
            <M size={12}>Your key stays in this device's secure store.</M>
          </View>
          <View style={styles.stack} pointerEvents={busy ? "none" : "auto"}>
            <ProviderField
              editable={!busy}
              label="Label"
              title="Profile name"
              placeholder="e.g. My provider"
              value={label}
              onChangeText={set_label}
              error={errors.label}
            />
            <ProviderField
              editable={!busy}
              label="API key"
              placeholder={
                editing_id
                  ? "Saved key unchanged"
                  : provider === "kilo"
                    ? "Optional"
                    : "Paste your API key"
              }
              value={api_key}
              onChangeText={set_api_key}
              secure={!show_form_key}
              error={errors.key}
              hint={
                editing_id
                  ? "Leave blank to keep the saved key."
                  : provider === "kilo"
                    ? "No key is required for Kilo Auto Free."
                    : undefined
              }
              actions={
                <>
                  <IconBtn
                    label="Paste key"
                    onPress={() => {
                      if (!busy) void paste_key();
                    }}
                  >
                    <T size={12}>Paste</T>
                  </IconBtn>
                  <IconBtn
                    label={show_form_key ? "Hide key" : "Show key"}
                    onPress={() => set_show_form_key((value) => !value)}
                  >
                    <T size={12}>{show_form_key ? "Hide" : "Show"}</T>
                  </IconBtn>
                </>
              }
            />
            {provider === "openai_compatible" ? (
              <ProviderField
                editable={!busy}
                label="Base URL"
                value={base_url}
                onChangeText={(value) => {
                  set_base_url(value);
                  set_models([]);
                }}
                error={errors.url}
                hint="Use the endpoint supplied by your provider."
              />
            ) : null}
            <ProviderField
              editable={!busy}
              label="Model"
              placeholder={
                provider === "openai_compatible"
                  ? "Choose or enter a model ID"
                  : "Provider default"
              }
              value={model}
              onChangeText={set_model}
              error={errors.model}
            />
            <Button
              label={busy ? "Working…" : "Fetch models"}
              variant="ghost"
              disabled={busy}
              onPress={() => void fetch_models()}
            />
            {models.length > 0 ? (
              <Card style={styles.stack}>
                <Row start gap={8}>
                  <Search size={18} color={colors.muted} />
                  <Input
                    label="Search models"
                    placeholder="Search models"
                    value={model_query}
                    onChangeText={set_model_query}
                    textStyle={{ flex: 1, minHeight: 48 }}
                  />
                </Row>
                {shown_models.length === 0 ? (
                  <M>No models match your search.</M>
                ) : (
                  shown_models.map((choice) => (
                    <Pressable
                      key={choice.id}
                      accessibilityRole="button"
                      accessibilityLabel={choice.label}
                      accessibilityState={{ selected: model === choice.id }}
                      onPress={() => set_model(choice.id)}
                      style={styles.modelChoice}
                    >
                      <T style={styles.grow}>{choice.label}</T>
                      {model === choice.id ? (
                        <Check size={18} color={colors.lime} />
                      ) : null}
                    </Pressable>
                  ))
                )}
              </Card>
            ) : null}
            {provider === "openai_compatible" ? (
              <>
                <Button
                  label={
                    show_advanced
                      ? "Hide advanced"
                      : "Advanced connection settings"
                  }
                  variant="ghost"
                  disabled={busy}
                  onPress={() => set_show_advanced((value) => !value)}
                />
                {show_advanced ? (
                  <Card style={styles.stack}>
                    <ProviderField
                      editable={!busy}
                      label="API path (default /v1)"
                      value={api_suffix}
                      onChangeText={set_api_suffix}
                      hint="Appended to the base URL. Leave empty if your endpoint already includes the full path."
                    />
                    <B size={13}>Authentication header</B>
                    <View style={styles.wrap}>
                      {AUTH_CHOICES.map((choice) => (
                        <Button
                          key={choice.id}
                          label={choice.label}
                          accessibilityLabel={`Auth header ${choice.label}`}
                          variant={auth_header === choice.id ? "lime" : "ghost"}
                          small
                          onPress={() => {
                            set_auth_header(choice.id);
                            set_auth_scheme(
                              choice.id === "authorization" ? "Bearer" : "",
                            );
                          }}
                        />
                      ))}
                    </View>
                    <ProviderField
                      editable={!busy}
                      label="Auth scheme (empty sends the bare key)"
                      value={auth_scheme}
                      onChangeText={set_auth_scheme}
                    />
                  </Card>
                ) : null}
              </>
            ) : null}
            {errors.form ? (
              <M style={{ color: colors.amber }}>{errors.form}</M>
            ) : null}
            <View style={styles.actions}>
              <Button
                label={
                  busy
                    ? "Working…"
                    : editing_id
                      ? "Save changes"
                      : "Save and use"
                }
                disabled={busy}
                onPress={() => void save()}
              />
              <Button
                label="Cancel"
                variant="ghost"
                disabled={busy}
                onPress={close_editor}
              />
            </View>
          </View>
        </Screen>
      </KeyboardAvoidingView>
    );

  return (
    <Screen>
      <PageHeader title="Providers" onBack={() => dispatch({ type: "back" })} />
      <M style={styles.intro}>
        Choose who answers your questions. Only the provider you select is used.
      </M>
      <Button
        label="Add provider"
        icon={<Plus size={20} color={colors.limeDark} />}
        onPress={() => {
          reset_form();
          set_action_id(null);
          clear_revealed();
          set_view("choose");
        }}
      />
      <SectionLabel>Saved providers</SectionLabel>
      {registry_from_manifest ||
      Object.values(hints).some((hint) => hint.includes("unreadable")) ? (
        <Card style={styles.notice} tone="soft">
          <B>Your keys cannot be opened on this device</B>
          <M size={12}>
            The profiles below survived because their label, provider, endpoint
            and model are stored on this device outside the keystore. Re-enter a
            key to use it again. Nothing was sent anywhere.
          </M>
        </Card>
      ) : null}
      {registry_unreadable ? (
        <Card style={styles.notice} tone="soft">
          <B>Saved keys could not be read</B>
          <M>
            This device will not release the stored key data, and there is no
            profile list to fall back on. Nothing was sent anywhere.
          </M>
          <Button
            label="Start over"
            variant="ghost"
            onPress={() =>
              Alert.alert(
                "Reset saved providers?",
                "This discards the unreadable provider list on this device.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Reset",
                    style: "destructive",
                    onPress: () => {
                      void reset_key_registry(SecureStore)
                        .then(refresh)
                        .catch(() =>
                          dispatch({
                            type: "show_toast",
                            message: "Could not reset saved keys.",
                          }),
                        );
                    },
                  },
                ],
              )
            }
          />
        </Card>
      ) : profiles.length === 0 ? (
        <Card style={styles.empty}>
          <View style={styles.glyph}>
            <KeyRound size={22} color={colors.lime} />
          </View>
          <B>No providers yet</B>
          <M>
            Add a provider with your own key, or use Kilo Auto Free from the
            model picker.
          </M>
        </Card>
      ) : (
        <View style={styles.stack}>
          {profiles.map((profile) => (
            <Card key={profile.id} style={styles.profile}>
              <Row start gap={12}>
                <View style={styles.grow}>
                  <B>{profile.label}</B>
                  <M size={12}>{PROVIDER_LABEL[profile.provider]}</M>
                </View>
                {active_id === profile.id ? <Pill>Active</Pill> : null}
                <IconBtn
                  label={`Actions for ${profile.label}`}
                  onPress={() => {
                    clear_revealed();
                    set_action_id(action_id === profile.id ? null : profile.id);
                  }}
                >
                  <MoreHorizontal size={22} color={colors.text} />
                </IconBtn>
              </Row>
              <T size={13} style={{ flexShrink: 1 }}>
                {profile.model || "Provider default"}
              </T>
              {profile.base_url ? <M size={12}>{profile.base_url}</M> : null}
              <M size={12}>{check_label(checks[profile.id])}</M>
              <M size={12}>
                {(action_id === profile.id ? revealed[profile.id] : null) ??
                  hints[profile.id] ??
                  "No key"}
              </M>
              <View style={styles.wrap}>
                <Button
                  label={active_id === profile.id ? "In use" : "Use provider"}
                  small
                  disabled={active_id === profile.id || busy}
                  onPress={() => void use_profile(profile)}
                />
                <Button
                  label="Edit"
                  variant="ghost"
                  small
                  accessibilityLabel={`Edit key for ${profile.label}`}
                  disabled={busy}
                  onPress={() => edit(profile)}
                />
              </View>
              {action_id === profile.id ? (
                <View style={styles.profileMenu}>
                  <Row>
                    <B size={13}>Provider actions</B>
                    <IconBtn
                      label="Close provider actions"
                      onPress={() => {
                        set_action_id(null);
                        clear_revealed();
                      }}
                    >
                      <X size={18} color={colors.muted} />
                    </IconBtn>
                  </Row>
                  <Button
                    label="Test connection"
                    variant="ghost"
                    accessibilityLabel={`Test connection for ${profile.label}`}
                    onPress={() => void check_saved_profile(profile.id)}
                  />
                  <View style={styles.wrap}>
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
                  </View>
                  <Button
                    label="Remove provider"
                    variant="ghost"
                    labelColor={colors.amber}
                    accessibilityLabel={`Remove key for ${profile.label}`}
                    onPress={() =>
                      Alert.alert(
                        `Remove ${profile.label}?`,
                        "This removes its saved key from this device. Your ledger and conversations stay here. No other provider will be selected automatically.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Remove",
                            style: "destructive",
                            onPress: () => {
                              set_action_id(null);
                              clear_revealed();
                              void remove(profile);
                            },
                          },
                        ],
                      )
                    }
                  />
                </View>
              ) : null}
            </Card>
          ))}
        </View>
      )}
      {profiles.length > 0 ? (
        <M size={11} style={styles.intro}>
          Keys are stored in this device's secure storage. Profile labels,
          provider, endpoint, model and the last connection result are stored
          unencrypted on this device so the list survives a lock-screen change.
        </M>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginTop: 8, marginBottom: 24, lineHeight: 19 },
  stack: { gap: 16 },
  grow: { flex: 1, minWidth: 0, gap: 4 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    minHeight: 72,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  glyph: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.limeBg,
    alignItems: "center",
    justifyContent: "center",
  },
  editorIntro: { gap: 8, marginTop: 8, marginBottom: 24 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actions: { gap: 8, marginTop: 8 },
  notice: { gap: 8, marginBottom: 16 },
  empty: { gap: 12, padding: 24 },
  profile: { gap: 12 },
  profileMenu: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: 8,
  },
  modelChoice: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
});
