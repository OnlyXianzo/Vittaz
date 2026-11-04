import { expect, test } from "@playwright/test";

test("home renders and bottom navigation works", async ({ page }) => {
  await page.goto("/");
  const device = page.getByRole("main");
  await expect(device.getByText("Vittaz", { exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: "Ledger" })
    .click();
  await expect(device.getByText("This month")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: /Inbox/ })
    .click();
  await expect(device.getByText("Pending inbox")).toBeVisible();
});

test("manual entry flow saves to the preview ledger", async ({ page }) => {
  await page.goto("/");
  const device = page.getByRole("main");
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: "Ledger" })
    .click();
  await device.getByRole("button", { name: "Add transaction" }).click();
  await device.getByLabel("Amount").fill("250");
  await device.getByRole("button", { name: "Save transaction" }).click();
  await expect(device.getByText("₹250")).toBeVisible();
});

test("quick ingestion creates an approval card", async ({ page }) => {
  await page.goto("/");
  const device = page.getByRole("main");
  await device.getByRole("button", { name: /Add or ask by message/ }).click();
  await device.getByLabel("Transaction text").fill("I spent 299 on Zomato");
  await device.getByRole("button", { name: "Analyze" }).click();
  await expect(
    device.getByText(
      "I drafted this entry. Nothing is saved until you approve it.",
    ),
  ).toBeVisible();
  await device.getByRole("button", { name: "Approve" }).click();
  await expect(device.getByText(/Approved\. The preview ledger/)).toBeVisible();
});

test("onboarding completes from settings", async ({ page }) => {
  await page.goto("/");
  const device = page.getByRole("main");
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: "Settings" })
    .click();
  await device.getByRole("button", { name: /Replay onboarding/ }).click();
  await device.getByRole("button", { name: "Get started" }).click();
  await device.getByRole("button", { name: "Continue" }).click();
  await device.getByRole("button", { name: "Finish setup" }).click();
  await expect(device.getByText("Pending review")).toBeVisible();
});
