"use client";

import { useLanguage } from "@/i18n/LanguageProvider";
import type { PageImage } from "@/state/pageImages";
import { CloseIcon, PlusIcon } from "./icons";

type PreviewGridProps = {
  images: PageImage[];
  onRemove: (id: string) => void;
  onAddMore: () => void;
};

export function PreviewGrid({ images, onRemove, onAddMore }: PreviewGridProps) {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(104px,1fr))]">
      {images.map((image, index) => (
        <div
          key={image.id}
          className="relative aspect-[3/4] overflow-hidden rounded-xl ring-1 ring-[var(--thumb-ring)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- blob: object URLs aren't supported by next/image */}
          <img
            src={image.previewUrl}
            alt={t("previewGrid.previewAlt", { index: index + 1 })}
            className="h-full w-full object-cover"
          />
          <span className="absolute bottom-1 left-1 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-bold text-white">
            {t("previewGrid.pageBadge", { index: index + 1 })}
          </span>
          <button
            type="button"
            onClick={() => onRemove(image.id)}
            aria-label={t("previewGrid.removeAria", { index: index + 1 })}
            className="cursor-pointer absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white"
          >
            <CloseIcon />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAddMore}
        className="cursor-pointer flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[var(--add-border)] text-[var(--chip-fg)]"
      >
        <PlusIcon />
        <span className="text-[10px] font-bold">{t("previewGrid.addTile")}</span>
      </button>
    </div>
  );
}
