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
