"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";
import type { PageImage } from "@/state/pageImages";
import { AdjustIcon, CloseIcon, DragHandleIcon, PlusIcon } from "./icons";

type Translate = ReturnType<typeof useLanguage>["t"];

type PageReorderProps = {
  images: PageImage[];
  onReorder: (activeId: string, overId: string) => void;
  onRemove: (id: string) => void;
  onAddMore: () => void;
  onAdjust: (id: string) => void;
  onView: (id: string) => void;
};

export function PageReorder({ images, onReorder, onRemove, onAddMore, onAdjust, onView }: PageReorderProps) {
  const { t } = useLanguage();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeImage = images.find((image) => image.id === activeId) ?? null;
  const activeIndex = activeImage ? images.indexOf(activeImage) : -1;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
    setActiveId(null);
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={images.map((image) => image.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(104px,1fr))]">
          {images.map((image, index) => (
            <PageTile
              key={image.id}
              image={image}
              index={index}
              onRemove={onRemove}
              onAdjust={onAdjust}
              onView={onView}
              t={t}
            />
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
      </SortableContext>
      <DragOverlay>
        {activeImage ? (
          <PageTileVisual image={activeImage} index={activeIndex} t={t} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

type PageTileProps = {
  image: PageImage;
  index: number;
  onRemove: (id: string) => void;
  onAdjust: (id: string) => void;
  onView: (id: string) => void;
  t: Translate;
};

function PageTile({ image, index, onRemove, onAdjust, onView, t }: PageTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isDetecting = image.corners === undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="preview-tile"
      className={`relative aspect-[3/4] overflow-hidden rounded-xl ring-1 ring-[var(--thumb-ring)] ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onView(image.id)}
        aria-label={t("previewGrid.viewAria", { index: index + 1 })}
        className="cursor-zoom-in absolute inset-0 h-full w-full"
      >
        <PageTileVisual image={image} index={index} t={t} />
      </button>

      {/* Drag handle: a centered bottom-edge pill. The top edge is reserved for the
          (sometimes wide) status badge text, so the handle sits at the bottom instead,
          between the short page-number badge and the adjust icon, where it stays clear. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t("pageReorder.dragHandleAria", { index: index + 1 })}
        className="cursor-grab active:cursor-grabbing touch-none absolute bottom-1 left-1/2 flex h-5 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-black/50 text-white"
      >
        <DragHandleIcon />
      </button>

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
}

type PageTileVisualProps = {
  image: PageImage;
  index: number;
  t: Translate;
  dragging?: boolean;
};

/**
 * サムネイル画像・ステータスバッジ・ページ番号のみを描画する（クリック可能なボタン群は含まない）。
 * `DragOverlay` に浮かせる見た目のコピーと、通常タイル内の見た目部分の両方から使われる。
 */
function PageTileVisual({ image, index, t, dragging }: PageTileVisualProps) {
  const isDetecting = image.corners === undefined;
  const detectionFailed = image.corners === null;
  const isCorrecting = !isDetecting && !detectionFailed && image.processedPreviewUrls === undefined;
  const correctionFailed = image.processedPreviewUrls?.length === 0;
  const correctedUrls = image.processedPreviewUrls;

  return (
    <div
      className={`relative h-full w-full ${dragging ? "aspect-[3/4] overflow-hidden rounded-xl ring-1 ring-[var(--thumb-ring)]" : ""}`}
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
    </div>
  );
}
