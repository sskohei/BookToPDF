/**
 * File/Blob ⇔ ImageData ⇔ 表示用URLの変換。DOMのCanvas APIに直接依存するため、
 * Vitest(`environment: "node"`、jsdom/canvas未導入)ではテストできない。
 * 手動確認(実ブラウザでのアップロード)でのみ検証する。
 */

export async function fileToImageData(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context is not available");
    }
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
}

export async function imageDataToObjectUrl(imageData: ImageData): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas context is not available");
  }
  ctx.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
  if (!blob) {
    throw new Error("failed to encode processed image to a Blob");
  }
  return URL.createObjectURL(blob);
}
