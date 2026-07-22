export type Point = { x: number; y: number };

export type Corners = {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
};

/** 綴じ目(gutter)の位置を表す直線。手持ち撮影では本がカメラに対してわずかに回転しているのが普通で、
 * その場合綴じ目は画像内で垂直な直線ではなく、上端と下端でx座標が異なる斜めの直線になる。
 * `topX`/`bottomX`がどのy座標に対応するかは算出側(`gutter.ts`の`findGutterLine`)が定める。
 * 回転を検出できない/回転がない場合は`topX === bottomX`になり、単一の垂直な分割線として扱われる。 */
export type GutterLine = { topX: number; bottomX: number };

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

/** 四隅の外接矩形(bounding box)。gutter探索範囲や見開き分割の計算に使う。 */
export function cornersBoundingBox(corners: Corners): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = [corners.topLeft.x, corners.topRight.x, corners.bottomRight.x, corners.bottomLeft.x];
  const ys = [corners.topLeft.y, corners.topRight.y, corners.bottomRight.y, corners.bottomLeft.y];
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** 線分p0→p1上で、x座標が与えられた値になる点のyを線形補間で求める。p0.x === p1.xの場合はp0.yとp1.yの中間を返す。 */
function interpolateYAtX(p0: Point, p1: Point, x: number): number {
  if (p1.x === p0.x) return (p0.y + p1.y) / 2;
  const t = (x - p0.x) / (p1.x - p0.x);
  return p0.y + t * (p1.y - p0.y);
}

/**
 * 見開き全体の外周四隅と綴じ目の直線(`gutter.ts`の`findGutterLine`が返す`GutterLine`、元画像座標系)
 * から、左右各ページの四隅を幾何学的に導出する。上辺(topLeft→topRight)・下辺(bottomLeft→bottomRight)
 * それぞれを直線とみなし、上辺にはx=gutterLine.topX、下辺にはx=gutterLine.bottomXの点を線形補間で
 * 求めて綴じ目側の頂点とする(手持ち撮影による回転で綴じ目が斜めの場合、topXとbottomXは異なる値になり、
 * 導出される四隅は矩形ではなくなる)。呼び出し側は`splitImageDataAt(imageData, gutterLine)`で
 * `[min(topX,bottomX), max(topX,bottomX))`の帯を左右に重複させて分割する想定のため、右半分側の座標は
 * その左端(`min(topX,bottomX)`)分だけ引いてローカル座標(0起点)に直してある。ページ検出
 * (`detectCorners`)が独立再検出に失敗した場合のフォールバックとして使う。
 */
export function deriveHalfCorners(corners: Corners, gutterLine: GutterLine): [Corners, Corners] {
  const topGutter: Point = {
    x: gutterLine.topX,
    y: interpolateYAtX(corners.topLeft, corners.topRight, gutterLine.topX),
  };
  const bottomGutter: Point = {
    x: gutterLine.bottomX,
    y: interpolateYAtX(corners.bottomLeft, corners.bottomRight, gutterLine.bottomX),
  };

  const left: Corners = {
    topLeft: corners.topLeft,
    topRight: topGutter,
    bottomRight: bottomGutter,
    bottomLeft: corners.bottomLeft,
  };

  const minX = Math.min(gutterLine.topX, gutterLine.bottomX);
  const shift = (p: Point): Point => ({ x: p.x - minX, y: p.y });
  const right: Corners = {
    topLeft: shift(topGutter),
    topRight: shift(corners.topRight),
    bottomRight: shift(corners.bottomRight),
    bottomLeft: shift(bottomGutter),
  };

  return [left, right];
}
