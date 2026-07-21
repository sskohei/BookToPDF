import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

/**
 * dnd-kit はポインタイベント方式のドラッグ判定をしているため、Playwright の
 * `locator.dragTo()`(HTML5 Drag and Drop 前提)は使えない。マウスの
 * down/move/up を手動でシミュレートする。
 */
async function dragTile(page: Page, fromHandle: Locator, toTile: Locator) {
  const from = await fromHandle.boundingBox();
  const to = await toTile.boundingBox();
  if (!from || !to) throw new Error("could not measure drag source/target");

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
}

async function previewSrcs(page: Page): Promise<string[]> {
  return page.locator('[data-testid="preview-tile"] img').evaluateAll((imgs) =>
    imgs.map((img) => (img as HTMLImageElement).src),
  );
}

test.describe("page reorder", () => {
  test("drag-and-drop reorders the page thumbnails", async ({ page }) => {
    await page.goto("/");

    const fileInput = page.locator('input[type="file"]:not([capture])');
    await fileInput.setInputFiles([fixture("page-1.png"), fixture("page-2.png"), fixture("page-rect.png")]);
    await expect(page.getByTestId("page-count")).toHaveText("3枚");

    const before = await previewSrcs(page);
    expect(before).toHaveLength(3);

    const tiles = page.getByTestId("preview-tile");
    await dragTile(
      page,
      tiles.nth(0).getByRole("button", { name: /ドラッグして並び替え/ }),
      tiles.nth(2),
    );

    const after = await previewSrcs(page);
    expect(after).toEqual([before[1], before[2], before[0]]);
  });

  test("deleting after a reorder removes the correct page", async ({ page }) => {
    await page.goto("/");

    const fileInput = page.locator('input[type="file"]:not([capture])');
    await fileInput.setInputFiles([fixture("page-1.png"), fixture("page-2.png"), fixture("page-rect.png")]);
    await expect(page.getByTestId("page-count")).toHaveText("3枚");

    const before = await previewSrcs(page);
    const tiles = page.getByTestId("preview-tile");
    await dragTile(
      page,
      tiles.nth(0).getByRole("button", { name: /ドラッグして並び替え/ }),
      tiles.nth(2),
    );
    // Order is now [before[1], before[2], before[0]]; delete the new first tile.
    await page.getByRole("button", { name: "p.1 を削除" }).click();

    await expect(page.getByTestId("page-count")).toHaveText("2枚");
    const after = await previewSrcs(page);
    expect(after).toEqual([before[2], before[0]]);
  });
});
