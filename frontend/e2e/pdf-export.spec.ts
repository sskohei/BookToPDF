import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { expect, test } from "@playwright/test";
import { waitForProcessingToSettle } from "./testUtils";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

test.describe("pdf export", () => {
  test("downloads a PDF with one page per uploaded photo, in upload order", async ({ page }) => {
    await page.goto("/");

    const fileInput = page.locator('input[type="file"]:not([capture])');
    // page-rect.png auto-corrects to a real rectangle; page-1.png/page-2.png (1x1) fail
    // detection and fall back to their original pixel, exercising both code paths that
    // flattenPagesForExport has to handle.
    await fileInput.setInputFiles([fixture("page-rect.png"), fixture("page-1.png"), fixture("page-2.png")]);
    await waitForProcessingToSettle(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-button").click(),
    ]);

    expect(download.suggestedFilename()).toBe("booktopdf.pdf");
    const downloadPath = await download.path();
    if (!downloadPath) throw new Error("download did not complete");
    const bytes = await fs.readFile(downloadPath);

    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);

    // The corrected rectangle photo should end up meaningfully larger than the
    // 1x1 fallback pages, confirming real (not blank/placeholder) content was embedded.
    const rectPageSize = doc.getPage(0).getSize();
    expect(rectPageSize.width).toBeGreaterThan(1);
    expect(rectPageSize.height).toBeGreaterThan(1);
    expect(doc.getPage(1).getSize()).toEqual({ width: 1, height: 1 });
    expect(doc.getPage(2).getSize()).toEqual({ width: 1, height: 1 });
  });

  test("the export button is disabled while pages are still processing", async ({ page }) => {
    await page.goto("/");

    const fileInput = page.locator('input[type="file"]:not([capture])');
    await fileInput.setInputFiles(fixture("page-rect.png"));

    // Immediately after selecting files, detection/correction is still in flight.
    await expect(page.getByTestId("export-button")).toBeDisabled();

    await waitForProcessingToSettle(page);
    await expect(page.getByTestId("export-button")).toBeEnabled();
  });
});
