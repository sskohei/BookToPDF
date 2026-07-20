"use client";

import { useRef, useState } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";
import { usePageImages } from "@/state/usePageImages";
import { PreviewGrid } from "./PreviewGrid";
import { CameraIcon, FileIcon, TipIcon, UploadCloudIcon } from "./icons";

type CaptureProps = {
  /**
   * 0-100 の進捗。issue#4以降の画像処理パイプラインが実装され、実際に処理が
   * 走っている間だけ値を渡す想定。未指定の間は進捗バーごと表示しない。
   */
  uploadProgress?: number;
};

export function Capture({ uploadProgress }: CaptureProps) {
  const { images, addFiles, removeImage } = usePageImages();
  const { t } = useLanguage();
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setIsDraggingOver(false);
    if (event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files);
    }
  };

  return (
    <div
      className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10"
      onDragOver={(event) => {
        event.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        multiple
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--text)] sm:text-2xl">
          {images.length === 0 ? t("capture.title.empty") : t("capture.title.filled")}
        </h1>
        <span
          data-testid="page-count"
          className="whitespace-nowrap rounded-full bg-[var(--chip-bg)] px-3 py-1 text-xs font-bold text-[var(--chip-fg)]"
        >
          {t("capture.pageCount", { count: images.length })}
        </span>
      </div>

      {images.length === 0 ? (
        <div
          className={`flex flex-col items-center rounded-[20px] border-2 border-dashed px-5 py-11 text-center transition-colors ${
            isDraggingOver
              ? "border-[var(--chip-fg)] bg-[var(--drop-bg)]"
              : "border-[var(--drop-border)] bg-[var(--drop-bg)]"
          }`}
        >
          <div className="mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[#f97316] text-white shadow-[0_12px_22px_rgba(249,115,22,0.3)] sm:h-16 sm:w-16">
            <UploadCloudIcon />
          </div>
          <p className="mb-5 text-sm font-bold text-[var(--text)] sm:text-base">
            {t("capture.dropzone.label")}
          </p>
          <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 rounded-full bg-[#f97316] px-4 py-2.5 text-sm font-bold text-white"
            >
              <CameraIcon />
              {t("capture.button.camera")}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 rounded-full border border-[var(--ghost-border)] bg-[var(--ghost-bg)] px-4 py-2.5 text-sm font-bold text-[var(--chip-fg)]"
            >
              <FileIcon />
              {t("capture.button.chooseFiles")}
            </button>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-[var(--tip-bg)] p-3 text-left">
            <TipIcon className="mt-0.5 shrink-0 text-[var(--tip-icon)]" />
            <p className="m-0 text-[11.5px] leading-relaxed text-[var(--muted)]">
              <b className="text-[var(--tip-label)]">{t("capture.tip.label")}</b>{" "}
              {t("capture.tip.body")}
            </p>
          </div>
          <p className="mt-3.5 text-[11px] font-medium text-[var(--faint)]">
            {t("capture.footnote")}
          </p>
        </div>
      ) : (
        <>
          {uploadProgress !== undefined && (
            <div className="mb-[18px]">
              <div className="mb-1 flex justify-between text-[11.5px] font-semibold">
                <span className="text-[var(--muted)]">
                  {t("capture.uploading", { progress: Math.round(uploadProgress) })}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--track)]">
                <div
                  className="h-full rounded-full bg-[#f97316]"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <PreviewGrid
            images={images}
            onRemove={removeImage}
            onAddMore={() => fileInputRef.current?.click()}
          />

          <button
            type="button"
            className="mt-[18px] w-full rounded-full bg-[#f97316] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_20px_rgba(249,115,22,0.28)] sm:w-auto"
          >
            {t("capture.uploadButton", { count: images.length })}
          </button>
        </>
      )}
    </div>
  );
}
