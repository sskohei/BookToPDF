import type { CvMat, CvModule } from "../opencv-types";
import { orderCorners, type Point } from "../geometry";
import type { CvOperations } from "../protocol";

const GAUSSIAN_KSIZE = 5;
const CANNY_THRESHOLD_1 = 75;
const CANNY_THRESHOLD_2 = 200;
const APPROX_EPSILON_RATIO = 0.02;
/** 画像全体に対する最小面積比。これを下回る4点輪郭はノイズ由来とみなして棄却する。 */
const MIN_AREA_RATIO = 0.1;

function matToPoints(mat: CvMat): Point[] {
  const points: Point[] = [];
  for (let i = 0; i + 1 < mat.data32S.length; i += 2) {
    points.push({ x: mat.data32S[i], y: mat.data32S[i + 1] });
  }
  return points;
}

/**
 * grayscale化 → GaussianBlur → Canny → findContours で輪郭候補を洗い出し、
 * 4点に近似でき、かつ画像に対して十分な面積を持つ輪郭のうち最大のものをページ境界として採用する。
 * 見つからない場合は例外を投げず `{ found: false }` を返す（呼び出し側が手動調整UIに委ねる判断材料にする）。
 */
export function runDetectCorners(
  cv: CvModule,
  input: CvOperations["detectCorners"]["input"],
): CvOperations["detectCorners"]["output"] {
  const src = cv.matFromImageData(input.imageData);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const approx = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(GAUSSIAN_KSIZE, GAUSSIAN_KSIZE), 0);
    cv.Canny(blurred, edges, CANNY_THRESHOLD_1, CANNY_THRESHOLD_2);
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const imageArea = input.imageData.width * input.imageData.height;
    const minArea = imageArea * MIN_AREA_RATIO;

    let bestPoints: Point[] | undefined;
    let bestArea = 0;

    const contourCount = contours.size();
    for (let i = 0; i < contourCount; i++) {
      const contour = contours.get(i);
      try {
        const arcLen = cv.arcLength(contour, true);
        cv.approxPolyDP(contour, approx, APPROX_EPSILON_RATIO * arcLen, true);
        const points = matToPoints(approx);
        if (points.length !== 4) continue;

        const area = cv.contourArea(approx);
        if (area < minArea || area <= bestArea) continue;

        bestArea = area;
        bestPoints = points;
      } finally {
        contour.delete();
      }
    }

    if (!bestPoints) {
      return { found: false };
    }
    return { found: true, corners: orderCorners(bestPoints) };
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
    approx.delete();
  }
}
