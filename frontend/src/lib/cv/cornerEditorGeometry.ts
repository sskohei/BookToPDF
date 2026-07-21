import type { Corners, Point } from "./geometry";

export type CornerKey = keyof Corners;

export const CORNER_ORDER: readonly CornerKey[] = [
  "topLeft",
  "topRight",
  "bottomRight",
  "bottomLeft",
];

const DEFAULT_INSET_RATIO = 0.05;

/**
 * 表示コンテナは画像の自然サイズと同じアスペクト比に固定して表示するため、
 * 表示幅と自然幅の比率だけで両軸の座標を変換できる。
 */
export function imageToDisplayScale(
  natural: { width: number; height: number },
  renderedWidth: number,
): number {
  if (natural.width <= 0) return 1;
  return renderedWidth / natural.width;
}

export function imagePointToDisplayPoint(point: Point, scale: number): Point {
  return { x: point.x * scale, y: point.y * scale };
}

export function displayPointToImagePoint(point: Point, scale: number): Point {
  if (scale === 0) return { x: 0, y: 0 };
  return { x: point.x / scale, y: point.y / scale };
}

export function clampPointToBounds(
  point: Point,
  bounds: { width: number; height: number },
): Point {
  return {
    x: Math.min(Math.max(point.x, 0), bounds.width),
    y: Math.min(Math.max(point.y, 0), bounds.height),
  };
}

/**
 * 自動検出結果が無い(未検出/検出失敗)状態でエディタを開いたときの初期四隅。
 * 画像の縁ぴったりだとハンドルが操作しづらいため、四辺から一定比率だけ内側に置く。
 */
export function defaultCorners(
  imageSize: { width: number; height: number },
  insetRatio: number = DEFAULT_INSET_RATIO,
): Corners {
  const { width, height } = imageSize;
  const insetX = width * insetRatio;
  const insetY = height * insetRatio;
  return {
    topLeft: { x: insetX, y: insetY },
    topRight: { x: width - insetX, y: insetY },
    bottomRight: { x: width - insetX, y: height - insetY },
    bottomLeft: { x: insetX, y: height - insetY },
  };
}
