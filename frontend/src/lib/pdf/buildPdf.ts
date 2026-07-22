import { PDFDocument } from "pdf-lib";
import type { ResolvedJpegPage } from "./resolvePageImage";

/**
 * 確定したページ順のJPEGバイト列から1つのPDFを組み立てる。pdf-lib自体はDOMに
 * 依存しないため、Vitest(environment: "node")でユニットテスト可能。
 * 各ページはJPEG画像の実寸(embedJpgが解析するintrinsic width/height)と同じ
 * サイズのPDFページとして追加する(拡大縮小・余白なし)。
 */
export async function buildPdf(pages: ResolvedJpegPage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const page of pages) {
    const jpg = await doc.embedJpg(page.jpegBytes);
    const pdfPage = doc.addPage([jpg.width, jpg.height]);
    pdfPage.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height });
  }
  return doc.save();
}
