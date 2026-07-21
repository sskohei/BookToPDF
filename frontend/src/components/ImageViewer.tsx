"use client";

import { useEffect } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";
import type { PageImage } from "@/state/pageImages";
import { CloseIcon } from "./icons";

type ImageViewerProps = {
  image: PageImage;
  index: number;
  onClose: () => void;
};

export function ImageViewer({ image, index, onClose }: ImageViewerProps) {
  const { t } = useLanguage();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const isDetecting = image.corners === undefined;
  const detectionFailed = image.corners === null;
  const isCorrecting = !isDetecting && !detectionFailed && image.processedPreviewUrls === undefined;
  const correctionFailed = image.processedPreviewUrls?.length === 0;
  const correctedUrls = image.processedPreviewUrls;
  const showOriginal = !correctedUrls || correctedUrls.length === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("previewGrid.pageBadge", { index })}
      data-testid="image-viewer"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[var(--overlay-backdrop)] p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col items-center rounded-2xl bg-[var(--panel-bg)] p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("imageViewer.close")}
          className="cursor-pointer absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white"
        >
          <CloseIcon />
        </button>

        <div className="mb-3 flex w-full items-center gap-2">
          <span className="rounded-full bg-[var(--chip-bg)] px-3 py-1 text-xs font-bold text-[var(--chip-fg)]">
            {t("previewGrid.pageBadge", { index })}
          </span>
          {(isDetecting || isCorrecting) && (
            <span className="rounded bg-black/45 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {t("previewGrid.processing")}
            </span>
          )}
          {(detectionFailed || correctionFailed) && (
            <span className="rounded bg-red-600/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {t("previewGrid.detectionFailed")}
            </span>
          )}
        </div>

        <div className="flex min-h-0 w-full justify-center overflow-auto">
          {showOriginal ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob: object URLs aren't supported by next/image
            <img
              src={image.previewUrl}
              alt={t("previewGrid.previewAlt", { index })}
              className="max-h-[70vh] max-w-full rounded-xl object-contain"
            />
          ) : (
            <div className="flex max-h-[70vh] gap-2">
              {correctedUrls.map((url, halfIndex) => (
                <div key={url} className="relative flex max-h-[70vh]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob: object URLs aren't supported by next/image */}
                  <img
                    src={url}
                    alt={t("previewGrid.correctedAlt", { index })}
                    className="max-h-[70vh] max-w-full rounded-xl object-contain"
                  />
                  {correctedUrls.length > 1 && (
                    <span className="absolute top-1 left-1 rounded bg-black/45 px-1 py-0.5 text-[10px] font-bold text-white">
                      {t(halfIndex === 0 ? "previewGrid.leftPage" : "previewGrid.rightPage")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
