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
 * 暫定中央値からこの角度以上離れた線は、本文の行ではなく別の直線的な模様(装飾罫線等)由来の
 * 外れ値とみなして除外する(`gutter.ts`の`LINE_AGREEMENT_TOLERANCE_RATIO`と同じ「まず全体で
 * 粗く推定し、そこから外れるものを弾いてから再推定する」という2段階のロバスト推定の考え方)。
 * 四隅検出の精度に応じて実際に残る傾きの大きさは変わりうるため、線同士が互いに一致している
 * (=合意している)かどうかで判定し、絶対角度による足切りはしない。
 */
const CONSENSUS_TOLERANCE_DEGREES = 5;
/** 合意した(=暫定中央値に近い)線がこの本数未満の場合は、自信を持って補正できないとみなし補正しない。 */
const MIN_VALID_LINE_COUNT = 3;
/**
 * 2段階目で合意が取れた最終角度に対する最後の妥当性チェック。透視変換後に本来残るのは
 * 微小な傾きのはずだが、四隅検出の精度不足(症状「台形補正のズレ」)によりこれより大きい
 * 残存傾きが生じることもあるため、完全に0点だった旧`MAX_TILT_ANGLE_DEGREES`(15度)より
 * 緩めた値にして、合意の取れた大きめの傾きも補正できるようにしつつ、Hough線が模様等に
 * 引っ張られて明らかに暴走した場合の安全弁として残す。
 */
const SANITY_MAX_ANGLE_DEGREES = 30;

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

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * `HoughLinesP`が返す線分群(`lines.data32S`に`[x1,y1,x2,y2]`が1行ずつ)から、水平からの
 * 残存傾き角度を求める。`gutter.ts`の`findGutterLine`と同じ「まず粗く全体の中央値を取り、
 * そこから大きく外れる線を除いてから再度中央値を取る」という2段階のロバスト推定を使う
 * (絶対角度による個々の線の足切りはしない)。これにより、四隅検出の精度不足などで実際に
 * 大きめの残存傾きが生じている場合でも、線同士が互いに一致していれば補正できる。一方で、
 * 装飾罫線など本文の行とは無関係な線は、1段目の中央値との不一致(2段目のフィルタ)で
 * 引き続き除外される。合意した線が`MIN_VALID_LINE_COUNT`未満、または最終角度が
 * `SANITY_MAX_ANGLE_DEGREES`を超える場合は、自信を持って補正できないとみなし`0`を返す。
 */
export function computeDeskewAngle(lines: CvMat): number {
  const data = lines.data32S;
  const angles: number[] = [];

  for (let i = 0; i + 3 < data.length; i += 4) {
    const [x1, y1, x2, y2] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    angles.push(normalizeAngle((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI));
  }

  if (angles.length < MIN_VALID_LINE_COUNT) return 0;

  const provisional = median(angles);
  const inliers = angles.filter((angle) => Math.abs(angle - provisional) <= CONSENSUS_TOLERANCE_DEGREES);
  if (inliers.length < MIN_VALID_LINE_COUNT) return 0;

  const refined = median(inliers);
  return Math.abs(refined) > SANITY_MAX_ANGLE_DEGREES ? 0 : refined;
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
