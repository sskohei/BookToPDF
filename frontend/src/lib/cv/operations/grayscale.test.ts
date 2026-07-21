import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CvMat, CvModule } from "../opencv-types";
import { runGrayscale } from "./grayscale";

class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

function fakeMat(cols: number, rows: number): CvMat & { deleted: boolean } {
  const mat = {
    data: new Uint8Array(cols * rows * 4),
    data32S: new Int32Array(0),
    cols,
    rows,
    deleted: false,
    delete() {
      mat.deleted = true;
    },
  };
  return mat;
}

/**
 * runGrayscaleが使わないCvModuleメンバー（issue #5で追加）を埋めるためのスタブ。
 * このテストの関心事ではないので中身は使われない。
 */
const unusedCvMembers: Pick<
  CvModule,
  | "MatVector"
  | "Size"
  | "GaussianBlur"
  | "Canny"
  | "findContours"
  | "contourArea"
  | "arcLength"
  | "approxPolyDP"
  | "matFromArray"
  | "getPerspectiveTransform"
  | "warpPerspective"
  | "equalizeHist"
  | "morphologyEx"
  | "getStructuringElement"
  | "minAreaRect"
  | "RotatedRect"
  | "RETR_EXTERNAL"
  | "CHAIN_APPROX_SIMPLE"
  | "CV_32FC2"
  | "MORPH_CLOSE"
  | "MORPH_RECT"
> = {
  MatVector: vi.fn() as unknown as CvModule["MatVector"],
  Size: vi.fn() as unknown as CvModule["Size"],
  GaussianBlur: vi.fn(),
  Canny: vi.fn(),
  findContours: vi.fn(),
  contourArea: vi.fn(() => 0),
  arcLength: vi.fn(() => 0),
  approxPolyDP: vi.fn(),
  matFromArray: vi.fn() as unknown as CvModule["matFromArray"],
  getPerspectiveTransform: vi.fn() as unknown as CvModule["getPerspectiveTransform"],
  warpPerspective: vi.fn(),
  equalizeHist: vi.fn(),
  morphologyEx: vi.fn(),
  getStructuringElement: vi.fn() as unknown as CvModule["getStructuringElement"],
  minAreaRect: vi.fn() as unknown as CvModule["minAreaRect"],
  RotatedRect: { points: vi.fn(() => []) },
  RETR_EXTERNAL: 0,
  CHAIN_APPROX_SIMPLE: 0,
  CV_32FC2: 0,
  MORPH_CLOSE: 0,
  MORPH_RECT: 0,
};

beforeEach(() => {
  vi.stubGlobal("ImageData", FakeImageData);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runGrayscale", () => {
  it("converts RGBA to gray and back to RGBA, in that order", () => {
    const src = fakeMat(2, 2);
    const gray = fakeMat(2, 2);
    const rgba = fakeMat(2, 2);
    const matQueue = [gray, rgba];
    const cvtColor = vi.fn();
    const cv: CvModule = {
      Mat: vi.fn(function () {
        return matQueue.shift() as CvMat;
      }) as unknown as CvModule["Mat"],
      matFromImageData: vi.fn(() => src),
      cvtColor,
      ...unusedCvMembers,
      exceptionFromPtr: vi.fn(() => ({ msg: "unused" })),
      COLOR_RGBA2GRAY: 11,
      COLOR_GRAY2RGBA: 12,
    };

    const result = runGrayscale(cv, { imageData: new FakeImageData(new Uint8ClampedArray(16), 2, 2) as unknown as ImageData });

    expect(cvtColor).toHaveBeenNthCalledWith(1, src, gray, cv.COLOR_RGBA2GRAY);
    expect(cvtColor).toHaveBeenNthCalledWith(2, gray, rgba, cv.COLOR_GRAY2RGBA);
    expect(result.imageData.width).toBe(2);
    expect(result.imageData.height).toBe(2);
  });

  it("deletes every Mat it creates, even when cvtColor throws", () => {
    const src = fakeMat(1, 1);
    const gray = fakeMat(1, 1);
    const rgba = fakeMat(1, 1);
    const matQueue = [gray, rgba];
    const cv: CvModule = {
      Mat: vi.fn(function () {
        return matQueue.shift() as CvMat;
      }) as unknown as CvModule["Mat"],
      matFromImageData: vi.fn(() => src),
      cvtColor: vi.fn(() => {
        throw new Error("boom");
      }),
      ...unusedCvMembers,
      exceptionFromPtr: vi.fn(() => ({ msg: "unused" })),
      COLOR_RGBA2GRAY: 11,
      COLOR_GRAY2RGBA: 12,
    };

    expect(() =>
      runGrayscale(cv, { imageData: new FakeImageData(new Uint8ClampedArray(4), 1, 1) as unknown as ImageData }),
    ).toThrow("boom");

    expect(src.deleted).toBe(true);
    expect(gray.deleted).toBe(true);
    expect(rgba.deleted).toBe(true);
  });
});
