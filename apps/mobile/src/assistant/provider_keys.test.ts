import { beforeEach, expect, it, jest } from "@jest/globals";
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
  forget_connection_check,
  test_connection,
} from "./provider_keys";
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

let store: SecureKeyStore;
beforeEach(() => {
  store = memory_store();
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
    expect(read_connection_check("profile_one")).toMatchObject({
      state: "reachable",
    });
  });

  it("tells a rejected key apart from an unreachable endpoint", async () => {
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
        model_server(500),
        "synthetic-key",
      ),
    ).toMatchObject({ state: "unreachable" });
  });

  it("treats a network failure as unreachable rather than a bad key", async () => {
    const offline = jest.fn(async () => {
      throw new Error("synthetic network down");
    }) as unknown as typeof fetch;
    expect(
      await test_connection(memory_store(), profile, offline, "synthetic-key"),
    ).toMatchObject({ state: "unreachable" });
  });

  it("starts untested and can be forgotten", () => {
    expect(read_connection_check("never_checked")).toEqual({
      state: "untested",
    });
    record_connection_check("p", { state: "rejected", at: 1 });
    forget_connection_check("p");
    expect(read_connection_check("p")).toEqual({ state: "untested" });
  });
});
