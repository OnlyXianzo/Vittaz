import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  clear_provider_health,
  cooldown_remaining_seconds,
  read_provider_health,
  record_provider_outcome,
  reset_provider_health,
} from "./provider_health";

beforeEach(() => {
  reset_provider_health();
});

describe("provider health", () => {
  it("holds a rate-limited profile back for the default window", () => {
    // Each question builds a fresh agent, so this record is the only thing that
    // makes the second tap behave differently from the first.
    record_provider_outcome("profile_one", "rate_limited", 1_000);
    expect(cooldown_remaining_seconds("profile_one", 1_000)).toBe(30);
    expect(cooldown_remaining_seconds("profile_one", 16_000)).toBe(15);
    expect(cooldown_remaining_seconds("profile_one", 31_000)).toBe(0);
  });

  it("honours a cooldown the provider asked for", () => {
    record_provider_outcome("profile_one", "rate_limited", 0, 7_000);
    expect(cooldown_remaining_seconds("profile_one", 0)).toBe(7);
  });

  it("caps an unreasonable cooldown instead of disabling the key", () => {
    record_provider_outcome("profile_one", "rate_limited", 0, 1e15);
    expect(cooldown_remaining_seconds("profile_one", 0)).toBe(86_400);
  });

  it("never returns a negative wait for a stale entry", () => {
    record_provider_outcome("profile_one", "rate_limited", 0, 1_000);
    expect(cooldown_remaining_seconds("profile_one", 10_000)).toBe(0);
  });

  it("does not hold a key back for reasons that are not the key's fault", () => {
    record_provider_outcome("profile_one", "auth_failed", 0);
    expect(cooldown_remaining_seconds("profile_one", 0)).toBe(0);
    record_provider_outcome("profile_one", "connection_failed", 0);
    expect(cooldown_remaining_seconds("profile_one", 0)).toBe(0);
  });

  it("records the last outcome and forgets it after a success", () => {
    record_provider_outcome("profile_one", "rate_limited", 0);
    expect(read_provider_health("profile_one")).toMatchObject({
      outcome: "rate_limited",
      at: 0,
    });
    clear_provider_health("profile_one");
    expect(read_provider_health("profile_one")).toBeUndefined();
    expect(cooldown_remaining_seconds("profile_one", 0)).toBe(0);
  });

  it("keeps profiles separate", () => {
    record_provider_outcome("profile_one", "rate_limited", 0);
    expect(cooldown_remaining_seconds("profile_two", 0)).toBe(0);
  });
});
