import { quadSize } from "../geometry";
import type { CvModule } from "../opencv-types";
import type { CvOperations } from "../protocol";

/**
 * 検出済みの四隅(`corners`)を出力矩形に対応づける透視変換行列を求め、`warpPerspective`で
 * 台形補正した画像を返す。出力サイズは `quadSize()` (対辺の最大長)から決める。
 */
export function runPerspectiveTransform(
  cv: CvModule,
  input: CvOperations["perspectiveTransform"]["input"],
): CvOperations["perspectiveTransform"]["output"] {
  const { imageData, corners } = input;
  const { topLeft, topRight, bottomRight, bottomLeft } = corners;
  const { width, height } = quadSize(corners);

  const src = cv.matFromImageData(imageData);
  const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    topLeft.x,
    topLeft.y,
    topRight.x,
    topRight.y,
    bottomRight.x,
    bottomRight.y,
    bottomLeft.x,
    bottomLeft.y,
  ]);
  const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    width - 1,
    0,
    width - 1,
    height - 1,
    0,
    height - 1,
  ]);
  const transform = cv.getPerspectiveTransform(srcPoints, dstPoints);
  const warped = new cv.Mat();

  try {
    cv.warpPerspective(src, warped, transform, new cv.Size(width, height));
    return {
      imageData: new ImageData(new Uint8ClampedArray(warped.data), warped.cols, warped.rows),
    };
  } finally {
    src.delete();
    srcPoints.delete();
    dstPoints.delete();
    transform.delete();
    warped.delete();
  }
}
