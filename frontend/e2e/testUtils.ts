import { expect, type Page } from "@playwright/test";

export async function waitForProcessingToSettle(page: Page) {
  await expect(page.getByTestId("preview-status-processing")).toHaveCount(0);
}
