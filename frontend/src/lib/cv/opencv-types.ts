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
  exceptionFromPtr(ptr: unknown): CvException;
  readonly COLOR_RGBA2GRAY: number;
  readonly COLOR_GRAY2RGBA: number;
  readonly RETR_EXTERNAL: number;
  readonly CHAIN_APPROX_SIMPLE: number;
}
