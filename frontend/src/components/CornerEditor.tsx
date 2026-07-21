"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";
import type { TranslationKey } from "@/i18n/translations";
import {
  CORNER_ORDER,
  clampPointToBounds,
  defaultCorners,
  displayPointToImagePoint,
  imagePointToDisplayPoint,
  imageToDisplayScale,
  type CornerKey,
} from "@/lib/cv/cornerEditorGeometry";
import type { Corners } from "@/lib/cv/geometry";
import type { PageImage } from "@/state/pageImages";

type CornerEditorProps = {
  image: PageImage;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (corners: Corners) => void;
};

const HANDLE_LABEL_KEY: Record<CornerKey, TranslationKey> = {
  topLeft: "cornerEditor.handle.topLeft",
  topRight: "cornerEditor.handle.topRight",
  bottomRight: "cornerEditor.handle.bottomRight",
  bottomLeft: "cornerEditor.handle.bottomLeft",
};

export function CornerEditor({ image, isSubmitting, onCancel, onConfirm }: CornerEditorProps) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const draggingCorner = useRef<CornerKey | null>(null);

  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [renderedWidth, setRenderedWidth] = useState(0);
  // ユーザーがドラッグを始めるまではnull。それまでは`image.corners`(検出結果)または
  // `defaultCorners`(未検出/検出失敗時)から導出した値を表示する(useEffect+setStateで
  // 同期する必要がないよう、レンダー中に計算する)。
  const [userCorners, setUserCorners] = useState<Corners | null>(null);
  const corners = userCorners ?? (naturalSize ? (image.corners ?? defaultCorners(naturalSize)) : null);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setRenderedWidth(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const scale = useMemo(
    () => (naturalSize ? imageToDisplayScale(naturalSize, renderedWidth) : 1),
    [naturalSize, renderedWidth],
  );

  const handlePointerMove = (event: React.PointerEvent<SVGCircleElement>) => {
    const key = draggingCorner.current;
    const container = containerRef.current;
    if (!key || !container || !naturalSize || !corners) return;
    const rect = container.getBoundingClientRect();
    const displayPoint = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const imagePoint = clampPointToBounds(
      displayPointToImagePoint(displayPoint, scale),
      naturalSize,
    );
    setUserCorners({ ...corners, [key]: imagePoint });
  };

  const handlePointerUp = (event: React.PointerEvent<SVGCircleElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    draggingCorner.current = null;
  };

  const displayCorners = useMemo(() => {
    if (!corners) return null;
    return CORNER_ORDER.map((key) => ({
      key,
      point: imagePointToDisplayPoint(corners[key], scale),
    }));
  }, [corners, scale]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("cornerEditor.title")}
      data-testid="corner-editor"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[var(--overlay-backdrop)] p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-[var(--panel-bg)] p-4 shadow-xl">
        <h2 className="mb-1 shrink-0 text-base font-bold text-[var(--text)]">
          {t("cornerEditor.title")}
        </h2>
        <p className="mb-3 shrink-0 text-xs text-[var(--muted)]">
          {t("cornerEditor.instructions")}
        </p>

        <div className="flex min-h-0 justify-center overflow-auto">
          {/*
            画像は<img>の置換要素としてのネイティブなサイズ調整(max-width/max-height +
            width/height:auto)でアスペクト比を保ったまま収める。ラッパーはinline-blockで
            その結果のサイズにそのまま縮んで一致する(CSSのaspect-ratioをdivに付けて
            widthをautoにする方式は、非置換要素だとwidthが利用可能幅いっぱいに広がる
            挙動が優先されてしまい、高さ制約からの逆算が効かないため採用しない)。
          */}
          <div ref={containerRef} className="relative inline-block shrink-0 touch-none select-none">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob: object URLs aren't supported by next/image */}
            <img
              ref={imgRef}
              src={image.previewUrl}
              alt={t("cornerEditor.title")}
              className="block max-h-[60vh] max-w-full rounded-xl"
              onLoad={(event) => {
                const img = event.currentTarget;
                setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
              }}
            />
            {displayCorners && (
              <svg className="absolute inset-0 h-full w-full touch-none" aria-hidden="true">
                <polygon
                  points={displayCorners.map((c) => `${c.point.x},${c.point.y}`).join(" ")}
                  fill="var(--corner-quad-fill)"
                  stroke="var(--corner-quad-line)"
                  strokeWidth={2}
                />
                {displayCorners.map(({ key, point }) => (
                  <circle
                    key={key}
                    data-testid={`corner-handle-${key}`}
                    role="slider"
                    aria-label={t(HANDLE_LABEL_KEY[key])}
                    tabIndex={0}
                    cx={point.x}
                    cy={point.y}
                    r={10}
                    className="cursor-grab touch-none"
                    fill="var(--corner-handle-bg)"
                    stroke="var(--corner-handle-border)"
                    strokeWidth={2}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      draggingCorner.current = key;
                    }}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  />
                ))}
              </svg>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="cursor-pointer rounded-full border border-[var(--ghost-border)] bg-[var(--ghost-bg)] px-4 py-2 text-sm font-bold text-[var(--chip-fg)] disabled:opacity-50"
          >
            {t("cornerEditor.cancel")}
          </button>
          <button
            type="button"
            onClick={() => corners && onConfirm(corners)}
            disabled={!corners || isSubmitting}
            className="cursor-pointer rounded-full bg-[var(--corner-handle-bg)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {isSubmitting ? t("cornerEditor.applying") : t("cornerEditor.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
