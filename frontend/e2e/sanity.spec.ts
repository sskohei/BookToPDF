import { expect, test } from "@playwright/test";

test("top page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toBeVisible();
});
