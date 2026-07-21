import type { CvMat, CvModule } from "../opencv-types";
import { orderCorners, type Point } from "../geometry";
import type { CvOperations } from "../protocol";

const GAUSSIAN_KSIZE = 5;
/** auto-Canny(メディアンベース)のしきい値幅を決める係数。値が大きいほど閾値の許容幅が広がる。 */
const CANNY_SIGMA = 0.33;
/** モルフォロジークロージングのカーネルサイズを画像短辺に対する比率で決める。 */
const CLOSING_KERNEL_RATIO = 0.01;
const CLOSING_KERNEL_MIN = 3;
/** 短辺3000〜4000px程度のスマホ写真でも1%スケールのカーネルに近づけるための上限。 */
const CLOSING_KERNEL_MAX = 51;
/** 4点近似を試すepsilon比率。緩いものへ段階的に緩和し、4点に収束した時点で採用する。 */
const APPROX_EPSILON_RATIOS = [0.01, 0.02, 0.03, 0.05, 0.08];
/**
 * 画像全体に対する最小面積比。これを下回る輪郭はノイズ由来とみなして棄却する。このアプリは
 * 「ページ全体が写るように」撮影させる前提(`capture.tip.body`)のため、ページ自体はフレームの
 * 大部分を占めるはずである。閾値が低すぎると、ページ内の表・図版などページより明らかに小さい
 * 矩形がページと誤認されてしまう。
 */
const MIN_AREA_RATIO = 0.4;

/**
 * `attemptDetection`が1回のパス内で見つけた最良候補。`converged`(4点近似に収束した輪郭のうち
 * 最大面積のもの)と`fallback`(収束しなかった場合の`minAreaRect`候補)を分けて保持することで、
 * 呼び出し側(`runDetectCorners`)が複数パスの結果を「収束候補を`fallback`より常に優先しつつ、
 * 同種同士は面積が大きい方を採用する」という基準で比較できるようにする。
 */
type DetectionAttempt = {
  converged?: { points: Point[]; area: number };
  fallback?: { points: Point[]; area: number };
};

function matToPoints(mat: CvMat): Point[] {
  const points: Point[] = [];
  for (let i = 0; i + 1 < mat.data32S.length; i += 2) {
    points.push({ x: mat.data32S[i], y: mat.data32S[i + 1] });
  }
  return points;
}

/** グレースケール画素値(0-255)のメディアンを求める。auto-Cannyのしきい値算出に使う。 */
export function computeMedianIntensity(data: Uint8Array): number {
  if (data.length === 0) return 0;

  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) {
    histogram[data[i]]++;
  }

  const middle = Math.floor(data.length / 2);
  let cumulative = 0;
  for (let value = 0; value < 256; value++) {
    cumulative += histogram[value];
    if (cumulative > middle) {
      return value;
    }
  }
  return 255;
}

/** メディアン画素値から`Canny`の低・高しきい値を求める(いわゆるauto-Canny)。 */
export function computeAutoCannyThresholds(
  median: number,
  sigma: number = CANNY_SIGMA,
): { low: number; high: number } {
  return {
    low: Math.max(0, (1 - sigma) * median),
    high: Math.min(255, (1 + sigma) * median),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 画像短辺に対する比率からクロージングカーネルサイズ(奇数)を求める。 */
function computeClosingKernelSize(width: number, height: number): number {
  const shortSide = Math.min(width, height);
  const raw = Math.round(shortSide * CLOSING_KERNEL_RATIO);
  const clamped = clamp(raw, CLOSING_KERNEL_MIN, CLOSING_KERNEL_MAX);
  return clamped % 2 === 0 ? clamped + 1 : clamped;
}

/**
 * auto-Canny → モルフォロジークロージング → findContours で `source`（グレースケール、
 * ぼかし済み）から輪郭候補を洗い出し、段階的に緩めたepsilonで4点に近似でき、かつ画像に対して
 * 十分な面積を持つ輪郭のうち最大のものを`converged`候補として返す。4点近似が一度も得られない
 * 場合でも、面積条件を満たす最大の輪郭があれば`minAreaRect`による回転外接矩形を`fallback`候補
 * として返す。どちらをページ境界として採用するかは呼び出し側(`runDetectCorners`)が複数パスの
 * 結果と合わせて判断する。この関数が確保する`Mat`は全て内部の`finally`で削除する。
 */
function attemptDetection(
  cv: CvModule,
  source: CvMat,
  width: number,
  height: number,
): DetectionAttempt {
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const approx = new cv.Mat();
  const closingKernelSize = computeClosingKernelSize(width, height);
  const kernel = cv.getStructuringElement(
    cv.MORPH_RECT,
    new cv.Size(closingKernelSize, closingKernelSize),
  );

  try {
    const median = computeMedianIntensity(source.data);
    const { low, high } = computeAutoCannyThresholds(median);
    cv.Canny(source, edges, low, high);
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);

    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const imageArea = width * height;
    const minArea = imageArea * MIN_AREA_RATIO;

    let bestPoints: Point[] | undefined;
    let bestArea = 0;
    let fallbackPoints: Point[] | undefined;
    let fallbackArea = 0;

    const contourCount = contours.size();
    for (let i = 0; i < contourCount; i++) {
      const contour = contours.get(i);
      try {
        const arcLen = cv.arcLength(contour, true);

        let points: Point[] = [];
        let converged = false;
        for (const epsilonRatio of APPROX_EPSILON_RATIOS) {
          cv.approxPolyDP(contour, approx, epsilonRatio * arcLen, true);
          points = matToPoints(approx);
          if (points.length === 4) {
            converged = true;
            break;
          }
        }

        const area = cv.contourArea(approx);
        if (area < minArea) continue;

        if (converged) {
          if (area > bestArea) {
            bestArea = area;
            bestPoints = points;
          }
        } else if (area > fallbackArea) {
          const rotatedRect = cv.minAreaRect(contour);
          fallbackArea = area;
          fallbackPoints = cv.RotatedRect.points(rotatedRect);
        }
      } finally {
        contour.delete();
      }
    }

    return {
      converged: bestPoints ? { points: bestPoints, area: bestArea } : undefined,
      fallback: fallbackPoints ? { points: fallbackPoints, area: fallbackArea } : undefined,
    };
  } finally {
    edges.delete();
    contours.delete();
    hierarchy.delete();
    approx.delete();
    kernel.delete();
  }
}

/**
 * 複数パスの`DetectionAttempt`から採用する四隅を選ぶ。`converged`(4点近似に収束した候補)を
 * `fallback`(`minAreaRect`候補)より常に優先し、同種同士は面積が大きい方を採用する。ページ内の
 * 表・図版など小さく強いコントラストの矩形が先に見つかっても、他のパスでより大きい(＝ページ
 * 本体である可能性が高い)候補が見つかっていればそちらを優先できる。
 */
function pickBest(attempts: DetectionAttempt[]): Point[] | undefined {
  const converged = attempts
    .map((attempt) => attempt.converged)
    .filter((candidate): candidate is { points: Point[]; area: number } => candidate !== undefined);
  if (converged.length > 0) {
    return converged.reduce((best, candidate) => (candidate.area > best.area ? candidate : best))
      .points;
  }

  const fallback = attempts
    .map((attempt) => attempt.fallback)
    .filter((candidate): candidate is { points: Point[]; area: number } => candidate !== undefined);
  if (fallback.length > 0) {
    return fallback.reduce((best, candidate) => (candidate.area > best.area ? candidate : best))
      .points;
  }

  return undefined;
}

/**
 * grayscale化 → GaussianBlur した上で`attemptDetection`を試みる。実写真は白い紙×明るい机など
 * ページと背景の輝度差がごく小さいことが多く、その場合`attemptDetection`はCannyエッジ自体が
 * 出ず輪郭を1つも検出できない。そのため`equalizeHist`（ヒストグラム平坦化）で輝度差を強調した
 * 画像でも必ず2回目を試す。1回目で(ページ本体ではなく)ページ内の表・図版など強コントラストな
 * 小さい矩形が先に見つかってしまうケースがあり、1回目が見つけた時点で確定してしまうと、
 * 2回目で見つかるはずの(より大きい)本来のページ候補を試す機会を失ってしまうため、常に両方の
 * パスを実行してから`pickBest`で比較する（高コントラストな画像では両パスの結果はほぼ同じになる
 * ため、既存の成功ケースへの影響は小さい）。
 * 見つからない場合は例外を投げず `{ found: false }` を返す（呼び出し側が手動調整UIに委ねる判断材料にする）。
 */
export function runDetectCorners(
  cv: CvModule,
  input: CvOperations["detectCorners"]["input"],
): CvOperations["detectCorners"]["output"] {
  const src = cv.matFromImageData(input.imageData);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const equalized = new cv.Mat();
  const { width, height } = input.imageData;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(GAUSSIAN_KSIZE, GAUSSIAN_KSIZE), 0);
    cv.equalizeHist(blurred, equalized);

    const primary = attemptDetection(cv, blurred, width, height);
    const secondary = attemptDetection(cv, equalized, width, height);

    const best = pickBest([primary, secondary]);
    return best ? { found: true, corners: orderCorners(best) } : { found: false };
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    equalized.delete();
  }
}
