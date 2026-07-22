import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

async function waitForProcessingToSettle(page: Page) {
  await expect(page.getByTestId("preview-status-processing")).toHaveCount(0);
}

test.describe("spread photo detection", () => {
  test("a spread photo is split into two corrected pages, not silently dropped", async ({ page }) => {
    await page.goto("/");

    const fileInput = page.locator('input[type="file"]:not([capture])');
    await fileInput.setInputFiles(fixture("page-spread.png"));
    await waitForProcessingToSettle(page);

    await expect(page.getByTestId("preview-status-failed")).toHaveCount(0);
    await expect(page.getByRole("img", { name: /補正済み/ })).toHaveCount(2);
  });
});
