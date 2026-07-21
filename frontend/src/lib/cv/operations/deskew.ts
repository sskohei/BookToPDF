import type { CvMat, CvModule } from "../opencv-types";
import type { CvOperations } from "../protocol";
import { computeAutoCannyThresholds, computeMedianIntensity } from "./detectCorners";

const GAUSSIAN_KSIZE = 5;
const HOUGH_RHO = 1;
const HOUGH_THETA = Math.PI / 180;
const HOUGH_THRESHOLD = 80;
/** 検出線の最小長さを画像短辺に対する比率で決める。短すぎる線はノイズ由来になりやすい。 */
const HOUGH_MIN_LINE_LENGTH_RATIO = 0.25;
const HOUGH_MAX_LINE_GAP = 20;
/**
 * 透視変換後に残るのは「微小な」傾きのみという前提(architecture.md)のため、この角度を
 * 超える線は本文の行ではなく別の直線的な模様等とみなして角度計算から除外する。
 */
const MAX_TILT_ANGLE_DEGREES = 15;
/** この本数未満しか有効な線が見つからない場合は、自信を持って補正できないとみなし補正しない。 */
const MIN_VALID_LINE_COUNT = 3;

/**
 * 線分の向きを`atan2`で求めた角度(-180〜180度)を、水平線を基準とした-90〜90度の範囲に
 * 正規化する。`HoughLinesP`が返す2端点の順序は線の向きに依存しないため、正規化しないと
 * 同じ水平線でも約0度と約180度のどちらでも返りうる。
 */
function normalizeAngle(angleDegrees: number): number {
  if (angleDegrees > 90) return angleDegrees - 180;
  if (angleDegrees < -90) return angleDegrees + 180;
  return angleDegrees;
}

/**
 * `HoughLinesP`が返す線分群(`lines.data32S`に`[x1,y1,x2,y2]`が1行ずつ)から、水平からの
 * 残存傾き角度を求める。±`MAX_TILT_ANGLE_DEGREES`を超える線(本文の行ではなさそうなもの)は
 * 除外し、残った角度の中央値を返す(外れ値に強いため平均ではなく中央値を採用)。有効な線が
 * `MIN_VALID_LINE_COUNT`未満の場合は自信を持って補正できないため`0`(補正なし)を返す。
 */
export function computeDeskewAngle(lines: CvMat): number {
  const data = lines.data32S;
  const angles: number[] = [];

  for (let i = 0; i + 3 < data.length; i += 4) {
    const [x1, y1, x2, y2] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    const angle = normalizeAngle((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI);
    if (Math.abs(angle) <= MAX_TILT_ANGLE_DEGREES) {
      angles.push(angle);
    }
  }

  if (angles.length < MIN_VALID_LINE_COUNT) return 0;

  angles.sort((a, b) => a - b);
  const mid = Math.floor(angles.length / 2);
  return angles.length % 2 === 0 ? (angles[mid - 1] + angles[mid]) / 2 : angles[mid];
}

/**
 * 透視変換後に残る微小な傾きをHough変換で検出し、回転補正する(architecture.md step 7)。
 * 補正角度が`0`(自信を持って検出できなかった場合含む)の場合は`warpAffine`自体を省略し、
 * 入力画像をそのまま返す(不要な補間パスを避ける)。
 */
export function runDeskew(
  cv: CvModule,
  input: CvOperations["deskew"]["input"],
): CvOperations["deskew"]["output"] {
  const { imageData } = input;
  const { width, height } = imageData;

  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const lines = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(GAUSSIAN_KSIZE, GAUSSIAN_KSIZE), 0);

    const median = computeMedianIntensity(blurred.data);
    const { low, high } = computeAutoCannyThresholds(median);
    cv.Canny(blurred, edges, low, high);

    const minLineLength = Math.round(Math.min(width, height) * HOUGH_MIN_LINE_LENGTH_RATIO);
    cv.HoughLinesP(
      edges,
      lines,
      HOUGH_RHO,
      HOUGH_THETA,
      HOUGH_THRESHOLD,
      minLineLength,
      HOUGH_MAX_LINE_GAP,
    );

    const angleDegrees = computeDeskewAngle(lines);
    if (angleDegrees === 0) {
      return { imageData, angleDegrees: 0 };
    }

    const rotationMatrix = cv.getRotationMatrix2D(new cv.Point(width / 2, height / 2), angleDegrees, 1.0);
    const rotated = new cv.Mat();
    try {
      cv.warpAffine(
        src,
        rotated,
        rotationMatrix,
        new cv.Size(width, height),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        [255, 255, 255, 255],
      );
      return {
        imageData: new ImageData(new Uint8ClampedArray(rotated.data), rotated.cols, rotated.rows),
        angleDegrees,
      };
    } finally {
      rotationMatrix.delete();
      rotated.delete();
    }
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    lines.delete();
  }
}
