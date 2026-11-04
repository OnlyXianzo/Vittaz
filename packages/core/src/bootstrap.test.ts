import { expect, test } from "vitest";
import { VERSION } from "./index.js";

test("core_version_is_available", () => {
  expect(VERSION).toBe("0.0.1");
});
