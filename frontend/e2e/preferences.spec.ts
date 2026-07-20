import { expect, test } from "@playwright/test";

test.describe("language toggle", () => {
  test("switches UI text between Japanese and English", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "ページを追加" })).toBeVisible();

    await page.getByRole("button", { name: "English" }).click();

    await expect(page.getByRole("heading", { name: "Add pages" })).toBeVisible();
    await expect(page.getByText("Drag & drop your photos here")).toBeVisible();
  });

  test("persists the selected language across reloads", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("heading", { name: "Add pages" })).toBeVisible();

    await page.reload();

    await expect(page.getByRole("heading", { name: "Add pages" })).toBeVisible();
  });
});

test.describe("theme toggle", () => {
  test("switches the data-theme attribute on <html>", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "ダーク" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: "ライト" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("defaults to the OS color scheme when no preference is stored", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
