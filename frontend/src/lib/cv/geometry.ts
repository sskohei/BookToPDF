export type Point = { x: number; y: number };

export type Corners = {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
};

/**
 * `findContours`/`approxPolyDP` が返す4点は輪郭をたどった順序で並んでおり、
 * どの点が左上/右上/右下/左下かは画像の傾きや輪郭の向きに依存して定まらない。
 * 座標の和(x+y)が最小/最大の点をそれぞれ左上/右下、差(y-x)が最小/最大の点を
 * それぞれ右上/左下とする標準的な手法で、4点を時計回り・左上始点に並べ直す。
 */
export function orderCorners(points: readonly Point[]): Corners {
  if (points.length !== 4) {
    throw new Error(`orderCorners expects exactly 4 points, got ${points.length}`);
  }

  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...points].sort((a, b) => a.y - a.x - (b.y - b.x));

  return {
    topLeft: bySum[0],
    bottomRight: bySum[3],
    topRight: byDiff[0],
    bottomLeft: byDiff[3],
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 四隅から透視補正後の出力サイズを求める。上辺・下辺のうち長い方を幅、
 * 左辺・右辺のうち長い方を高さとする（`getPerspectiveTransform`の出力矩形サイズに使う）。
 * 縮退した四隅（面積ほぼ0）でも0除算等が起きないよう、最小1にクランプする。
 */
export function quadSize(corners: Corners): { width: number; height: number } {
  const { topLeft, topRight, bottomRight, bottomLeft } = corners;
  const width = Math.max(distance(topLeft, topRight), distance(bottomLeft, bottomRight));
  const height = Math.max(distance(topLeft, bottomLeft), distance(topRight, bottomRight));
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

/**
 * 単ページの本は通常縦長(width/height < 1)、見開きは横幅がほぼページ2枚分
 * (width/height はおおよそ1.4〜2.0)になる。閾値はarchitecture.md/roadmap.mdに具体的な
 * 指定がないため、単ページとの間に十分マージンを取れる値としてこのissueで選定した。
 */
const SPREAD_ASPECT_RATIO_THRESHOLD = 1.2;

export function classifySpread(corners: Corners): "single" | "spread" {
  const { width, height } = quadSize(corners);
  return width / height >= SPREAD_ASPECT_RATIO_THRESHOLD ? "spread" : "single";
}
