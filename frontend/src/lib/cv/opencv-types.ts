/**
 * OpenCV.js (opencv.js) の型はゆるく `any` だらけなため、実際にこのプロジェクトで
 * 使う関数・定数だけを対象にした狭い型を手書きする。実 `cv` オブジェクトへのキャストは
 * `workers/loadOpenCv.ts` の1箇所に閉じ込め、それ以外のコードはこの型だけを介して cv を扱う。
 * 新しいOpenCV関数を使う場合はここに必要な分だけ追記する。
 */
export interface CvMat {
  readonly data: Uint8Array;
  /** `approxPolyDP` の出力(CV_32SC2)など、32bit符号付き整数を保持するMatの読み取りに使う。 */
  readonly data32S: Int32Array;
  readonly cols: number;
  readonly rows: number;
  /**
   * ROI(部分行列)のビューを返す。`.data`は元Matのストライドをそのまま参照するため
   * 1行目以外は正しくパックされない。ピクセルを読む前に必ず`.clone()`すること
   * (`trimMargins.ts`のコメント参照)。
   */
  roi(rect: CvRect): CvMat;
  clone(): CvMat;
  delete(): void;
}

export interface CvMatVector {
  size(): number;
  get(index: number): CvMat;
  delete(): void;
}

export interface CvSize {
  readonly width: number;
  readonly height: number;
}

export interface CvException {
  readonly msg: string;
}

/** `minAreaRect` が返す回転外接矩形。`RotatedRect.points` に渡して4頂点を取得する。 */
export interface CvRotatedRect {
  readonly center: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly angle: number;
}

export interface CvPoint {
  readonly x: number;
  readonly y: number;
}

export interface CvRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** `minMaxLoc` の戻り値。位置情報も持つが、このプロジェクトでは値のみ使う。 */
export interface CvMinMaxLocResult {
  readonly minVal: number;
  readonly maxVal: number;
}

/** `new cv.CLAHE(clipLimit, tileGridSize)` で得られるインスタンス。他のcvオブジェクト同様に`delete()`が必要。 */
export interface CvClahe {
  apply(src: CvMat, dst: CvMat): void;
  delete(): void;
}

export interface CvModule {
  Mat: new () => CvMat;
  MatVector: new () => CvMatVector;
  Size: new (width: number, height: number) => CvSize;
  matFromImageData(imageData: ImageData): CvMat;
  cvtColor(src: CvMat, dst: CvMat, code: number): void;
  GaussianBlur(src: CvMat, dst: CvMat, ksize: CvSize, sigmaX: number): void;
  Canny(src: CvMat, dst: CvMat, threshold1: number, threshold2: number): void;
  findContours(
    image: CvMat,
    contours: CvMatVector,
    hierarchy: CvMat,
    mode: number,
    method: number,
  ): void;
  contourArea(contour: CvMat): number;
  arcLength(curve: CvMat, closed: boolean): number;
  approxPolyDP(curve: CvMat, approxCurve: CvMat, epsilon: number, closed: boolean): void;
  /**
   * 対応点(`CV_32FC2`)やリマップ用の座標配列(`CV_32FC1`、`dewarpPage.ts`)など、
   * 座標配列から直接Matを作る。後者は要素数が画素数分(数百万規模)になりうるため、
   * 通常の`number[]`への変換コストを避けられるよう`Float32Array`も受け付ける。
   */
  matFromArray(rows: number, cols: number, type: number, array: number[] | Float32Array): CvMat;
  getPerspectiveTransform(src: CvMat, dst: CvMat): CvMat;
  warpPerspective(src: CvMat, dst: CvMat, transform: CvMat, dsize: CvSize): void;
  /**
   * `dewarpPage.ts`のルールドサーフェス変形で使う汎用リマップ。`map1`/`map2`は出力先の各画素に
   * 対応する元画像上のソース座標(x, y)をそれぞれ`CV_32FC1`のMatとして持つ(`matFromArray`で
   * `Float32Array`から作る)。
   */
  remap(
    src: CvMat,
    dst: CvMat,
    map1: CvMat,
    map2: CvMat,
    interpolation: number,
    borderMode?: number,
    borderValue?: number[],
  ): void;
  exceptionFromPtr(ptr: unknown): CvException;
  /** 低コントラスト画像でCannyエッジを出やすくするためのヒストグラム平坦化。 */
  equalizeHist(src: CvMat, dst: CvMat): void;
  /** 影・照明ムラで途切れたエッジをつなぐモルフォロジー演算。 */
  morphologyEx(src: CvMat, dst: CvMat, op: number, kernel: CvMat): void;
  getStructuringElement(shape: number, ksize: CvSize): CvMat;
  minAreaRect(contour: CvMat): CvRotatedRect;
  /**
   * `RotatedRect`は静的名前空間として公開されており、`points`はその配下のヘルパー。
   * `Mat`ではなく素のPoint配列(長さ4)を返す(OpenCV.js公式サンプルで`vertices[i]`と
   * 直接インデックスアクセスされている挙動に合わせた型)。
   */
  RotatedRect: {
    points(rect: CvRotatedRect): Array<{ x: number; y: number }>;
  };
  Point: new (x: number, y: number) => CvPoint;
  Rect: new (x: number, y: number, width: number, height: number) => CvRect;
  CLAHE: new (clipLimit?: number, tileGridSize?: CvSize) => CvClahe;
  /** 確率的Hough変換。`lines.data32S`に`[x1,y1,x2,y2]`が1行ずつ入る。 */
  HoughLinesP(
    image: CvMat,
    lines: CvMat,
    rho: number,
    theta: number,
    threshold: number,
    minLineLength: number,
    maxLineGap: number,
  ): void;
  getRotationMatrix2D(center: CvPoint, angleDegrees: number, scale: number): CvMat;
  warpAffine(
    src: CvMat,
    dst: CvMat,
    m: CvMat,
    dsize: CvSize,
    flags: number,
    borderMode: number,
    borderValue: number[],
  ): void;
  threshold(src: CvMat, dst: CvMat, thresh: number, maxval: number, type: number): number;
  boundingRect(mat: CvMat): CvRect;
  minMaxLoc(mat: CvMat): CvMinMaxLocResult;
  convertScaleAbs(src: CvMat, dst: CvMat, alpha: number, beta: number): void;
  split(src: CvMat, mv: CvMatVector): void;
  merge(mv: CvMatVector, dst: CvMat): void;
  readonly COLOR_RGBA2GRAY: number;
  readonly COLOR_GRAY2RGBA: number;
  readonly COLOR_RGBA2RGB: number;
  readonly COLOR_RGB2RGBA: number;
  readonly COLOR_RGB2Lab: number;
  readonly COLOR_Lab2RGB: number;
  readonly RETR_EXTERNAL: number;
  readonly CHAIN_APPROX_SIMPLE: number;
  readonly CV_32FC2: number;
  readonly CV_32FC1: number;
  readonly MORPH_CLOSE: number;
  readonly MORPH_OPEN: number;
  readonly MORPH_RECT: number;
  readonly THRESH_BINARY: number;
  readonly THRESH_BINARY_INV: number;
  readonly THRESH_OTSU: number;
  readonly BORDER_CONSTANT: number;
  readonly INTER_LINEAR: number;
}
