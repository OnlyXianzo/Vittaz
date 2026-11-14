import { afterAll, beforeEach, expect, it, jest } from "@jest/globals";
import {
  KEY_PROFILES_NAME,
  KeyRegistryUnreadableError,
  activate_key_profile,
  add_key_profile,
  auth_header_for,
  fetch_model_choices,
  mobile_supports_preset,
  profile_api_suffix,
  read_key_registry,
  read_connection_check,
  read_key_secret,
  read_key_secret_state,
  record_connection_check,
  remove_key_profile,
  reset_connection_checks,
  reset_key_registry,
  reset_key_manifest_store,
  forget_connection_check,
  set_key_manifest_store,
  test_connection,
  update_key_profile,
} from "./provider_keys";
import { read_manifest } from "./profile_manifest";
import type { ManifestStore } from "./profile_manifest";
import {
  ANTHROPIC_API_KEY_NAME,
  read_assistant_provider_profile,
  read_openai_compatible_key,
  save_anthropic_api_key,
  save_assistant_provider_profile,
  save_openai_compatible_key,
} from "./secure_key";
import type { SecureKeyStore } from "./secure_key";

function memory_store(): SecureKeyStore {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
    deleteItemAsync: async (key) => {
      values.delete(key);
    },
  };
}

/** The plain-storage mirror; in-memory here so tests never share a blob. */
function memory_manifest(): ManifestStore {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      values.set(key, value);
    },
    removeItemAsync: async (key: string) => {
      values.delete(key);
    },
  };
}

let store: SecureKeyStore;
let manifest: ManifestStore;
beforeEach(() => {
  store = memory_store();
  manifest = memory_manifest();
  set_key_manifest_store(manifest);
  reset_connection_checks();
});
afterAll(() => {
  reset_key_manifest_store();
});

it("stores multiple labeled keys and activates one explicitly", async () => {
  const first = await add_key_profile(store, {
    provider: "openai_compatible",
    label: "Work endpoint",
    base_url: "https://api.example.com/v1",
    model: "gpt-4o-mini",
    api_key: "key-one",
    activate: true,
  });
  const second = await add_key_profile(store, {
    provider: "openai_compatible",
    label: "Personal endpoint",
    base_url: "https://api.personal.example/v1",
    model: "gpt-4.1-mini",
    api_key: "key-two",
  });
  const registry = await read_key_registry(store);
  expect(registry.profiles.map((p) => p.label)).toEqual([
    "Work endpoint",
    "Personal endpoint",
  ]);
  expect(registry.active_id).toBe(first.id);
  expect(await read_key_secret(store, second.id)).toBe("key-two");
  expect(await read_openai_compatible_key(store)).toBe("key-one");
  await activate_key_profile(store, second.id);
  expect(await read_openai_compatible_key(store)).toBe("key-two");
  expect((await read_assistant_provider_profile(store)).model).toBe(
    "gpt-4.1-mini",
  );
  await remove_key_profile(store, second.id);
  expect(await read_openai_compatible_key(store)).toBeNull();
  expect((await read_key_registry(store)).active_id).toBeNull();
});

it("migrates legacy single-key storage without losing the selected provider", async () => {
  await save_openai_compatible_key(store, "legacy-key");
  await save_assistant_provider_profile(store, {
    selected_provider: "openai_compatible",
    base_url: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  });
  await save_anthropic_api_key(store, "anthropic-key");
  const registry = await read_key_registry(store);
  expect(registry.profiles).toHaveLength(2);
  expect(registry.active_id).toBe(
    registry.profiles.find((p) => p.provider === "openai_compatible")!.id,
  );
  expect(await read_openai_compatible_key(store)).toBe("legacy-key");
  expect(await store.getItemAsync(KEY_PROFILES_NAME)).toContain("Anthropic");
  expect(await store.getItemAsync(ANTHROPIC_API_KEY_NAME)).toBe(
    "anthropic-key",
  );
});

it("fetches OpenAI-compatible and Anthropic model lists without exposing keys", async () => {
  const profile = await add_key_profile(store, {
    provider: "openai_compatible",
    label: "Models",
    base_url: "https://api.example.com",
    model: "gpt-4o-mini",
    api_key: "model-key",
  });
  const fetch_impl = jest.fn(async (input: RequestInfo | URL) => {
    expect(String(input)).toBe("https://api.example.com/v1/models");
    return new Response(
      JSON.stringify({ data: [{ id: "gpt-4o-mini" }, { id: "gpt-4.1" }] }),
      { headers: { "content-type": "application/json" } },
    );
  });
  expect(await fetch_model_choices(store, profile, fetch_impl)).toEqual([
    { id: "gpt-4o-mini", label: "gpt-4o-mini" },
    { id: "gpt-4.1", label: "gpt-4.1" },
  ]);
  const anthropic = await add_key_profile(store, {
    provider: "anthropic",
    label: "Claude",
    base_url: "",
    model: "",
    api_key: "anthropic-key",
  });
  const anthropic_fetch = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.anthropic.com/v1/models");
      expect((init?.headers as Record<string, string>)["x-api-key"]).toBe(
        "anthropic-key",
      );
      return new Response(
        JSON.stringify({
          data: [{ id: "claude-sonnet-5-5", display_name: "Claude Sonnet" }],
        }),
      );
    },
  );
  expect(await fetch_model_choices(store, anthropic, anthropic_fetch)).toEqual([
    { id: "claude-sonnet-5-5", label: "Claude Sonnet" },
  ]);
});

it("stores a Gemini-style API path and key header, and discovers models there", async () => {
  const profile = await add_key_profile(store, {
    provider: "openai_compatible",
    label: "Gemini",
    base_url: "https://generativelanguage.googleapis.com",
    model: "gemini-2.5-flash",
    api_key: "AIza-synth",
    api_suffix: "/v1beta/openai",
    auth_header: "x-goog-api-key",
    auth_scheme: "",
  });
  // Round-trips through storage, so the chat path can read it back.
  const registry = await read_key_registry(store);
  expect(registry.profiles[0]).toMatchObject({
    api_suffix: "/v1beta/openai",
    auth_header: "x-goog-api-key",
    auth_scheme: "",
  });

  const fetch_impl = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      // Discovery must use the same path and key header as the chat transport,
      // or the app would list models it cannot then talk to.
      expect(String(input)).toBe(
        "https://generativelanguage.googleapis.com/v1beta/openai/models",
      );
      expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe(
        "AIza-synth",
      );
      expect(init?.headers).not.toHaveProperty("authorization");
      return new Response(
        JSON.stringify({ data: [{ id: "gemini-2.5-flash" }] }),
      );
    },
  );
  expect(await fetch_model_choices(store, profile, fetch_impl)).toEqual([
    { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
  ]);
});

it("does not double the API path when a full endpoint is pasted", async () => {
  const profile = await add_key_profile(store, {
    provider: "openai_compatible",
    label: "Gemini pasted",
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
    api_key: "AIza-synth",
    api_suffix: "/v1beta/openai",
  });
  // Stored without the suffix, because the transport appends it.
  expect(profile.base_url).toBe("https://generativelanguage.googleapis.com");
  const fetch_impl = jest.fn(async (input: RequestInfo | URL) => {
    expect(String(input)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/openai/models",
    );
    return new Response(JSON.stringify({ data: [{ id: "m" }] }));
  });
  await fetch_model_choices(store, profile, fetch_impl);
});

it("rejects unsafe API paths and unknown auth headers", async () => {
  const base = {
    provider: "openai_compatible" as const,
    label: "Bad",
    base_url: "https://api.example.com",
    model: "m",
    api_key: "k",
  };
  for (const api_suffix of [
    "../admin",
    "v1",
    "/v1?x=1",
    "/a b",
    "/" + "x".repeat(64),
  ])
    await expect(
      add_key_profile(store, { ...base, api_suffix }),
    ).rejects.toThrow();
  await expect(
    add_key_profile(store, { ...base, auth_header: "cookie" as never }),
  ).rejects.toThrow();
  await expect(
    add_key_profile(store, { ...base, auth_scheme: "bad\nscheme" }),
  ).rejects.toThrow();
});

it("exposes the effective path and header as helpers", () => {
  expect(profile_api_suffix({ api_suffix: "/v1beta/openai" } as never)).toBe(
    "/v1beta/openai",
  );
  expect(profile_api_suffix({} as never)).toBe("/v1");
  expect(profile_api_suffix({ provider: "anthropic" } as never)).toBe("");
  expect(auth_header_for({}, "k")).toEqual({
    name: "authorization",
    value: "Bearer k",
  });
  expect(auth_header_for({ auth_header: "x-goog-api-key" }, "k")).toEqual({
    name: "x-goog-api-key",
    value: "k",
  });
  expect(
    auth_header_for({ auth_header: "api-key", auth_scheme: "Basic" }, "k"),
  ).toEqual({ name: "api-key", value: "Basic k" });
});

it("defaults every existing profile to /v1 with Bearer", async () => {
  const profile = await add_key_profile(store, {
    provider: "openai_compatible",
    label: "Plain",
    base_url: "https://api.openai.com",
    model: "gpt-4o-mini",
    api_key: "k",
  });
  expect(profile.api_suffix).toBeUndefined();
  expect(profile.auth_header).toBeUndefined();
  const fetch_impl = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.openai.com/v1/models");
      expect((init?.headers as Record<string, string>).authorization).toBe(
        "Bearer k",
      );
      return new Response(JSON.stringify({ data: [{ id: "gpt-4o-mini" }] }));
    },
  );
  await fetch_model_choices(store, profile, fetch_impl);
});

describe("mobile_supports_preset", () => {
  it("refuses a keyless preset the key flow cannot save", () => {
    // Ollama is defined for the CLI, where a loopback endpoint and no key are
    // fine. Offering it on the phone means offering a form that always fails.
    expect(
      mobile_supports_preset({
        id: "ollama",
        base_url: "http://127.0.0.1:11434",
        keyless: true,
      }),
    ).toBe(false);
  });

  it("accepts the keyless provider the phone flow does allow", () => {
    expect(
      mobile_supports_preset({
        id: "kilo",
        base_url: "https://kilo.example",
        keyless: true,
      }),
    ).toBe(true);
  });

  it("refuses a non-https endpoint and accepts a keyed https one", () => {
    expect(
      mobile_supports_preset({ id: "custom", base_url: "http://host.invalid" }),
    ).toBe(false);
    expect(
      mobile_supports_preset({
        id: "custom",
        base_url: "https://host.invalid",
      }),
    ).toBe(true);
    // A preset without an endpoint inherits the form's own value.
    expect(mobile_supports_preset({ id: "anthropic" })).toBe(true);
  });
});

describe("unreadable credential state", () => {
  /** A store whose reads throw, as an invalidated Android keystore does. */
  function locked_store(): SecureKeyStore {
    return {
      getItemAsync: async () => {
        throw new Error("keystore_locked");
      },
      setItemAsync: async () => {
        throw new Error("keystore_locked");
      },
      deleteItemAsync: async () => {
        throw new Error("keystore_locked");
      },
    };
  }

  it("reports a locked keystore as unreadable, not as a missing key", async () => {
    const read = await read_key_secret_state(locked_store(), "profile_one");
    expect(read).toEqual({ state: "unreadable" });
    // The older string|null shape cannot express this and maps to null.
    expect(await read_key_secret(locked_store(), "profile_one")).toBeNull();
  });

  it("reports a value that will not normalise as unreadable", async () => {
    const corrupt: SecureKeyStore = {
      getItemAsync: async () => "has a space in it",
      setItemAsync: async () => undefined,
      deleteItemAsync: async () => undefined,
    };
    expect(await read_key_secret_state(corrupt, "p")).toEqual({
      state: "unreadable",
    });
  });

  it("keeps absent distinct from unreadable", async () => {
    expect(await read_key_secret_state(memory_store(), "p")).toEqual({
      state: "absent",
    });
  });

  it("throws a typed error for an unreadable registry instead of an empty list", async () => {
    // An empty list is indistinguishable from a fresh install, which is how the
    // profiles used to disappear without explanation.
    await expect(read_key_registry(locked_store())).rejects.toBeInstanceOf(
      KeyRegistryUnreadableError,
    );
  });

  it("throws rather than replacing a corrupt registry, and never writes on a read", async () => {
    const writes: string[] = [];
    const corrupt: SecureKeyStore = {
      getItemAsync: async (key) =>
        key === KEY_PROFILES_NAME ? "{not json" : null,
      setItemAsync: async (key) => {
        writes.push(key);
      },
      deleteItemAsync: async (key) => {
        writes.push(key);
      },
    };
    await expect(read_key_registry(corrupt)).rejects.toBeInstanceOf(
      KeyRegistryUnreadableError,
    );
    // Reading must not destroy what could not be parsed.
    expect(writes).toEqual([]);
  });

  it("only discards profiles when the user asks to start over", async () => {
    const values = new Map<string, string>();
    const store_with_data: SecureKeyStore = {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => {
        values.set(key, value);
      },
      deleteItemAsync: async (key) => {
        values.delete(key);
      },
    };
    await add_key_profile(store_with_data, {
      provider: "openai_compatible",
      label: "Work",
      base_url: "https://api.example.com/v1",
      model: "gpt-4o-mini",
      api_key: "key-one",
      activate: true,
    });
    expect(values.has(KEY_PROFILES_NAME)).toBe(true);

    await reset_key_registry(store_with_data);
    expect(values.has(KEY_PROFILES_NAME)).toBe(false);
    const after = await read_key_registry(store_with_data);
    expect(after.profiles).toEqual([]);
  });

  /**
   * Reads that fail, writes that succeed and are recorded. Models an
   * invalidated keystore while still proving the recovery path does not write.
   */
  function read_only_locked_store(writes: string[]): SecureKeyStore {
    return {
      getItemAsync: async () => {
        throw new Error("keystore_locked");
      },
      setItemAsync: async (key) => {
        writes.push(key);
      },
      deleteItemAsync: async (key) => {
        writes.push(key);
      },
    };
  }

  it("still lists the profiles after the keystore stops opening", async () => {
    // The lock-screen credential changed, so every stored secret is gone. The
    // list must not be: until now this returned an empty registry and looked
    // exactly like a fresh install.
    const added = await add_key_profile(store, {
      provider: "openai_compatible",
      label: "Work endpoint",
      base_url: "https://api.example.com/v1",
      model: "gpt-4o-mini",
      api_key: "synthetic-key",
      activate: true,
    });
    const recovered = await read_key_registry(read_only_locked_store([]));
    expect(recovered.source).toBe("manifest");
    expect(recovered.profiles).toEqual([
      {
        id: added.id,
        provider: "openai_compatible",
        label: "Work endpoint",
        base_url: "https://api.example.com",
        model: "gpt-4o-mini",
      },
    ]);
    expect(recovered.active_id).toBe(added.id);
    // No secret came back with the list, because none was stored there.
    expect(JSON.stringify(recovered)).not.toContain("synthetic-key");
  });

  it("writes nothing while recovering", async () => {
    // A keystore that comes back after a restart must find its contents intact,
    // so recovering the list is a read-only act.
    await add_key_profile(store, {
      provider: "anthropic",
      label: "Claude",
      base_url: "",
      model: "",
      api_key: "synthetic-key",
    });
    const writes: string[] = [];
    await read_key_registry(read_only_locked_store(writes));
    expect(writes).toEqual([]);
  });

  it("refuses when the keystore is locked and there is nothing to recover from", async () => {
    // Both copies unusable: no list can be invented, so the typed error stands.
    set_key_manifest_store(memory_manifest());
    await expect(read_key_registry(locked_store())).rejects.toBeInstanceOf(
      KeyRegistryUnreadableError,
    );
  });

  it("rebuilds the registry for real once the user re-enters a key", async () => {
    // Recovery gets the row on screen; this is the write that repairs storage.
    const added = await add_key_profile(store, {
      provider: "openai_compatible",
      label: "Work endpoint",
      base_url: "https://api.example.com/v1",
      model: "gpt-4o-mini",
      api_key: "synthetic-key",
      activate: true,
    });
    // Seed a copy of the working store with an unparseable registry, then let
    // it behave normally so the repair write is observable.
    const values = new Map<string, string>();
    values.set(KEY_PROFILES_NAME, "{not json");
    values.set(`assistant_key_${added.id}`, "synthetic-key");
    const corrupt: SecureKeyStore = {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => {
        values.set(key, value);
      },
      deleteItemAsync: async (key) => {
        values.delete(key);
      },
    };
    const recovered = await read_key_registry(corrupt);
    expect(recovered.source).toBe("manifest");
    await update_key_profile(corrupt, added.id, {
      api_key: "synth-key-2",
    });
    const repaired = await read_key_registry(corrupt);
    expect(repaired.source).toBe("keystore");
    expect(repaired.profiles).toHaveLength(1);
    expect(await read_key_secret(corrupt, added.id)).toBe("synth-key-2");
  });

  it("survives a manifest that cannot be written", async () => {
    // The mirror is a convenience; the key store is the authority.
    const failing: ManifestStore = {
      getItemAsync: async () => {
        throw new Error("synthetic storage failure");
      },
      setItemAsync: async () => {
        throw new Error("synthetic storage failure");
      },
      removeItemAsync: async () => {
        throw new Error("synthetic storage failure");
      },
    };
    const own: SecureKeyStore = memory_store();
    set_key_manifest_store(failing);
    const added = await add_key_profile(own, {
      provider: "openai_compatible",
      label: "Work",
      base_url: "https://api.example.com/v1",
      model: "gpt-4o-mini",
      api_key: "synthetic-key",
    });
    expect(await read_key_secret(own, added.id)).toBe("synthetic-key");
  });
});

describe("connection checks", () => {
  function model_server(status: number, models: string[] = ["m-one"]) {
    return jest.fn(async () => {
      if (status !== 200)
        return new Response(JSON.stringify({ error: "synthetic" }), {
          status,
          headers: { "content-type": "application/json" },
        });
      return new Response(
        JSON.stringify({ data: models.map((id) => ({ id })) }),
        { status, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
  }

  const profile = {
    id: "profile_one",
    provider: "openai_compatible" as const,
    label: "Work",
    base_url: "https://api.example.com",
    model: "gpt-4o-mini",
  };

  beforeEach(() => {
    reset_connection_checks();
  });

  it("records a reachable endpoint and how many models came back", async () => {
    const check = await test_connection(
      memory_store(),
      profile,
      model_server(200, ["a", "b"]),
      "synthetic-key",
    );
    expect(check).toMatchObject({ state: "reachable", models: 2 });
    expect(await read_connection_check("profile_one")).toMatchObject({
      state: "reachable",
    });
  });

  it("tells a rejected key apart from an unreachable endpoint and route not found", async () => {
    // Different causes, different next steps: fix the key, or fix the URL.
    expect(
      await test_connection(
        memory_store(),
        profile,
        model_server(401),
        "synthetic-key",
      ),
    ).toMatchObject({ state: "rejected" });
    expect(
      await test_connection(
        memory_store(),
        profile,
        model_server(404),
        "synthetic-key",
      ),
    ).toMatchObject({ state: "not_found" });
    expect(
      await test_connection(
        memory_store(),
        profile,
        model_server(500),
        "synthetic-key",
      ),
    ).toMatchObject({ state: "unreachable" });
  });

  it("resets connection check when profile endpoint or model changes", async () => {
    const p = await add_key_profile(store, {
      provider: "openai_compatible",
      label: "Work",
      base_url: "https://api.example.com/v1",
      model: "gpt-4o-mini",
      api_key: "synthetic-key",
    });
    await record_connection_check(p.id, {
      state: "reachable",
      models: 2,
      at: 1000,
    });
    expect(await read_connection_check(p.id)).toMatchObject({
      state: "reachable",
    });
    await update_key_profile(store, p.id, { model: "gpt-4o" });
    expect(await read_connection_check(p.id)).toEqual({ state: "untested" });
  });

  it("treats a network failure as unreachable rather than a bad key", async () => {
    const offline = jest.fn(async () => {
      throw new Error("synthetic network down");
    }) as unknown as typeof fetch;
    expect(
      await test_connection(memory_store(), profile, offline, "synthetic-key"),
    ).toMatchObject({ state: "unreachable" });
  });

  it("starts untested and can be forgotten", async () => {
    expect(await read_connection_check("never_checked")).toEqual({
      state: "untested",
    });
    await record_connection_check("p", { state: "rejected", at: 1 });
    await forget_connection_check("p");
    expect(await read_connection_check("p")).toEqual({ state: "untested" });
  });

  it("remembers the last check when the app restarts", async () => {
    // The memory map is per process, so a check vanished on every relaunch and
    // the screen showed "not checked yet" for a key that had just failed. The
    // manifest carries it across a restart because it is not a secret.
    const profile = await add_key_profile(store, {
      provider: "openai_compatible",
      label: "Work",
      base_url: "https://api.example.com/v1",
      model: "gpt-4o-mini",
      api_key: "synthetic-key",
    });
    await record_connection_check(profile.id, {
      state: "reachable",
      models: 4,
      at: 1_700_000_000_000,
    });
    reset_connection_checks();
    expect(await read_connection_check(profile.id)).toEqual({
      state: "reachable",
      models: 4,
      at: 1_700_000_000_000,
    });
  });

  it("drops a persisted check when the profile is removed", async () => {
    const profile = await add_key_profile(store, {
      provider: "openai_compatible",
      label: "Work",
      base_url: "https://api.example.com/v1",
      model: "gpt-4o-mini",
      api_key: "synthetic-key",
    });
    await record_connection_check(profile.id, { state: "rejected", at: 9 });
    await remove_key_profile(store, profile.id);
    reset_connection_checks();
    expect(await read_connection_check(profile.id)).toEqual({
      state: "untested",
    });
    expect((await read_manifest(manifest))!.checks).toEqual({});
  });

  it("does not persist a check for a profile that is not stored", async () => {
    // Guards the stored blob against unbounded growth from stale ids.
    await add_key_profile(store, {
      provider: "openai_compatible",
      label: "Work",
      base_url: "https://api.example.com/v1",
      model: "gpt-4o-mini",
      api_key: "synthetic-key",
    });
    await record_connection_check("not_a_profile", {
      state: "rejected",
      at: 1,
    });
    expect((await read_manifest(manifest))!.checks).toEqual({});
  });
});

it("preserves an existing profile secret when replacement fails", async () => {
  const p = await add_key_profile(store, {
    provider: "openai_compatible",
    label: "Work",
    base_url: "https://api.example.com/v1",
    model: "example",
    api_key: "synthetic-old",
  });
  const failing = {
    ...store,
    setItemAsync: async () => {
      throw new Error("write_failed");
    },
  };
  await expect(
    update_key_profile(failing, p.id, { api_key: "synthetic-new" }),
  ).rejects.toThrow("write_failed");
  expect(await read_key_secret(store, p.id)).toBe("synthetic-old");
});

it("persists wire overrides and invalidates the old connection check", async () => {
  const p = await add_key_profile(store, {
    provider: "openai_compatible",
    label: "Work",
    base_url: "https://api.example.com",
    model: "example",
    api_key: "synthetic-key",
  });
  for (const change of [
    { api_suffix: "/v2" },
    { auth_header: "x-api-key" as const },
    { auth_scheme: "Token" },
  ]) {
    await record_connection_check(p.id, {
      state: "reachable",
      models: 1,
      at: 1000,
    });
    await update_key_profile(store, p.id, change);
    expect(
      (await read_key_registry(store)).profiles.find((row) => row.id === p.id),
    ).toMatchObject(change);
    expect(await read_connection_check(p.id)).toEqual({ state: "untested" });
  }
});

it("keeps the discovery deadline active while reading the response body", async () => {
  jest.useFakeTimers();
  try {
    const fetcher = jest.fn(
      async (_url: unknown, init: RequestInit | undefined) => ({
        ok: true,
        json: () =>
          new Promise((_resolve, reject) => {
            init!.signal!.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      }),
    ) as unknown as typeof fetch;
    const pending = fetch_model_choices(
      store,
      {
        id: "test",
        provider: "openai_compatible",
        label: "Work",
        base_url: "https://api.example.com",
        model: "example",
      },
      fetcher,
      "synthetic-key",
    );
    const assertion = expect(pending).rejects.toThrow("aborted");
    await jest.advanceTimersByTimeAsync(5000);
    await assertion;
  } finally {
    jest.useRealTimers();
  }
});
