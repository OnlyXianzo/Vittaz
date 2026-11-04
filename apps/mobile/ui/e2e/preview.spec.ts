import { expect, test } from "@playwright/test";

test("opens in the chat window and drafts an entry from a message", async ({
  page,
}) => {
  await page.goto("/");
  const device = page.getByRole("main");
  await expect(
    device.getByRole("heading", { name: "Vittaz AI", level: 1 }),
  ).toBeVisible();
  await device.getByLabel("Message").fill("I spent 250 on Zomato");
  await device.getByRole("button", { name: "Send", exact: true }).click();
  await expect(device.getByText("privacy_scan")).toBeVisible();
  await expect(device.getByText("propose_transaction")).toBeVisible();
  await expect(
    device.getByText(/Nothing is saved until you approve it/),
  ).toBeVisible();
  await device.getByRole("button", { name: "Approve" }).click();
  await expect(device.getByText(/Approved\. The preview ledger/)).toBeVisible();
});

test("pasted text goes straight to the assistant", async ({ page }) => {
  await page.goto("/");
  const device = page.getByRole("main");
  const input = device.getByLabel("Message");
  await input.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text", "Paid 450 to Aman for lunch");
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  const conversation = device.getByLabel("Conversation");
  await expect(conversation).toContainText("Paid 450 to Aman for lunch");
  await expect(
    device.getByText(/Nothing is saved until you approve it/),
  ).toBeVisible();
});

test("hides account numbers and phone numbers before the assistant reads them", async ({
  page,
}) => {
  await page.goto("/");
  const device = page.getByRole("main");
  await device.getByRole("button", { name: "Add to chat" }).click();
  await device.getByRole("button", { name: "Bank SMS sample" }).click();
  const conversation = device.getByLabel("Conversation");
  await expect(conversation).toContainText("[account hidden]");
  await expect(conversation).not.toContainText("50100234567890");
  await expect(conversation).not.toContainText("9876543210");
  await expect(
    device.getByText(/Hidden before sending: account number, phone number/),
  ).toBeVisible();
  await expect(
    device.getByText(/Removed account number, phone number/),
  ).toBeVisible();
});

test("calls the mock Telegram tool and shows the message preview", async ({
  page,
}) => {
  await page.goto("/");
  const device = page.getByRole("main");
  await device
    .getByRole("button", { name: "Send my summary to Telegram" })
    .click();
  await expect(device.getByText("telegram_send_message")).toBeVisible();
  await expect(device.getByText("Mock delivery")).toBeVisible();
  await expect(device.getByText(/Vittaz daily summary \(mock\)/)).toBeVisible();
  await expect(
    device.getByText(
      /Nothing was sent\. Pairing a real bot is a backend feature\./,
    ),
  ).toBeVisible();
});

test("manual entry from the ledger panel saves to the preview ledger", async ({
  page,
}) => {
  await page.goto("/");
  const device = page.getByRole("main");
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: "Ledger" })
    .click();
  const panel = device.getByRole("dialog");
  await panel.getByRole("button", { name: "Add transaction" }).click();
  await panel.getByLabel("Amount").fill("250");
  await panel.getByRole("button", { name: "Save transaction" }).click();
  await expect(panel.getByText("₹250")).toBeVisible();
});

test("panels open over the chat and Escape closes them", async ({ page }) => {
  await page.goto("/");
  const device = page.getByRole("main");
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: "Ledger" })
    .click();
  const heading = device.getByRole("heading", { name: "Ledger", level: 1 });
  await expect(heading).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(device.getByRole("dialog")).toHaveCount(0);
  await expect(
    device.getByRole("heading", { name: "Vittaz AI", level: 1 }),
  ).toBeFocused();
});

test("onboarding completes from settings and returns to the chat", async ({
  page,
}) => {
  await page.goto("/");
  const device = page.getByRole("main");
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: "Settings" })
    .click();
  const panel = device.getByRole("dialog");
  await panel.getByRole("button", { name: /Replay onboarding/ }).click();
  await panel.getByRole("button", { name: "Get started" }).click();
  await panel.getByRole("button", { name: "Continue" }).click();
  await panel.getByRole("button", { name: "Finish setup" }).click();
  await expect(device.getByRole("dialog")).toHaveCount(0);
  await expect(
    device.getByRole("heading", { name: "Vittaz AI", level: 1 }),
  ).toBeVisible();
});
