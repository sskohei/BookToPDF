export type PageImage = {
  id: string;
  file: File;
  previewUrl: string;
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
  }
  return current.filter((image) => image.id !== id);
}
