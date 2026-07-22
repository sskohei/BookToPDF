import type { Point } from "./geometry";

/**
 * 見開き綴じ目付近の湾曲(本を開いたときの物理的な曲面によって上下辺が弓なりになる現象)を
 * 表す二次曲線。`start`→`end`の弦に沿ったローカル座標系(原点は弦の中点、u軸は弦の方向)で
 * `v = a*u^2 + b*u + c`として表すことで、写真全体の傾き(症状3の「傾き」)の影響を受けずに
 * 湾曲そのものだけを捉えられる(傾きを含んだ画像座標系のままy=f(x)を直接フィットすると、
 * 傾きの分だけ二次項の推定が歪む)。
 */
export type QuadraticCurve = {
  origin: Point;
  axis: Point; // 弦方向の単位ベクトル(ローカルu軸)
  a: number;
  b: number;
  c: number;
  start: Point;
  end: Point;
  /** フィットに使った点数。二次関数(a,b,cの3自由度)は3点あれば残差0で必ず一致してしまい、
   * 当てはまり品質の判定(rmsResidual)が無意味になるため、点数不足自体を別途チェックできる
   * よう保持する(`isCurveSignificant`のMIN_POINTS_FOR_RELIABLE_FIT参照)。 */
  pointCount: number;
  /** 実測v座標とフィット曲線の予測値v(u)との差のRMS(残差)。実写真では背景混入・木目・
   * 手の影などのノイズが輪郭点に混じりうるため、変形量の大きさだけでなく、そもそも
   * 二次曲線として点群がどれだけ「のっているか」も見て信頼性を判定する
   * (`isCurveSignificant`参照)。 */
  rmsResidual: number;
};

/**
 * `start`→`end`の弦に沿ったローカル座標系に`points`を回転させてから、
 * `v(u) = a*u*(u - chordLength)`(`v(0)=0`かつ`v(chordLength)=0`を必ず満たす、
 * 二次関数の1自由度の部分族)を最小二乗フィットする。
 *
 * `start`/`end`は、綴じ目側なら`deriveHalfCorners`が幾何学的に導出した信頼済みの点、
 * 外周側なら精密化済みの検出頂点であり、いずれもこの曲線が実際に通るべき点として
 * 呼び出し側から渡されている。これを無視してa,b,cの3自由度を完全に自由回帰すると、
 * 実写真のノイズ(指の写り込み・背景混入等で輪郭点が乱れた場合)次第でフィット曲線の
 * 両端がstart/endから大きくずれてしまい、ルールドサーフェス変形の境界が実際の
 * 綴じ目位置からずれて隣ページを巻き込む結果になる(実写真での検証で確認された回帰。
 * 指の写り込みで下辺の輪郭点にノイズが乗り、自由フィットが実際の頂点から30px以上
 * ずれた事例で発見)。両端を必ず通ることを制約することで、輪郭点がどれだけノイズを
 * 持っていても曲線の境界は必ずstart/endに一致し、残る1自由度(曲がり具合`a`)だけを
 * データから推定する。
 */
export function fitEdgeCurve(points: readonly Point[], start: Point, end: Point): QuadraticCurve {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const chordLength = Math.hypot(dx, dy);
  const axis: Point = chordLength > 1e-9 ? { x: dx / chordLength, y: dy / chordLength } : { x: 1, y: 0 };
  const origin = start;

  const toLocal = (p: Point): { u: number; v: number } => {
    const px = p.x - origin.x;
    const py = p.y - origin.y;
    return { u: px * axis.x + py * axis.y, v: -px * axis.y + py * axis.x };
  };

  const local = points.map(toLocal);

  if (local.length < 2 || chordLength < 1e-9) {
    // 点が少なすぎる/弦が縮退している場合は、直線(a=0、start/endを結ぶだけ)として扱う。
    return { origin, axis, a: 0, b: 0, c: 0, start, end, pointCount: local.length, rmsResidual: 0 };
  }

  // v(u) = a*k(u), k(u) = u*(u - chordLength) という1次元の最小二乗(原点を通る回帰)。
  let numerator = 0;
  let denominator = 0;
  for (const { u, v } of local) {
    const k = u * (u - chordLength);
    numerator += k * v;
    denominator += k * k;
  }
  const a = Math.abs(denominator) > 1e-9 ? numerator / denominator : 0;
  const b = -a * chordLength;
  const c = 0;

  let squaredResidualSum = 0;
  for (const { u, v } of local) {
    const predicted = a * u * u + b * u + c;
    squaredResidualSum += (v - predicted) ** 2;
  }
  const rmsResidual = Math.sqrt(squaredResidualSum / local.length);

  return { origin, axis, a, b, c, start, end, pointCount: local.length, rmsResidual };
}

/** 弦に沿った位置t∈[0,1](0=start, 1=end)における曲線上の点を画像座標系で返す。 */
export function evaluateCurve(curve: QuadraticCurve, t: number): Point {
  const chordLength = Math.hypot(curve.end.x - curve.origin.x, curve.end.y - curve.origin.y);
  const u = t * chordLength;
  const v = curve.a * u * u + curve.b * u + curve.c;
  return {
    x: curve.origin.x + u * curve.axis.x - v * curve.axis.y,
    y: curve.origin.y + u * curve.axis.y + v * curve.axis.x,
  };
}

function chordLengthOf(curve: QuadraticCurve): number {
  return Math.hypot(curve.end.x - curve.origin.x, curve.end.y - curve.origin.y);
}

/**
 * 弦からの最大垂直距離(v(u)の絶対値の最大)を求める。v(u)は上に凸/下に凸のいずれでも、
 * [0, chordLength]の範囲の最大絶対値を調べれば十分。二次関数の頂点(u=-b/2a)が範囲内に
 * あればそこも候補に入れる(`isCurveSignificant`・`clampCurveMagnitude`で共用する)。
 */
function computeMaxAbsDeviation(curve: QuadraticCurve, chordLength: number): number {
  const candidates = [0, chordLength];
  const vertexU = curve.a !== 0 ? -curve.b / (2 * curve.a) : NaN;
  if (vertexU > 0 && vertexU < chordLength) candidates.push(vertexU);

  let maxAbsV = 0;
  for (const u of candidates) {
    const v = curve.a * u * u + curve.b * u + curve.c;
    maxAbsV = Math.max(maxAbsV, Math.abs(v));
  }
  return maxAbsV;
}

const DEFAULT_SIGNIFICANCE_RATIO = 0.01;
const MIN_SIGNIFICANCE_PX = 3;
/**
 * 二次関数はa,b,cの3自由度しか持たないため、3点だけでフィットすると必ず残差0で厳密に一致してしまい、
 * rmsResidualによる当てはまり品質の判定が機能しない。実写真では背景混入・木目・手の影などの
 * ノイズが輪郭点に混じりうるため、それらしい形の曲線が少数点に過剰適合するのを防ぐには、
 * 残差チェックの前に十分な点数があることを要求する必要がある(実写真での検証で確認された、
 * 湾曲補正が暴走する回帰の主因の1つ)。
 */
const MIN_POINTS_FOR_RELIABLE_FIT = 8;
/**
 * 変形量(弦からの最大絶対偏差)がRMS残差のこの倍以上なければ、実際の湾曲ではなくノイズへの
 * 過剰適合と区別できないとみなし信頼しない。
 */
const DEFAULT_MIN_SIGNAL_TO_NOISE_RATIO = 3;

export type CurveSignificanceOptions = {
  thresholdRatio?: number;
  minSignalToNoiseRatio?: number;
};

/**
 * フィットした曲線が「有意な湾曲」として信頼できるかを判定する。変形量(弦からの最大絶対偏差)が
 * 弦長に対する比率+絶対px下限のいずれかを超えていることに加え、(1)十分な点数でフィットされて
 * いること、(2)変形量がRMS残差に対して十分大きい(ノイズと区別できる)ことも要求する。
 * 量子化ノイズ・四隅検出のわずかな誤差・背景混入等による見せかけの湾曲でフラットページ用の
 * 経路を捨てないための、実写真での検証を踏まえたガードレール。
 */
export function isCurveSignificant(curve: QuadraticCurve, options: CurveSignificanceOptions = {}): boolean {
  const { thresholdRatio = DEFAULT_SIGNIFICANCE_RATIO, minSignalToNoiseRatio = DEFAULT_MIN_SIGNAL_TO_NOISE_RATIO } =
    options;

  if (curve.pointCount < MIN_POINTS_FOR_RELIABLE_FIT) return false;

  const chordLength = chordLengthOf(curve);
  if (chordLength < 1e-9) return false;

  const maxAbsV = computeMaxAbsDeviation(curve, chordLength);
  const threshold = Math.max(MIN_SIGNIFICANCE_PX, chordLength * thresholdRatio);
  if (maxAbsV <= threshold) return false;

  if (maxAbsV <= curve.rmsResidual * minSignalToNoiseRatio) return false;

  return true;
}

const DEFAULT_MAX_DEVIATION_RATIO = 0.06;

/**
 * フィットした曲線の最大変形量(弦からの最大絶対偏差)が、弦長に対して`maxDeviationRatio`を
 * 超えないよう、a/b/cを一律スケールダウンする。変形の形状(どこで最大になるか)は変えず、
 * 大きさだけを実際の本のページ湾曲としてありえる範囲に抑える安全弁(実写真での検証で、
 * `isCurveSignificant`を通過した曲線でも、ノイズの影響で不自然に大きい・波打った変形が
 * 適用される事例が確認されたため追加)。
 */
export function clampCurveMagnitude(
  curve: QuadraticCurve,
  maxDeviationRatio: number = DEFAULT_MAX_DEVIATION_RATIO,
): QuadraticCurve {
  const chordLength = chordLengthOf(curve);
  if (chordLength < 1e-9) return curve;

  const maxAbsV = computeMaxAbsDeviation(curve, chordLength);
  const maxAllowed = maxDeviationRatio * chordLength;
  if (maxAbsV <= maxAllowed || maxAbsV < 1e-9) return curve;

  const scale = maxAllowed / maxAbsV;
  return { ...curve, a: curve.a * scale, b: curve.b * scale, c: curve.c * scale };
}

/**
 * `topCurve`と`bottomCurve`の間をルールドサーフェス(ロフト)でつなぎ、出力矩形
 * (`outputWidth`×`outputHeight`)の各ピクセルに対応する元画像上のソース座標を求める。
 * 出力ピクセル(x,y)についてt=x/(W-1)から上辺・下辺それぞれの曲線上の点を求め、
 * y/(H-1)で線形補間した点をソース座標とする(左右の辺は直線のままで問題ない前提。
 * 報告された湾曲は綴じ目付近の上下辺のものであるため)。`cv.remap`にそのまま渡せる
 * 行優先(row-major)のFloat32Arrayを返す。
 */
export function buildRuledSurfaceMap(
  topCurve: QuadraticCurve,
  bottomCurve: QuadraticCurve,
  outputWidth: number,
  outputHeight: number,
): { mapX: Float32Array; mapY: Float32Array } {
  const mapX = new Float32Array(outputWidth * outputHeight);
  const mapY = new Float32Array(outputWidth * outputHeight);

  const topPoints: Point[] = new Array(outputWidth);
  const bottomPoints: Point[] = new Array(outputWidth);
  for (let x = 0; x < outputWidth; x++) {
    const t = outputWidth > 1 ? x / (outputWidth - 1) : 0;
    topPoints[x] = evaluateCurve(topCurve, t);
    bottomPoints[x] = evaluateCurve(bottomCurve, t);
  }

  for (let y = 0; y < outputHeight; y++) {
    const v = outputHeight > 1 ? y / (outputHeight - 1) : 0;
    const rowOffset = y * outputWidth;
    for (let x = 0; x < outputWidth; x++) {
      const top = topPoints[x];
      const bottom = bottomPoints[x];
      mapX[rowOffset + x] = top.x + (bottom.x - top.x) * v;
      mapY[rowOffset + x] = top.y + (bottom.y - top.y) * v;
    }
  }

  return { mapX, mapY };
}
