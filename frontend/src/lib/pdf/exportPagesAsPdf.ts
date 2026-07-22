import { flattenPagesForExport, type PageImage } from "@/state/pageImages";
import { buildPdf } from "./buildPdf";
import { resolvePagesToJpeg } from "./resolvePageImage";
import { triggerDownload } from "./triggerDownload";

/**
 * 確定したページ順で画像をPDF化し、ブラウザのダウンロードとしてトリガーする。
 * JPEG再エンコード・PDF組み立て・ダウンロードのいずれもDOM依存/pdf-lib呼び出しを
 * 含むため、このオーケストレーション自体はユニットテスト対象外とする
 * (resolvePageImage.ts/triggerDownload.tsと同じ方針)。手動確認・Playwright e2eで検証する。
 */
export async function exportPagesAsPdf(images: PageImage[], filename = "booktopdf.pdf"): Promise<void> {
  const flattened = flattenPagesForExport(images);
  const resolved = await resolvePagesToJpeg(flattened);
  const pdfBytes = await buildPdf(resolved);
  triggerDownload(pdfBytes, filename);
}
