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

/** `detectCorners`が上下辺に沿って保持した密な輪郭点(見開き湾曲補正`dewarpPage`が曲線
 * フィットに使う)。輪郭辺への直線フィットで頂点を精密化できなかった場合など、無い場合もある。 */
export type EdgeCurvePoints = { top: Point[]; bottom: Point[] };

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
 * 単ページの本は通常縦長(width/height < 1、実写真でもせいぜい0.9程度)になる一方、見開きは
 * 常に横長(width/height >= 1)になる(正方形に近いページの本であっても、2ページを横に
 * 並べれば必ず高さより幅の方が大きくなる)ため、1.0を境界とするのが最も原理的である。
 * 以前は1.2としていたが、実写真での検証で、四隅検出の精度やページ自体の縦横比によっては
 * 実際の見開きでも1.2をわずかに下回る(実測1.19程度)ことが確認され、見開きが単ページとして
 * 誤判定される回帰を招いた。単ページとの間には依然として十分なマージンがあるため、
 * 1.0まで下げてもマージンを取れる値としてこのissueで選定した。
 */
const SPREAD_ASPECT_RATIO_THRESHOLD = 1.0;

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
function nearestPointIndex(points: readonly Point[], target: Point): number {
  let bestIndex = 0;
  let bestDistSq = Infinity;
  points.forEach((p, i) => {
    const distSq = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIndex = i;
    }
  });
  return bestIndex;
}

/**
 * `detectCorners`が輪郭から得た4頂点(`points`、輪郭をたどった順序、`orderCorners`で
 * 並べ替える前)とその間の4辺(`edges`、`points`と同じ順序でインデックスが対応する、
 * `contourGeometry.ts`の`splitContourIntoEdges`が返す形式)を、既に並べ替え済みの`corners`と
 * 突き合わせ、上辺(topLeft→topRight)・下辺(bottomLeft→bottomRight)に対応する弧を
 * 向き(常にleft側の頂点から始まる向き)を揃えて返す。`corners`は精密化(頂点位置の補正)を
 * 経ている場合があり`points`の値と完全一致しない可能性があるため、最近傍点で対応を取る。
 * 該当する辺が見つからない場合(頂点数不一致など、通常は起きないはずの防御的なケース)は
 * `undefined`を返す。
 */
export function selectTopBottomEdges(
  points: readonly Point[],
  edges: readonly Point[][],
  corners: Corners,
): { top: Point[]; bottom: Point[] } | undefined {
  if (points.length !== 4 || edges.length !== 4) return undefined;

  const pickEdge = (a: Point, b: Point): Point[] | undefined => {
    const ia = nearestPointIndex(points, a);
    const ib = nearestPointIndex(points, b);
    if (ia === ib) return undefined;
    if ((ia + 1) % 4 === ib) return edges[ia];
    if ((ib + 1) % 4 === ia) return [...edges[ib]].reverse();
    return undefined;
  };

  const top = pickEdge(corners.topLeft, corners.topRight);
  const bottom = pickEdge(corners.bottomLeft, corners.bottomRight);
  if (!top || !bottom) return undefined;

  return { top, bottom };
}

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

/**
 * 見開き全体の`edgeCurves`(分割前、元画像座標系での上下辺の密な輪郭点)を、`gutterLine`の
 * x座標で左右に振り分ける。上辺は`gutterLine.topX`、下辺は`gutterLine.bottomX`をそれぞれの
 * 閾値とする(手持ち撮影による回転で綴じ目が斜めの場合、上辺と下辺で分割位置が異なるため)。
 * 右半分は`deriveHalfCorners`/`splitImageDataAt`と同じ`min(topX, bottomX)`分だけx座標を
 * シフトし、分割後の画像のローカル座標系に合わせる。分割後の再検出(`detectCorners`)は
 * 綴じ目側の輪郭が信頼できない(`mergeGutterSideCorners`参照)ため、湾曲補正用の曲線データは
 * 常にこの関数で分割前の輪郭から導出し、信頼できない再検出結果は使わない。
 */
export function splitEdgeCurvesAtGutter(
  edgeCurves: EdgeCurvePoints,
  gutterLine: GutterLine,
): [EdgeCurvePoints, EdgeCurvePoints] {
  const minX = Math.min(gutterLine.topX, gutterLine.bottomX);

  const splitAt = (points: readonly Point[], thresholdX: number): [Point[], Point[]] => {
    const left = points.filter((p) => p.x <= thresholdX);
    const right = points.filter((p) => p.x >= thresholdX).map((p) => ({ x: p.x - minX, y: p.y }));
    return [left, right];
  };

  const [topLeft, topRight] = splitAt(edgeCurves.top, gutterLine.topX);
  const [bottomLeft, bottomRight] = splitAt(edgeCurves.bottom, gutterLine.bottomX);

  return [
    { top: topLeft, bottom: bottomLeft },
    { top: topRight, bottom: bottomRight },
  ];
}
