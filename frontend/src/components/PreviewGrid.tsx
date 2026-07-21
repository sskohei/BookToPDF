"use client";

import { useLanguage } from "@/i18n/LanguageProvider";
import type { PageImage } from "@/state/pageImages";
import { AdjustIcon, CloseIcon, PlusIcon } from "./icons";

type PreviewGridProps = {
  images: PageImage[];
  onRemove: (id: string) => void;
  onAddMore: () => void;
  onAdjust: (id: string) => void;
};

export function PreviewGrid({ images, onRemove, onAddMore, onAdjust }: PreviewGridProps) {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(104px,1fr))]">
      {images.map((image, index) => {
        const isDetecting = image.corners === undefined;
        const detectionFailed = image.corners === null;
        const isCorrecting = !isDetecting && !detectionFailed && image.processedPreviewUrls === undefined;
        const correctionFailed = image.processedPreviewUrls?.length === 0;
        const correctedUrls = image.processedPreviewUrls;

        return (
          <div
            key={image.id}
            data-testid="preview-tile"
            className="relative aspect-[3/4] overflow-hidden rounded-xl ring-1 ring-[var(--thumb-ring)]"
          >
            {correctedUrls && correctedUrls.length > 0 ? (
              <div className="flex h-full w-full gap-px">
                {correctedUrls.map((url, halfIndex) => (
                  <div key={url} className="relative h-full flex-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- blob: object URLs aren't supported by next/image */}
                    <img
                      src={url}
                      alt={t("previewGrid.correctedAlt", { index: index + 1 })}
                      className="h-full w-full object-cover"
                    />
                    {correctedUrls.length > 1 && (
                      <span className="absolute top-1 left-1 rounded bg-black/45 px-1 py-0.5 text-[8px] font-bold text-white">
                        {t(halfIndex === 0 ? "previewGrid.leftPage" : "previewGrid.rightPage")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- blob: object URLs aren't supported by next/image
              <img
                src={image.previewUrl}
                alt={t("previewGrid.previewAlt", { index: index + 1 })}
                className="h-full w-full object-cover"
              />
            )}

            {(isDetecting || isCorrecting) && (
              <span
                data-testid="preview-status-processing"
                className="absolute top-1 left-1 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-bold text-white"
              >
                {t("previewGrid.processing")}
              </span>
            )}
            {(detectionFailed || correctionFailed) && (
              <span
                data-testid="preview-status-failed"
                className="absolute top-1 left-1 rounded bg-red-600/80 px-1.5 py-0.5 text-[9px] font-bold text-white"
              >
                {t("previewGrid.detectionFailed")}
              </span>
            )}

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
            {!isDetecting && (
              <button
                type="button"
                onClick={() => onAdjust(image.id)}
                aria-label={t("previewGrid.adjustAria", { index: index + 1 })}
                className="cursor-pointer absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white"
              >
                <AdjustIcon />
              </button>
            )}
          </div>
        );
      })}
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
