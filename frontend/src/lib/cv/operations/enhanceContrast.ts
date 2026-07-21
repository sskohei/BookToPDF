import type { CvModule } from "../opencv-types";
import type { CvOperations } from "../protocol";

/** OpenCVの一般的なデフォルト値。実写真での見え方は実装時に手動確認しながら調整する前提。 */
const CLAHE_CLIP_LIMIT = 2.0;
const CLAHE_TILE_GRID_SIZE = 8;
/**
 * 明るさの正規化(線形ストレッチ)を行うかどうかの閾値。輝度レンジが既にこれ以上広い場合は
 * 元々コントラストが十分あるとみなし、ストレッチによるノイズ増幅を避けるため何もしない。
 */
const BRIGHTNESS_STRETCH_RANGE_THRESHOLD = 200;

/**
 * CLAHEによるコントラスト補正と明るさの正規化をまとめて行う(architecture.md step 8)。
 * RGBのままCLAHEをかけると色相がずれるため、Lab色空間のL(輝度)チャンネルだけに適用し、
 * a/bチャンネル(色情報)はそのまま保持する(写真・イラストページの色を維持するため)。
 */
export function runEnhanceContrast(
  cv: CvModule,
  input: CvOperations["enhanceContrast"]["input"],
): CvOperations["enhanceContrast"]["output"] {
  const src = cv.matFromImageData(input.imageData);
  const rgb = new cv.Mat();
  const lab = new cv.Mat();
  const mv = new cv.MatVector();
  const rgba = new cv.Mat();
  const clahe = new cv.CLAHE(
    CLAHE_CLIP_LIMIT,
    new cv.Size(CLAHE_TILE_GRID_SIZE, CLAHE_TILE_GRID_SIZE),
  );

  try {
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
    cv.split(lab, mv);

    const l = mv.get(0);
    const a = mv.get(1);
    const b = mv.get(2);
    try {
      clahe.apply(l, l);

      const { minVal, maxVal } = cv.minMaxLoc(l);
      const range = maxVal - minVal;
      if (range > 0 && range < BRIGHTNESS_STRETCH_RANGE_THRESHOLD) {
        const alpha = 255 / range;
        const beta = -minVal * alpha;
        cv.convertScaleAbs(l, l, alpha, beta);
      }

      cv.merge(mv, lab);
      cv.cvtColor(lab, rgb, cv.COLOR_Lab2RGB);
      cv.cvtColor(rgb, rgba, cv.COLOR_RGB2RGBA);

      return {
        imageData: new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows),
      };
    } finally {
      l.delete();
      a.delete();
      b.delete();
    }
  } finally {
    src.delete();
    rgb.delete();
    lab.delete();
    mv.delete();
    clahe.delete();
    rgba.delete();
  }
}
