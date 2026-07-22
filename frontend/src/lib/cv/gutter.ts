import { cornersBoundingBox, type Corners, type GutterLine } from "./geometry";

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
/** 垂直探索範囲をこの数の帯(バンド)に分割し、各バンドで独立に候補列を探す。
 * 机の縁など画像の一部の高さにしか写らない物体は一部のバンドでしか候補にならない一方、
 * 本の綴じ目は撮影範囲の全高で物理的に連続しているため、大半のバンドで一致するはず。
 * この違いを使って両者を区別する。奇数にして「過半数」の判定をシンプルにする。 */
const NUM_BANDS = 5;
/** 1バンドあたりの行サンプリング数の上限。既存のMAX_SAMPLED_ROWS(画像全体での合計サンプリング予算)を
 * バンド数で均等に割り、帯に分けても総サンプリング量・パフォーマンス特性が変わらないようにする。 */
const MAX_SAMPLED_ROWS_PER_BAND = Math.ceil(MAX_SAMPLED_ROWS / NUM_BANDS);
/** 谷候補として認めるために、谷底の両側でバンド平均に向かってこの比率以上回復している必要がある。
 * 0.5は「多少の落ち込みで終わる段差」を除外しつつ、周辺減光などで完全にバンド平均まで
 * 戻らないケースは許容する妥協点。 */
const VALLEY_RECOVERY_RATIO = 0.5;
/** 有効な谷候補を出したバンド数、および直線に乗っていると判定されたバンド数がこれ未満の場合は
 * フォールバックする。NUM_BANDSの過半数を要求することで「撮影範囲の大半の高さで一貫して暗い」
 * ことを保証する。 */
const MIN_AGREEING_BANDS = Math.ceil(NUM_BANDS / 2);
/** 最上段・最下段の有効バンド候補を結ぶ直線から、中間バンドの候補がどれだけ離れていれば
 * 「その直線に乗っていない」とみなすかの許容ばらつき(探索窓幅に対する比率)。手持ち撮影による
 * 回転で綴じ目が斜めの直線になっても許容しつつ、無関係な物体が直線に紛れ込まない狭さを狙う。 */
const LINE_AGREEMENT_TOLERANCE_RATIO = 0.15;

function luminance(data: Uint8ClampedArray, pixelIndex: number): number {
  const offset = pixelIndex * 4;
  return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
}

/**
 * 検出済みの外周四隅の内側で、綴じ目(gutter)の位置を輝度プロファイルの谷から直線として推定する
 * (docs/architecture.mdが説明する見開き分割ロジックの実装)。四隅のbounding boxの中央付近を
 * 探索対象とし、綴じ目の影で暗くなった列を探す。垂直方向を複数の帯(バンド)に分割して
 * 独立に谷を探す。これにより、机の縁など画像の一部の高さにしか写らない物体や、片側だけ暗いまま
 * 続く段差(谷ではない)を綴じ目と誤認しないようにする。最上段・最下段の有効バンド候補を結ぶ直線に
 * 中間バンドの候補が乗っているかを確認することで、手持ち撮影による回転で綴じ目が斜めになる場合を
 * 正しく直線として捉えつつ、無関係な物体が紛れ込んだ場合(直線に乗らない)は除外する。谷が明確でない、
 * またはバンド間で一貫した直線が引けない場合はbounding boxの水平中央にフォールバックする
 * (画像全体の中央ではなく検出済み四隅基準にする時点で、本が写真の中央にない場合の問題は解消される)。
 */
export function findGutterLine(imageData: ImageData, corners: Corners): GutterLine {
  const { width, height, data } = imageData;
  const box = cornersBoundingBox(corners);

  const top = Math.max(0, Math.round(box.minY + (box.maxY - box.minY) * VERTICAL_INSET_RATIO));
  const bottom = Math.min(height, Math.round(box.maxY - (box.maxY - box.minY) * VERTICAL_INSET_RATIO));

  const searchMargin = ((box.maxX - box.minX) * (1 - HORIZONTAL_SEARCH_RATIO)) / 2;
  const searchStart = Math.max(0, Math.round(box.minX + searchMargin));
  const searchEnd = Math.min(width, Math.round(box.maxX - searchMargin));

  const fallbackX = clampSplitX(Math.round((box.minX + box.maxX) / 2), width);
  const fallback: GutterLine = { topX: fallbackX, bottomX: fallbackX };
  if (searchEnd - searchStart < 2 || bottom - top < 1) {
    return fallback;
  }

  const bandBounds = splitIntoBands(top, bottom, NUM_BANDS);
  const points: Array<{ y: number; x: number }> = [];
  for (const [bandTop, bandBottom] of bandBounds) {
    if (bandBottom - bandTop < 1) continue;
    const candidate = findBandCandidate(data, width, searchStart, searchEnd, bandTop, bandBottom);
    if (candidate !== null) points.push({ y: (bandTop + bandBottom) / 2, x: candidate });
  }

  // 過半数のバンドが谷を検出できていない = 全高で一貫した暗部ではない可能性が高い
  if (points.length < MIN_AGREEING_BANDS) {
    return fallback;
  }

  // 1段階目: 有効な全バンド候補で最小二乗フィットする。最上段・最下段の2点だけで傾きを決めると、
  // 実写真ではどちらか一方のバンドの谷底位置が数px単位でぶれただけで、探索範囲の上端・下端まで
  // 外挿する際にその誤差が大きく増幅されてしまう(実写真での検証で確認済み)。全バンドを使った
  // 回帰にすることで、1バンドのノイズが結果全体に与える影響を平均化して抑える。
  const firstFit = fitLine(points);
  const tolerance = (searchEnd - searchStart) * LINE_AGREEMENT_TOLERANCE_RATIO;
  const inliers = points.filter((p) => Math.abs(p.x - predictX(firstFit, p.y)) <= tolerance);

  // 直線に乗っているバンドが過半数に満たない = バンド間の一致が弱く、信頼できない
  if (inliers.length < MIN_AGREEING_BANDS) {
    return fallback;
  }

  // 2段階目: 無関係な物体などの外れ値を除いたinliersだけで再フィットし、精度を上げる。
  const fit = fitLine(inliers);

  return {
    topX: clampSplitX(Math.round(predictX(fit, top)), width),
    bottomX: clampSplitX(Math.round(predictX(fit, bottom)), width),
  };
}

type LineFit = { slope: number; intercept: number };

function predictX(fit: LineFit, y: number): number {
  return fit.slope * y + fit.intercept;
}

/** (y, x)の点群に対する最小二乗直線 x = slope*y + intercept を求める。yがすべて同じ(縮退)場合は
 * 傾き0(水平線、x=平均値)として扱う。 */
function fitLine(points: Array<{ y: number; x: number }>): LineFit {
  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumYY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumYY += p.y * p.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  const denom = sumYY - n * meanY * meanY;
  if (Math.abs(denom) < 1e-6) {
    return { slope: 0, intercept: meanX };
  }
  const slope = (sumXY - n * meanX * meanY) / denom;
  return { slope, intercept: meanX - slope * meanY };
}

/** [top, bottom) をnum個の連続する帯に分割する。割り切れない端数は前方の帯から順に吸収する。 */
function splitIntoBands(top: number, bottom: number, num: number): Array<[number, number]> {
  const bounds: Array<[number, number]> = [];
  let cursor = top;
  for (let i = 0; i < num; i++) {
    const remainingBands = num - i;
    const size = Math.round((bottom - cursor) / remainingBands);
    const next = cursor + size;
    bounds.push([cursor, next]);
    cursor = next;
  }
  return bounds;
}

/** 1バンド分の列輝度プロファイルを作り、深さと谷形状(両側の回復)の条件を満たす列の中で
 * 最も暗いものを候補のx座標(元画像座標系)として返す。単純に最も暗い列を選んでからその1点だけ
 * 形状チェックするのではなく、条件を満たす全列の中からベストを選ぶ必要がある。そうしないと、
 * 「探索窓の端まで暗が続く物体の縁」がたまたま画像全体で最も暗く、かつタイブレークで最初に
 * ヒットした場合に、その1点が形状チェックで弾かれてバンド全体が無効票になってしまい、
 * 同じバンド内に存在するはずの本物の谷を見逃してしまう。満たす列が無ければnull(無効票)。 */
function findBandCandidate(
  data: Uint8ClampedArray,
  width: number,
  searchStart: number,
  searchEnd: number,
  bandTop: number,
  bandBottom: number,
): number | null {
  const rowStep = Math.max(1, Math.floor((bandBottom - bandTop) / MAX_SAMPLED_ROWS_PER_BAND));

  const profile: number[] = [];
  for (let x = searchStart; x < searchEnd; x++) {
    let sum = 0;
    let count = 0;
    for (let y = bandTop; y < bandBottom; y += rowStep) {
      sum += luminance(data, y * width + x);
      count++;
    }
    profile.push(count > 0 ? sum / count : 0);
  }

  const smoothed = smooth(profile, SMOOTHING_WINDOW);

  let sum = 0;
  for (let i = 0; i < smoothed.length; i++) sum += smoothed[i];
  const mean = sum / smoothed.length;
  if (mean <= 0) return null;

  // 各列について、そこから左端・右端までの最大値(=その列より外側で最も明るい点)を
  // 前方/後方からの累積最大値として求めておく。谷候補が両側で回復しているかの判定に使う。
  const prefixMax: number[] = new Array(smoothed.length);
  let runningMax = -Infinity;
  for (let i = 0; i < smoothed.length; i++) {
    runningMax = Math.max(runningMax, smoothed[i]);
    prefixMax[i] = runningMax;
  }
  const suffixMax: number[] = new Array(smoothed.length);
  runningMax = -Infinity;
  for (let i = smoothed.length - 1; i >= 0; i--) {
    runningMax = Math.max(runningMax, smoothed[i]);
    suffixMax[i] = runningMax;
  }

  // 深さが同点の場合は探索窓の中央に近い候補を優先する(綴じ目は中央付近にあるはずという前提に
  // 沿う)。単純に最初に見つかった(=最も左の)候補を採用すると、無関係な暗部がたまたま同じ深さで
  // 中央寄りの本物の谷より先にヒットした場合に誤って選んでしまう。
  const center = (smoothed.length - 1) / 2;
  let bestIndex = -1;
  let bestValue = Infinity;
  let bestDistanceFromCenter = Infinity;
  for (let i = 0; i < smoothed.length; i++) {
    const value = smoothed[i];
    if ((mean - value) / mean < MIN_VALLEY_DEPTH_RATIO) continue;

    // 谷底の両側がバンド平均方向へ十分回復しているかを確認する。片側だけ暗いまま
    // (探索窓の端まで暗が続く)場合は綴じ目の影ではなく物体の縁・段差の可能性が高いため除外する
    const recoveryTarget = value + (mean - value) * VALLEY_RECOVERY_RATIO;
    if (prefixMax[i] < recoveryTarget || suffixMax[i] < recoveryTarget) continue;

    const distanceFromCenter = Math.abs(i - center);
    if (value < bestValue || (value === bestValue && distanceFromCenter < bestDistanceFromCenter)) {
      bestValue = value;
      bestDistanceFromCenter = distanceFromCenter;
      bestIndex = i;
    }
  }

  if (bestIndex === -1) return null;
  return searchStart + bestIndex;
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
