import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { space } from "../../apps/mobile/src/theme.js";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("mobile_chat_uses_android_keyboard_resize_and_a_visible_composer_input", () => {
  const config = JSON.parse(read("apps/mobile/app.json")) as {
    expo?: { android?: { softwareKeyboardLayoutMode?: string } };
  };
  expect(config.expo?.android?.softwareKeyboardLayoutMode).toBe("resize");
  const chat_screen = read("apps/mobile/src/screens/ChatScreen.tsx").replace(
    /\s+/g,
    " ",
  );
  expect(chat_screen).toContain(
    'behavior={Platform.OS === "ios" ? "padding" : "height"}',
  );
  expect(chat_screen).toContain("minHeight: space.touchTarget");
  expect(space.touchTarget).toBeGreaterThanOrEqual(48);
  expect(chat_screen).toContain('textAlignVertical: "center"');
});
