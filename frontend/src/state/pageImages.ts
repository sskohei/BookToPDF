import type { Corners } from "../lib/cv/geometry";

export type PageImage = {
  id: string;
  file: File;
  previewUrl: string;
  /**
   * `undefined` = 四隅検出を未試行, `null` = 試行したが検出できなかった
   * （手動調整UIへのフォールバック対象）, `Corners` = 検出成功。
   */
  corners?: Corners | null;
  /**
   * 透視補正後のプレビューURL。`undefined` = 透視補正未処理、`[]` = 処理を試みたが
   * 1枚も補正できなかった、`string[]` = 補正済みプレビューURL(単ページなら1件・見開きなら最大2件)。
   */
  processedPreviewUrls?: string[];
};

type CreateObjectUrl = (file: File) => string;
type RevokeObjectUrl = (url: string) => void;

const defaultCreateObjectUrl: CreateObjectUrl = (file) =>
  URL.createObjectURL(file);
const defaultRevokeObjectUrl: RevokeObjectUrl = (url) =>
  URL.revokeObjectURL(url);

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function addPageImages(
  current: PageImage[],
  files: File[],
  createObjectUrl: CreateObjectUrl = defaultCreateObjectUrl,
): PageImage[] {
  const added = files.map((file) => ({
    id: createId(),
    file,
    previewUrl: createObjectUrl(file),
  }));
  return [...current, ...added];
}

export function removePageImage(
  current: PageImage[],
  id: string,
  revokeObjectUrl: RevokeObjectUrl = defaultRevokeObjectUrl,
): PageImage[] {
  const target = current.find((image) => image.id === id);
  if (target) {
    revokeObjectUrl(target.previewUrl);
    target.processedPreviewUrls?.forEach((url) => revokeObjectUrl(url));
  }
  return current.filter((image) => image.id !== id);
}

export function setPageImageCorners(
  current: PageImage[],
  id: string,
  corners: Corners | null,
): PageImage[] {
  return current.map((image) => (image.id === id ? { ...image, corners } : image));
}

export function setProcessedPreviewUrls(
  current: PageImage[],
  id: string,
  urls: string[],
  revokeObjectUrl: RevokeObjectUrl = defaultRevokeObjectUrl,
): PageImage[] {
  return current.map((image) => {
    if (image.id !== id) return image;
    image.processedPreviewUrls?.forEach((url) => revokeObjectUrl(url));
    return { ...image, processedPreviewUrls: urls };
  });
}
