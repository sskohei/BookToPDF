import { buildRuledSurfaceMap, clampCurveMagnitude, fitEdgeCurve, isCurveSignificant } from "../edgeCurve";
import { quadSize } from "../geometry";
import type { CvModule } from "../opencv-types";
import type { CvOperations } from "../protocol";
import { runPerspectiveTransform } from "./perspectiveTransform";

/**
 * `perspectiveTransform`(4点ホモグラフィ)を一般化し、見開き綴じ目付近の湾曲(本を開いたときの
 * 物理的な曲面によって上下辺が弓なりになる現象。平面のホモグラフィ変換では原理的に直せない)が
 * 有意な場合はルールドサーフェス変形(`cv.remap`)で補正する。`edgeCurves`が無い、または
 * フィットした曲線の湾曲が有意でない(フラットなページ、または手動調整で4頂点のみ指定された
 * 場合)は`runPerspectiveTransform`と全く同じ結果を返す(`curved: false`)。
 */
export function runDewarpPage(
  cv: CvModule,
  input: CvOperations["dewarpPage"]["input"],
): CvOperations["dewarpPage"]["output"] {
  const { imageData, corners, edgeCurves } = input;

  if (!edgeCurves) {
    return { ...runPerspectiveTransform(cv, { imageData, corners }), curved: false };
  }

  const rawTopCurve = fitEdgeCurve(edgeCurves.top, corners.topLeft, corners.topRight);
  const rawBottomCurve = fitEdgeCurve(edgeCurves.bottom, corners.bottomLeft, corners.bottomRight);
  if (!isCurveSignificant(rawTopCurve) && !isCurveSignificant(rawBottomCurve)) {
    return { ...runPerspectiveTransform(cv, { imageData, corners }), curved: false };
  }

  // 有意と判定された曲線でも、実写真のノイズの影響で不自然に大きい変形量になりうるため、
  // 実際に適用する前に物理的にありえる範囲へクランプする(クランプ不要な曲線には無害)。
  const topCurve = clampCurveMagnitude(rawTopCurve);
  const bottomCurve = clampCurveMagnitude(rawBottomCurve);

  const { width, height } = quadSize(corners);
  const { mapX, mapY } = buildRuledSurfaceMap(topCurve, bottomCurve, width, height);

  const src = cv.matFromImageData(imageData);
  const mapXMat = cv.matFromArray(height, width, cv.CV_32FC1, mapX);
  const mapYMat = cv.matFromArray(height, width, cv.CV_32FC1, mapY);
  const warped = new cv.Mat();

  try {
    cv.remap(src, warped, mapXMat, mapYMat, cv.INTER_LINEAR, cv.BORDER_CONSTANT, [255, 255, 255, 255]);
    return {
      imageData: new ImageData(new Uint8ClampedArray(warped.data), warped.cols, warped.rows),
      curved: true,
    };
  } finally {
    src.delete();
    mapXMat.delete();
    mapYMat.delete();
    warped.delete();
  }
}
