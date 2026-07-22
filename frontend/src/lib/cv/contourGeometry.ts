import type { Point } from "./geometry";

/** 点+方向ベクトル(単位ベクトル)で表す直線。傾きが定義できない垂直な辺も
 * 特別扱いせずに表現できる(`gutter.ts`の`x = slope*y + intercept`形式と異なる点)。 */
export type LinePD = { point: Point; direction: Point };

const PARALLEL_EPSILON = 1e-9;

/**
 * 密な輪郭点群に対する直交距離(垂線距離)最小の直線フィット(全最小二乗法、点群の共分散行列の
 * 主成分方向)。`gutter.ts`の`fitLine`は綴じ目という常にほぼ垂直な線しか扱わないため
 * `x = slope*y + intercept`の形で十分だが、ページの4辺は水平・垂直・斜めいずれの向きにも
 * なりうるため、傾きが定義できない(垂直な)辺でも破綻しないこの形式を使う。
 */
export function fitLineOrthogonal(points: readonly Point[]): LinePD {
  if (points.length < 2) {
    throw new Error(`fitLineOrthogonal expects at least 2 points, got ${points.length}`);
  }

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / points.length;
  const meanY = sumY / points.length;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  // 共分散行列[[sxx,sxy],[sxy,syy]]の最大固有値に対応する固有ベクトルが、
  // 点群のばらつきが最も大きい方向(=垂線距離を最小化する直線の方向)になる。
  const trace = sxx + syy;
  const halfDiff = (sxx - syy) / 2;
  const discriminant = Math.sqrt(halfDiff * halfDiff + sxy * sxy);
  const lambdaMax = trace / 2 + discriminant;

  let dirX: number;
  let dirY: number;
  if (Math.abs(sxy) > PARALLEL_EPSILON) {
    dirX = lambdaMax - syy;
    dirY = sxy;
  } else {
    // 共分散行列が対角(点群が既に軸に沿っている)場合、分散が大きい方の軸を方向とする。
    dirX = sxx >= syy ? 1 : 0;
    dirY = sxx >= syy ? 0 : 1;
  }

  const len = Math.hypot(dirX, dirY);
  const direction = len > PARALLEL_EPSILON ? { x: dirX / len, y: dirY / len } : { x: 1, y: 0 };

  return { point: { x: meanX, y: meanY }, direction };
}

/**
 * 2直線の交点を求める。ほぼ平行(方向ベクトルの外積がPARALLEL_EPSILON未満)な場合は
 * `undefined`を返す(呼び出し側は生の頂点にフォールバックする)。
 */
export function intersectLines(a: LinePD, b: LinePD): Point | undefined {
  const denom = a.direction.x * b.direction.y - a.direction.y * b.direction.x;
  if (Math.abs(denom) < PARALLEL_EPSILON) return undefined;

  const dx = b.point.x - a.point.x;
  const dy = b.point.y - a.point.y;
  const t = (dx * b.direction.y - dy * b.direction.x) / denom;

  return {
    x: a.point.x + t * a.direction.x,
    y: a.point.y + t * a.direction.y,
  };
}

function nearestIndex(denseContour: readonly Point[], target: Point): number {
  let bestIndex = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < denseContour.length; i++) {
    const p = denseContour[i];
    const distSq = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * 密な輪郭点列(`findContours`が返す元の輪郭、`approxPolyDP`で間引かれる前のもの)を、
 * `approxVertices`(4点、輪郭をたどった順序で並んでいる)が指す頂点の間の4つの弧に分割する。
 * `approxVertices`の各点は輪郭上の実点そのもののはずだが、念のため最近傍点で対応を取る。
 * 弧は輪郭の並び順どおり(`denseContour`のインデックスを前方向にラップして)たどるため、
 * 頂点が配列の終端付近にあっても正しく折り返す。
 */
export function splitContourIntoEdges(
  denseContour: readonly Point[],
  approxVertices: readonly Point[],
): Point[][] {
  if (denseContour.length === 0) {
    return approxVertices.map(() => []);
  }

  const n = denseContour.length;
  const indices = approxVertices.map((v) => nearestIndex(denseContour, v));

  return indices.map((startIdx, i) => {
    const endIdx = indices[(i + 1) % indices.length];
    const edge: Point[] = [];
    let idx = startIdx;
    for (let step = 0; step <= n; step++) {
      edge.push(denseContour[idx]);
      if (idx === endIdx) break;
      idx = (idx + 1) % n;
    }
    return edge;
  });
}

export type RefineQuadOptions = {
  /** 各辺の弧の両端をこの割合(点数ベース)ずつフィット対象から除外する。角の丸まりに
   * 影響された点を避けるため。 */
  trimRatio?: number;
  /** フィットを試みるために各辺の弧に必要な最小点数。未満の場合その辺は無効とし、
   * 隣接する頂点は生の`approxVertices`にフォールバックする(頂点ごとのフォールバック)。 */
  minPointsPerEdge?: number;
  /**
   * 交点が生の`approxVertices`頂点からこの距離(px)を超えて離れている場合、信頼できない
   * 外挿とみなし生の頂点にフォールバックする。実写真では辺のフィットにごくわずかな角度誤差が
   * あっても、フィット区間から頂点までの外挿距離が長い(木目調の背景・手など背景ノイズを含む
   * 写真では特に)ため誤差が線形に増幅され、頂点が大きく暴走しうる(実写真での検証で確認済み)。
   * 省略時は上限なし(既存の振る舞い・既存テストとの後方互換のため)。
   */
  maxDisplacement?: number;
};

const DEFAULT_TRIM_RATIO = 0.15;
const DEFAULT_MIN_POINTS_PER_EDGE = 5;

function trimEdge(edge: readonly Point[], trimRatio: number): Point[] {
  const trimCount = Math.floor(edge.length * trimRatio);
  if (edge.length - trimCount * 2 < 1) return [...edge];
  return edge.slice(trimCount, edge.length - trimCount);
}

/**
 * `approxPolyDP`が返す4頂点を、隣接する2辺それぞれに`fitLineOrthogonal`した直線同士の
 * 交点として求め直す。輪郭近似の頂点はノイズや角の丸まりの影響を受けやすい一点にすぎないが、
 * 辺全体の点群から直線をフィットして交点を取ることで、より安定した頂点位置が得られる。
 * データ不足(点数不足・辺がほぼ平行)の場合は、影響を受ける頂点だけ生の`approxVertices`の
 * 値にフォールバックする(全4頂点を一律にフォールバックさせるわけではない)。
 */
export function refineQuadCorners(
  denseContour: readonly Point[],
  approxVertices: readonly Point[],
  options: RefineQuadOptions = {},
): Point[] {
  if (approxVertices.length !== 4) return [...approxVertices];

  const trimRatio = options.trimRatio ?? DEFAULT_TRIM_RATIO;
  const minPointsPerEdge = options.minPointsPerEdge ?? DEFAULT_MIN_POINTS_PER_EDGE;
  const maxDisplacement = options.maxDisplacement;

  const edges = splitContourIntoEdges(denseContour, approxVertices);
  const lines: Array<LinePD | undefined> = edges.map((edge) => {
    const trimmed = trimEdge(edge, trimRatio);
    if (trimmed.length < minPointsPerEdge) return undefined;
    return fitLineOrthogonal(trimmed);
  });

  return approxVertices.map((vertex, i) => {
    const incoming = lines[(i + 3) % 4];
    const outgoing = lines[i];
    if (!incoming || !outgoing) return vertex;
    const intersection = intersectLines(incoming, outgoing);
    if (!intersection) return vertex;
    if (maxDisplacement !== undefined) {
      const displacement = Math.hypot(intersection.x - vertex.x, intersection.y - vertex.y);
      if (displacement > maxDisplacement) return vertex;
    }
    return intersection;
  });
}
