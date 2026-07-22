"use client";

import { useState } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";
import { exportPagesAsPdf } from "@/lib/pdf";
import type { PageImage } from "@/state/pageImages";

type ExportButtonProps = {
  images: PageImage[];
  disabled?: boolean;
};

export function ExportButton({ images, disabled }: ExportButtonProps) {
  const { t } = useLanguage();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setError(null);
    setIsExporting(true);
    try {
      await exportPagesAsPdf(images);
    } catch (err) {
      console.error("PDF export failed", err);
      setError(t("capture.exportError"));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="mt-[18px]">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isExporting}
        data-testid="export-button"
        className="cursor-pointer w-full rounded-full bg-[#f97316] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_20px_rgba(249,115,22,0.28)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {isExporting ? t("capture.exporting") : t("capture.exportButton", { count: images.length })}
      </button>
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
