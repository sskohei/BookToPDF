/**
 * OpenCV.js (opencv.js) の型はゆるく `any` だらけなため、実際にこのプロジェクトで
 * 使う関数・定数だけを対象にした狭い型を手書きする。実 `cv` オブジェクトへのキャストは
 * `workers/loadOpenCv.ts` の1箇所に閉じ込め、それ以外のコードはこの型だけを介して cv を扱う。
 * 新しいOpenCV関数を使う場合はここに必要な分だけ追記する。
 */
export interface CvMat {
  readonly data: Uint8Array;
  readonly cols: number;
  readonly rows: number;
  delete(): void;
}

export interface CvException {
  readonly msg: string;
}

export interface CvModule {
  Mat: new () => CvMat;
  matFromImageData(imageData: ImageData): CvMat;
  cvtColor(src: CvMat, dst: CvMat, code: number): void;
  exceptionFromPtr(ptr: unknown): CvException;
  readonly COLOR_RGBA2GRAY: number;
  readonly COLOR_GRAY2RGBA: number;
}
