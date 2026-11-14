import { expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, View } from "react-native";
import { Button, Chip, IconBtn, PageHeader, SettingRow, T } from "./ui";
import { AddScreen } from "./screens/AddScreen";
import { ChatScreen } from "./screens/ChatScreen";

jest.mock("./store", () => ({
  useApp: () => ({
    state: {
      screen: "add",
      addDraft: {
        amount: "450",
        person: "Synthetic person with a long label",
        mode: "Cash",
        direction: "spent",
        category: "Food",
        note: "",
      },
      improvedNote: null,
      model: "auto",
      transactions: [],
      chatMessages: [],
      chatSteps: [],
      chatMode: "idle",
      chatInput: "",
      chatTokens: 0,
    },
    conversations: [],
    activeConversationId: null,
    changeConversation: jest.fn(),
    deleteConversation: jest.fn(),
    dispatch: jest.fn(),
  }),
}));

it("keeps long button labels reachable without a fixed height", async () => {
  const onPress = jest.fn();
  await render(
    <View style={{ width: 160 }}>
      <Button label="A long synthetic action label" small onPress={onPress} />
    </View>,
  );
  const button = screen.getByRole("button", {
    name: "A long synthetic action label",
  });
  const style = StyleSheet.flatten(button.props.style);
  expect(style.minHeight).toBeGreaterThanOrEqual(48);
  expect(style.minWidth).toBeGreaterThanOrEqual(48);
  expect(style.height).toBeUndefined();
  expect(style.paddingVertical).toBeGreaterThan(0);
  await fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});

it("gives chips and icon controls accessible touch targets", async () => {
  await render(
    <View>
      <Chip label="Synthetic category" selected={false} onPress={() => {}} />
      <IconBtn label="More options" onPress={() => {}}>
        <T>…</T>
      </IconBtn>
    </View>,
  );
  for (const name of ["Synthetic category", "More options"]) {
    const style = StyleSheet.flatten(
      screen.getByRole("button", { name }).props.style,
    );
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
    expect(style.height).toBeUndefined();
  }
});

it("allows a header title to shrink around persistent header actions", async () => {
  await render(
    <View style={{ width: 280 }}>
      <PageHeader
        title="A long synthetic page title"
        onBack={() => {}}
        right={
          <IconBtn label="More options" onPress={() => {}}>
            <T>…</T>
          </IconBtn>
        }
      />
    </View>,
  );
  const title = screen.getByRole("header", {
    name: "A long synthetic page title",
  });
  expect(StyleSheet.flatten(title.props.style).flexShrink).toBe(1);
  expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "More options" })).toBeTruthy();
});

it("allows settings statuses to wrap within narrow rows", async () => {
  await render(
    <View style={{ width: 240 }}>
      <SettingRow
        title="Synthetic provider"
        subtitle="Read-only questions"
        right={<T>Needs endpoint and API key</T>}
        onPress={() => {}}
      />
    </View>,
  );
  const row = screen.getByRole("button", { name: "Synthetic provider" });
  expect(StyleSheet.flatten(row.props.style).flexWrap).toBe("wrap");
  expect(screen.getByText("Needs endpoint and API key")).toBeTruthy();
});

it("lets person and payment mode fields wrap rather than share a cramped half width", async () => {
  await render(<AddScreen />);
  const mode = screen.getByRole("button", { name: "Mode" });
  expect(StyleSheet.flatten(mode.parent!.props.style).flexWrap).toBe("wrap");
  expect(screen.getByLabelText("Person").props.value).toContain(
    "Synthetic person",
  );
});

it("allows the chat composer to grow with enlarged input text", async () => {
  await render(<ChatScreen />);
  const composer = screen.getByRole("button", { name: "Send" }).parent!;
  const style = StyleSheet.flatten(composer.props.style);
  expect(style.height).toBeUndefined();
  expect(style.minHeight).toBeGreaterThanOrEqual(60);
  expect(screen.getByLabelText("Message")).toBeTruthy();
});

it("keeps the amount field within its available card width", async () => {
  await render(<AddScreen />);
  const style = StyleSheet.flatten(screen.getByLabelText("Amount").props.style);
  expect(style.minWidth).toBe(0);
  expect(style.flexShrink).toBe(1);
});
