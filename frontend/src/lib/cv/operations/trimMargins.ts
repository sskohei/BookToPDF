import type { CvMat, CvModule } from "../opencv-types";
import type { CvOperations } from "../protocol";

/** 四隅から背景色をサンプリングする正方形パッチの一辺(px)。 */
const CORNER_SAMPLE_SIZE = 8;
/** 検出した内容領域が画像全体に対してこの比率未満なら誤検出とみなし、トリミングしない。 */
const MIN_CONTENT_AREA_RATIO = 0.6;
/** トリミング矩形に外側へ付与する余白の比率。境界ぎりぎりでの本文欠損を避けるための安全マージン。 */
const PADDING_RATIO = 0.01;
/** 輝度がこの値以上なら「明るい背景」とみなす(0-255)。 */
const BRIGHT_BACKGROUND_THRESHOLD = 128;

/**
 * 画像四隅の小さなパッチの平均輝度を求める。トリミング対象は主に`deskew`の`warpAffine`が
 * 回転によって作る四隅の白い余白ウェッジのため、実際に四隅を直接サンプリングするのが
 * 最も直接的で誤検出が少ない。
 */
export function averageCornerBrightness(gray: CvMat, width: number, height: number): number {
  const data = gray.data;
  const patch = Math.min(CORNER_SAMPLE_SIZE, width, height);
  const corners: Array<[number, number]> = [
    [0, 0],
    [width - patch, 0],
    [0, height - patch],
    [width - patch, height - patch],
  ];

  let sum = 0;
  let count = 0;
  for (const [startX, startY] of corners) {
    for (let y = startY; y < startY + patch; y++) {
      for (let x = startX; x < startX + patch; x++) {
        sum += data[y * width + x];
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 255;
}

/**
 * ページ本体以外の余白(主に`deskew`が作る四隅の白いウェッジ)をトリミングする
 * (architecture.md step 8)。四隅の輝度から背景の明暗を判定し、Otsuの大津の手法で
 * 背景と内容を分離、`boundingRect`で内容領域を求めてクロップする。誤検出時(内容領域が
 * 不自然に小さい場合)は本文を欠損させないよう、トリミングせず元画像を返す。
 */
export function runTrimMargins(
  cv: CvModule,
  input: CvOperations["trimMargins"]["input"],
): CvOperations["trimMargins"]["output"] {
  const { imageData } = input;
  const { width, height } = imageData;

  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const mask = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const backgroundBrightness = averageCornerBrightness(gray, width, height);
    const backgroundIsBright = backgroundBrightness >= BRIGHT_BACKGROUND_THRESHOLD;
    // maskは内容側が255になるようにする(背景が明るいならBINARY_INVで明るい方を0に反転)。
    const thresholdType =
      (backgroundIsBright ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY) | cv.THRESH_OTSU;
    cv.threshold(gray, mask, 0, 255, thresholdType);

    const rect = cv.boundingRect(mask);
    const areaRatio = (rect.width * rect.height) / (width * height);
    if (areaRatio < MIN_CONTENT_AREA_RATIO) {
      return { imageData, trimmed: false };
    }

    const paddingX = Math.round(width * PADDING_RATIO);
    const paddingY = Math.round(height * PADDING_RATIO);
    const x = Math.max(0, rect.x - paddingX);
    const y = Math.max(0, rect.y - paddingY);
    const cropWidth = Math.min(width, rect.x + rect.width + paddingX) - x;
    const cropHeight = Math.min(height, rect.y + rect.height + paddingY) - y;

    // `mat.roi(rect).data` は元Matのストライドをそのまま参照するため1行目以外が壊れる。
    // 正しくパックされたバッファを得るには`.clone()`してから`.data`を読む必要がある
    // (`opencv-types.ts`の`CvMat.roi`コメント参照)。
    const roiView = src.roi(new cv.Rect(x, y, cropWidth, cropHeight));
    const cropped = roiView.clone();
    try {
      return {
        imageData: new ImageData(new Uint8ClampedArray(cropped.data), cropped.cols, cropped.rows),
        trimmed: true,
      };
    } finally {
      cropped.delete();
      roiView.delete();
    }
  } finally {
    src.delete();
    gray.delete();
    mask.delete();
  }
}
