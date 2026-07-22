import { EXPORT_JPEG_QUALITY } from "./jpegQuality";

/**
 * FlattenedPageのblob URL(補正済みならPNG、未処理/補正失敗なら元ファイル形式)を
 * 一律JPEGバイト列へ再エンコードする。DOMのCanvas APIおよびfetch(blob:)に直接
 * 依存するため、Vitest(environment: "node")ではテストできない。手動確認/Playwright
 * e2eでのみ検証する(lib/cv/browserImage.tsと同じ方針)。
 *
 * imageDataToObjectUrl(lib/cv/browserImage.ts)は画面プレビュー用の可逆PNG生成に
 * 使われている共有関数のため、ここでは変更・再利用しない。PDF出力用のJPEG化は
 * 完全に独立した経路として実装する。
 */

export type ResolvedJpegPage = {
  id: string;
  jpegBytes: Uint8Array;
};

export async function blobUrlToJpegBytes(url: string): Promise<Uint8Array> {
  const blob = await (await fetch(url)).blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context is not available");
    }
    ctx.drawImage(bitmap, 0, 0);
    const jpegBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", EXPORT_JPEG_QUALITY),
    );
    if (!jpegBlob) {
      throw new Error("failed to encode page to JPEG");
    }
    return new Uint8Array(await jpegBlob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

export async function resolvePagesToJpeg(
  pages: { id: string; previewUrl: string }[],
): Promise<ResolvedJpegPage[]> {
  return Promise.all(
    pages.map(async (page) => ({ id: page.id, jpegBytes: await blobUrlToJpegBytes(page.previewUrl) })),
  );
}
