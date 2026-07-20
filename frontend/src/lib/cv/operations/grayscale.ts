import type { CvModule } from "../opencv-types";
import type { CvOperations } from "../protocol";

/**
 * OpenCV.js を使った最初の実処理。RGBA画像をグレースケール化し、
 * 表示・転送しやすいよう再度RGBAとして返す。
 */
export function runGrayscale(
  cv: CvModule,
  input: CvOperations["grayscale"]["input"],
): CvOperations["grayscale"]["output"] {
  const src = cv.matFromImageData(input.imageData);
  const gray = new cv.Mat();
  const rgba = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(gray, rgba, cv.COLOR_GRAY2RGBA);
    return {
      imageData: new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows),
    };
  } finally {
    src.delete();
    gray.delete();
    rgba.delete();
  }
}
