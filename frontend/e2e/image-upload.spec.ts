import path from "node:path";
import { expect, test } from "@playwright/test";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

test.describe("image upload", () => {
  test("selecting files shows thumbnails and updates the count", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("page-count")).toHaveText("0枚");

    const fileInput = page.locator('input[type="file"]:not([capture])');
    await fileInput.setInputFiles([fixture("page-1.png"), fixture("page-2.png")]);

    await expect(page.getByTestId("page-count")).toHaveText("2枚");
    await expect(page.getByRole("img", { name: /プレビュー/ })).toHaveCount(2);
  });

  test("removing a thumbnail decreases the count", async ({ page }) => {
    await page.goto("/");

    const fileInput = page.locator('input[type="file"]:not([capture])');
    await fileInput.setInputFiles([fixture("page-1.png"), fixture("page-2.png")]);
    await expect(page.getByTestId("page-count")).toHaveText("2枚");

    await page.getByRole("button", { name: "p.1 を削除" }).click();

    await expect(page.getByTestId("page-count")).toHaveText("1枚");
    await expect(page.getByRole("img", { name: /プレビュー/ })).toHaveCount(1);
  });

  test("selecting files again appends to the existing list", async ({ page }) => {
    await page.goto("/");

    const fileInput = page.locator('input[type="file"]:not([capture])');
    await fileInput.setInputFiles([fixture("page-1.png")]);
    await expect(page.getByTestId("page-count")).toHaveText("1枚");

    await fileInput.setInputFiles([fixture("page-1.png"), fixture("page-2.png")]);

    await expect(page.getByTestId("page-count")).toHaveText("3枚");
  });

  test("the camera button opens a file input with capture=environment", async ({ page }) => {
    await page.goto("/");

    const cameraInput = page.locator("input[capture='environment']");
    await expect(cameraInput).toHaveAttribute("accept", "image/*");
    await expect(cameraInput).toHaveAttribute("multiple", "");
  });
});
