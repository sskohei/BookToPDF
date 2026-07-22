import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildPdf } from "./buildPdf";

// 2x3のごく小さな実JPEG(赤)と4x2の実JPEG(緑)。embedJpgは実際にJPEGヘッダを
// パースして寸法を読むため、ダミーバイト列では検証できない。
const TINY_JPEG_2X3 =
  "/9j/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAADAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABwn/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdAAYqm//Z";
const TINY_JPEG_4X2 =
  "/9j/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAACAn/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwC7AB9OJ//Z";

function jpegBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

describe("buildPdf", () => {
  it("returns a loadable PDF when given no pages", async () => {
    const bytes = await buildPdf([]);

    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    await expect(PDFDocument.load(bytes)).resolves.toBeInstanceOf(PDFDocument);
  });

  it("embeds a single page sized to the JPEG's intrinsic dimensions", async () => {
    const bytes = await buildPdf([{ id: "a", jpegBytes: jpegBytes(TINY_JPEG_2X3) }]);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 2, height: 3 });
  });

  it("preserves input order across multiple pages of differing sizes", async () => {
    const bytes = await buildPdf([
      { id: "a", jpegBytes: jpegBytes(TINY_JPEG_2X3) },
      { id: "b", jpegBytes: jpegBytes(TINY_JPEG_4X2) },
      { id: "c", jpegBytes: jpegBytes(TINY_JPEG_2X3) },
    ]);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(0).getSize()).toEqual({ width: 2, height: 3 });
    expect(doc.getPage(1).getSize()).toEqual({ width: 4, height: 2 });
    expect(doc.getPage(2).getSize()).toEqual({ width: 2, height: 3 });
  });
});
