import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

async function waitForProcessingToSettle(page: Page) {
  await expect(page.getByTestId("preview-status-processing")).toHaveCount(0);
}

test.describe("image viewer", () => {
  test("clicking a corrected thumbnail opens an enlarged view", async ({ page }) => {
    await page.goto("/");

    const fileInput = page.locator('input[type="file"]:not([capture])');
    await fileInput.setInputFiles(fixture("page-rect.png"));
    await waitForProcessingToSettle(page);

    await expect(page.getByRole("img", { name: /補正済み/ })).toBeVisible();

    await page.getByRole("button", { name: "p.1 を拡大表示" }).click();

    const viewer = page.getByTestId("image-viewer");
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole("img", { name: /補正済み/ })).toBeVisible();

    await page.getByRole("button", { name: "閉じる" }).click();
    await expect(viewer).toHaveCount(0);
  });

  test("clicking a thumbnail with failed detection shows the original preview and closes on Escape", async ({
    page,
  }) => {
    await page.goto("/");

    const fileInput = page.locator('input[type="file"]:not([capture])');
    await fileInput.setInputFiles(fixture("page-1.png"));
    await waitForProcessingToSettle(page);

    await expect(page.getByTestId("preview-status-failed")).toBeVisible();

    await page.getByRole("button", { name: "p.1 を拡大表示" }).click();

    const viewer = page.getByTestId("image-viewer");
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole("img", { name: /プレビュー/ })).toBeVisible();
    await expect(viewer.getByText("検出できませんでした")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
  });
});
