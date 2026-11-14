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
    return PINNED_HOSTS.has(parsed.hostname);
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
    if (!label) set_label(preset.label);
    setShowAdvancedForPreset(preset.id);
  };

  const save = async () => {
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
      dispatch({
        type: "show_toast",
        message:
          "Could not save that key. Check the label, HTTPS endpoint, model and key.",
      });
    } finally {
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
        (registry.profiles.find((entry) => entry.id === registry.active_id) ??
        registry.profiles[0]);
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
    if (revealed[profile.id]) {
      set_revealed((current) => ({ ...current, [profile.id]: null }));
      return;
    }
    const read = await read_key_secret_state(SecureStore, profile.id);
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
      {registry_from_manifest ||
      Object.values(hints).some((hint) => hint.includes("unreadable")) ? (
        <Card tone="soft">
          <B>Your keys cannot be opened on this device</B>
          <M size={12} style={{ marginTop: 4 }}>
            The profiles below survived because their label, provider, endpoint
            and model are stored on this device outside the keystore. The keys
            themselves are not, and this device will not release them. Re-enter
            a key on any profile to use it again. Nothing was sent anywhere.
          </M>
        </Card>
      ) : null}
      {registry_unreadable ? (
        <Card tone="soft">
          <B>Saved keys could not be read</B>
          <M size={12} style={{ marginTop: 4 }}>
            This device will not release the stored key data, and there is no
            profile list to fall back on. That can happen after a lock-screen
            change or a restore. Nothing was sent anywhere.
          </M>
          <Row gap={8} style={{ marginTop: 10 }}>
            <Button
              label="Start over"
              onPress={() => {
                // The only path that discards profiles, and only on request.
                set_busy(true);
                void reset_key_registry(SecureStore)
                  .then(refresh)
                  .catch(() =>
                    dispatch({
                      type: "show_toast",
                      message: "Could not reset saved keys.",
                    }),
                  )
                  .finally(() => set_busy(false));
              }}
            />
          </Row>
        </Card>
      ) : profiles.length === 0 ? (
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
              {check_label(checks[profile.id])}
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
                label="Test connection"
                variant="ghost"
                small
                accessibilityLabel={`Test connection for ${profile.label}`}
                onPress={() => void check_saved_profile(profile.id)}
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

      {profiles.length > 0 ? (
        <M size={11} style={{ marginTop: 8 }}>
          Keys are stored in this device&apos;s secure storage. Profile labels,
          provider, endpoint, model and the last connection result are stored
          unencrypted on this device so the list survives a lock-screen change.
        </M>
      ) : null}
    </Screen>
  );
}
