import { cornersBoundingBox, type Corners } from "./geometry";

/** 探索の垂直範囲を、bounding boxの上下何割ずつ除いた中央帯にするか(見開き上下の湾曲・指の写り込みを避ける)。 */
const VERTICAL_INSET_RATIO = 0.2;
/** 探索の水平範囲を、bounding boxの中央何割にするか(綴じ目は中央付近にあるはずだが、フレーミングのズレを許容するマージンを持たせる)。 */
const HORIZONTAL_SEARCH_RATIO = 0.4;
/** 輝度プロファイルの平滑化に使う移動平均の窓幅(列数)。 */
const SMOOTHING_WINDOW = 5;
/** サンプリングする行数の上限(パフォーマンスのため)。 */
const MAX_SAMPLED_ROWS = 200;
/** 谷とみなすために必要な、探索範囲の平均輝度からの最小の落ち込み比率。これを下回れば谷が明確でないとみなす。 */
const MIN_VALLEY_DEPTH_RATIO = 0.05;

function luminance(data: Uint8ClampedArray, pixelIndex: number): number {
  const offset = pixelIndex * 4;
  return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
}

/**
 * 検出済みの外周四隅の内側で、綴じ目(gutter)のx座標を輝度プロファイルの谷から推定する
 * (docs/architecture.mdが説明する見開き分割ロジックの実装)。四隅のbounding boxの中央付近を
 * 探索対象とし、綴じ目の影で暗くなった列を探す。谷が明確でない場合はbounding boxの水平中央に
 * フォールバックする(画像全体の中央ではなく検出済み四隅基準にする時点で、本が写真の中央にない
 * 場合の問題は解消される)。
 */
export function findGutterX(imageData: ImageData, corners: Corners): number {
  const { width, height, data } = imageData;
  const box = cornersBoundingBox(corners);

  const top = Math.max(0, Math.round(box.minY + (box.maxY - box.minY) * VERTICAL_INSET_RATIO));
  const bottom = Math.min(height, Math.round(box.maxY - (box.maxY - box.minY) * VERTICAL_INSET_RATIO));

  const searchMargin = ((box.maxX - box.minX) * (1 - HORIZONTAL_SEARCH_RATIO)) / 2;
  const searchStart = Math.max(0, Math.round(box.minX + searchMargin));
  const searchEnd = Math.min(width, Math.round(box.maxX - searchMargin));

  const fallback = clampSplitX(Math.round((box.minX + box.maxX) / 2), width);
  if (searchEnd - searchStart < 2 || bottom - top < 1) {
    return fallback;
  }

  const rowStep = Math.max(1, Math.floor((bottom - top) / MAX_SAMPLED_ROWS));

  const profile: number[] = [];
  for (let x = searchStart; x < searchEnd; x++) {
    let sum = 0;
    let count = 0;
    for (let y = top; y < bottom; y += rowStep) {
      sum += luminance(data, y * width + x);
      count++;
    }
    profile.push(count > 0 ? sum / count : 0);
  }

  const smoothed = smooth(profile, SMOOTHING_WINDOW);

  let minValue = Infinity;
  let minIndex = 0;
  let sum = 0;
  for (let i = 0; i < smoothed.length; i++) {
    sum += smoothed[i];
    if (smoothed[i] < minValue) {
      minValue = smoothed[i];
      minIndex = i;
    }
  }
  const mean = sum / smoothed.length;

  if (mean <= 0 || (mean - minValue) / mean < MIN_VALLEY_DEPTH_RATIO) {
    return fallback;
  }

  return clampSplitX(searchStart + minIndex, width);
}

function smooth(values: number[], windowSize: number): number[] {
  const half = Math.floor(windowSize / 2);
  return values.map((_, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(values.length, i + half + 1);
    let sum = 0;
    for (let j = from; j < to; j++) sum += values[j];
    return sum / (to - from);
  });
}

function clampSplitX(x: number, width: number): number {
  return Math.min(width - 1, Math.max(1, x));
}
