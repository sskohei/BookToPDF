import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { waitForProcessingToSettle } from "./testUtils";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

async function dragHandle(page: Page, testId: string, dx: number, dy: number) {
  const handle = page.getByTestId(testId);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`handle ${testId} has no bounding box`);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 8 });
  await page.mouse.up();
}

test.describe("corner editor", () => {
  test("dragging a corner handle re-runs correction with the adjusted quad", async ({ page }) => {
    await page.goto("/");

    const fileInput = page.locator('input[type="file"]:not([capture])');
    await fileInput.setInputFiles(fixture("page-rect.png"));
    await waitForProcessingToSettle(page);

    const correctedImage = page.getByRole("img", { name: /補正済み/ });
    await expect(correctedImage).toBeVisible();
    const srcBefore = await correctedImage.getAttribute("src");

    await page.getByRole("button", { name: "p.1 の四隅を調整" }).click();
    await expect(page.getByTestId("corner-editor")).toBeVisible();

    await dragHandle(page, "corner-handle-bottomRight", -40, -40);

    await page.getByRole("button", { name: "この位置で補正" }).click();
    await expect(page.getByTestId("corner-editor")).toHaveCount(0);
    await waitForProcessingToSettle(page);

    await expect(correctedImage).toBeVisible();
    const srcAfter = await correctedImage.getAttribute("src");
    expect(srcAfter).not.toBe(srcBefore);
  });

  test("a fully-failed detection can still be corrected via manual corner placement", async ({
    page,
  }) => {
    await page.goto("/");

    const fileInput = page.locator('input[type="file"]:not([capture])');
    await fileInput.setInputFiles(fixture("page-1.png"));
    await waitForProcessingToSettle(page);

    await expect(page.getByTestId("preview-status-failed")).toBeVisible();

    await page.getByRole("button", { name: "p.1 の四隅を調整" }).click();
    await expect(page.getByTestId("corner-editor")).toBeVisible();

    await dragHandle(page, "corner-handle-topLeft", 10, 10);
    await dragHandle(page, "corner-handle-bottomRight", -10, -10);

    await page.getByRole("button", { name: "この位置で補正" }).click();
    await expect(page.getByTestId("corner-editor")).toHaveCount(0);
    await waitForProcessingToSettle(page);

    await expect(page.getByTestId("preview-status-failed")).toHaveCount(0);
    await expect(page.getByRole("img", { name: /補正済み/ })).toBeVisible();
  });
});
