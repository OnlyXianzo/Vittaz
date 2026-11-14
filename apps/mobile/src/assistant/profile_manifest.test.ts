import { expect, it, jest } from "@jest/globals";
import {
  KEY_MANIFEST_NAME,
  clear_manifest,
  read_manifest,
  record_manifest_check,
  remove_manifest_check,
  write_manifest,
} from "./profile_manifest";
import type { ManifestStore } from "./profile_manifest";

function memory_store(): ManifestStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      values.set(key, value);
    },
    removeItemAsync: async (key: string) => {
      values.delete(key);
    },
  };
}

const profile = {
  id: "key_1_1",
  provider: "openai_compatible" as const,
  label: "Work endpoint",
  base_url: "https://api.example.com",
  model: "gpt-4o-mini",
  api_suffix: "/v1beta",
  auth_header: "x-api-key" as const,
  auth_scheme: "Key",
};

it("stores the non-secret profile fields and the active id", async () => {
  const store = memory_store();
  await write_manifest(store, {
    active_id: profile.id,
    profiles: [profile],
  });
  const manifest = await read_manifest(store);
  expect(manifest).toEqual({
    active_id: "key_1_1",
    profiles: [profile],
    checks: {},
  });
});

it("keeps only the allowlisted fields, so a stray secret cannot be mirrored", async () => {
  const store = memory_store();
  // The caller passes a whole profile object, as the registry writer does. The
  // manifest must copy the four non-secret fields and nothing else: this store
  // is plain text on disk, and one careless spread would put a key in it.
  await write_manifest(store, {
    active_id: "key_1_1",
    profiles: [
      {
        ...profile,
        api_key: "synthetic-mir",
      } as unknown as typeof profile,
    ],
  });
  const raw = store.values.get(KEY_MANIFEST_NAME)!;
  expect(raw).not.toContain("synthetic-mir");
  expect(raw).not.toContain("api_key");
});

it("records a check per profile and prunes checks for profiles that are gone", async () => {
  const store = memory_store();
  await write_manifest(store, { active_id: null, profiles: [profile] });
  await record_manifest_check(store, profile.id, {
    state: "reachable",
    models: 3,
    at: 1_700_000_000_000,
  });
  expect((await read_manifest(store))!.checks[profile.id]).toEqual({
    state: "reachable",
    models: 3,
    at: 1_700_000_000_000,
  });
  // A check for an id that is no longer listed is not kept: the map is keyed by
  // profile id, so without pruning it would grow one dead entry per profile the
  // user ever added.
  await record_manifest_check(store, "key_deleted", {
    state: "rejected",
    at: 1,
  });
  expect((await read_manifest(store))!.checks).toEqual({
    [profile.id]: { state: "reachable", models: 3, at: 1_700_000_000_000 },
  });
});

it("drops one profile's check without touching the others", async () => {
  const store = memory_store();
  await write_manifest(store, { active_id: null, profiles: [profile] });
  await record_manifest_check(store, profile.id, { state: "rejected", at: 5 });
  await remove_manifest_check(store, profile.id);
  expect((await read_manifest(store))!.checks).toEqual({});
});

it("reports an absent manifest as null rather than an empty list", async () => {
  // Null means "this device has nothing to recover from", which is a different
  // situation from "the manifest exists and is empty".
  expect(await read_manifest(memory_store())).toBeNull();
});

it("fails closed on a corrupt manifest without deleting it", async () => {
  const store = memory_store();
  await store.setItemAsync(KEY_MANIFEST_NAME, "{not json");
  expect(await read_manifest(store)).toBeNull();
  // Discarding is the user's decision, never a side effect of reading.
  expect(store.values.get(KEY_MANIFEST_NAME)).toBe("{not json");
});

it("drops unusable entries but keeps their valid siblings", async () => {
  const store = memory_store();
  await store.setItemAsync(
    KEY_MANIFEST_NAME,
    JSON.stringify({
      version: 1,
      active_id: profile.id,
      profiles: [
        { ...profile, provider: "some_other_provider" },
        { ...profile, label: "   " },
        { ...profile, label: "x".repeat(200) },
        { ...profile, id: "not a valid id" },
        { ...profile, model: 7 },
        {
          id: "key_2_1",
          provider: "anthropic",
          label: "Claude",
          // Present but empty: the row still renders, and the field is not a
          // credential either way.
          base_url: "",
          model: "",
        },
      ],
    }),
  );
  const manifest = await read_manifest(store);
  expect(manifest!.profiles).toEqual([
    {
      id: "key_2_1",
      provider: "anthropic",
      label: "Claude",
      // Present but empty: the row still renders, and the field is not a
      // credential either way.
      base_url: "",
      model: "",
    },
  ]);
  // The active id pointed at a dropped entry, so it cannot stay active.
  expect(manifest!.active_id).toBeNull();
});

it("bounds the number of recovered profiles", async () => {
  const store = memory_store();
  await store.setItemAsync(
    KEY_MANIFEST_NAME,
    JSON.stringify({
      version: 1,
      active_id: null,
      profiles: Array.from({ length: 200 }, (_, index) => ({
        ...profile,
        id: `key_${index}_1`,
      })),
    }),
  );
  expect((await read_manifest(store))!.profiles).toHaveLength(64);
});

it("never throws when the storage layer itself fails", async () => {
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
  // Callers use the manifest as a last resort during recovery. A second throw
  // there would replace a readable message with a crash.
  await expect(read_manifest(failing)).resolves.toBeNull();
  await expect(
    write_manifest(failing, { active_id: null, profiles: [] }),
  ).resolves.toBeUndefined();
  await expect(clear_manifest(failing)).resolves.toBeUndefined();
});

it("clears the manifest on request", async () => {
  const store = memory_store();
  await write_manifest(store, { active_id: null, profiles: [profile] });
  await clear_manifest(store);
  expect(await read_manifest(store)).toBeNull();
});

it("does not write on a read", async () => {
  const store = memory_store();
  const set = jest.fn(store.setItemAsync);
  const remove = jest.fn(store.removeItemAsync);
  await read_manifest({ ...store, setItemAsync: set, removeItemAsync: remove });
  expect(set).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});
