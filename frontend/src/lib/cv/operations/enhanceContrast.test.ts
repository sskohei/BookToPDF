import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CvMat, CvMatVector, CvModule } from "../opencv-types";
import { runEnhanceContrast } from "./enhanceContrast";

class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

function fakeMat(cols = 0, rows = 0): CvMat & { deleted: boolean } {
  const mat = {
    data: new Uint8Array(cols * rows * 4),
    data32S: new Int32Array(0),
    cols,
    rows,
    deleted: false,
    roi: vi.fn(() => mat) as unknown as CvMat["roi"],
    clone: vi.fn(() => mat) as unknown as CvMat["clone"],
    delete() {
      mat.deleted = true;
    },
  };
  return mat;
}

function fakeClahe(apply: (src: CvMat, dst: CvMat) => void) {
  const clahe = {
    apply: vi.fn(apply),
    deleted: false,
    delete() {
      clahe.deleted = true;
    },
  };
  return clahe;
}

beforeEach(() => {
  vi.stubGlobal("ImageData", FakeImageData);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function buildCv(minMaxLoc: { minVal: number; maxVal: number }) {
  const src = fakeMat(2, 2);
  const rgb = fakeMat(2, 2);
  const lab = fakeMat(2, 2);
  const rgba = fakeMat(2, 2);
  const l = fakeMat(2, 2);
  const a = fakeMat(2, 2);
  const b = fakeMat(2, 2);
  const clahe = fakeClahe(() => {});

  const matQueue = [rgb, lab, rgba];
  const channels = [l, a, b];
  const mv: CvMatVector & { deleted: boolean } = {
    deleted: false,
    size: () => channels.length,
    get: (i: number) => channels[i],
    delete() {
      mv.deleted = true;
    },
  };

  const cv: CvModule = {
    Mat: vi.fn(function () {
      return matQueue.shift() as CvMat;
    }) as unknown as CvModule["Mat"],
    MatVector: vi.fn(function () {
      return mv;
    }) as unknown as CvModule["MatVector"],
    Size: vi.fn(function (width: number, height: number) {
      return { width, height };
    }) as unknown as CvModule["Size"],
    Point: vi.fn() as unknown as CvModule["Point"],
    Rect: vi.fn() as unknown as CvModule["Rect"],
    CLAHE: vi.fn(function () {
      return clahe;
    }) as unknown as CvModule["CLAHE"],
    matFromImageData: vi.fn(() => src),
    cvtColor: vi.fn(),
    GaussianBlur: vi.fn(),
    Canny: vi.fn(),
    findContours: vi.fn(),
    contourArea: vi.fn(() => 0),
    arcLength: vi.fn(() => 0),
    approxPolyDP: vi.fn(),
    matFromArray: vi.fn() as unknown as CvModule["matFromArray"],
    getPerspectiveTransform: vi.fn() as unknown as CvModule["getPerspectiveTransform"],
    warpPerspective: vi.fn(),
    exceptionFromPtr: vi.fn(() => ({ msg: "unused" })),
    equalizeHist: vi.fn(),
    morphologyEx: vi.fn(),
    getStructuringElement: vi.fn() as unknown as CvModule["getStructuringElement"],
    minAreaRect: vi.fn() as unknown as CvModule["minAreaRect"],
    RotatedRect: { points: vi.fn(() => []) },
    HoughLinesP: vi.fn(),
    getRotationMatrix2D: vi.fn() as unknown as CvModule["getRotationMatrix2D"],
    warpAffine: vi.fn(),
    threshold: vi.fn(),
    boundingRect: vi.fn() as unknown as CvModule["boundingRect"],
    minMaxLoc: vi.fn(() => minMaxLoc),
    convertScaleAbs: vi.fn(),
    split: vi.fn(),
    merge: vi.fn(),
    COLOR_RGBA2GRAY: 11,
    COLOR_GRAY2RGBA: 12,
    COLOR_RGBA2RGB: 13,
    COLOR_RGB2RGBA: 14,
    COLOR_RGB2Lab: 15,
    COLOR_Lab2RGB: 16,
    RETR_EXTERNAL: 21,
    CHAIN_APPROX_SIMPLE: 22,
    CV_32FC2: 0,
    MORPH_CLOSE: 31,
    MORPH_RECT: 32,
    THRESH_BINARY: 0,
    THRESH_BINARY_INV: 1,
    THRESH_OTSU: 8,
    BORDER_CONSTANT: 0,
    INTER_LINEAR: 1,
  };

  return { cv, src, rgb, lab, rgba, l, a, b, mv, clahe };
}

describe("runEnhanceContrast", () => {
  it("applies CLAHE to the L channel and stretches brightness when the range is narrow", () => {
    const { cv, src, rgb, lab, rgba, l, a, b, mv, clahe } = buildCv({ minVal: 50, maxVal: 150 });
    const imageData = new FakeImageData(new Uint8ClampedArray(16), 2, 2) as unknown as ImageData;

    const result = runEnhanceContrast(cv, { imageData });

    expect(cv.cvtColor).toHaveBeenNthCalledWith(1, src, rgb, cv.COLOR_RGBA2RGB);
    expect(cv.cvtColor).toHaveBeenNthCalledWith(2, rgb, lab, cv.COLOR_RGB2Lab);
    expect(cv.split).toHaveBeenCalledWith(lab, mv);
    expect(clahe.apply).toHaveBeenCalledWith(l, l);
    expect(cv.convertScaleAbs).toHaveBeenCalledWith(l, l, 2.55, expect.closeTo(-127.5, 5));
    expect(cv.merge).toHaveBeenCalledWith(mv, lab);
    expect(cv.cvtColor).toHaveBeenNthCalledWith(3, lab, rgb, cv.COLOR_Lab2RGB);
    expect(cv.cvtColor).toHaveBeenNthCalledWith(4, rgb, rgba, cv.COLOR_RGB2RGBA);
    expect(result.imageData.width).toBe(2);
    expect(result.imageData.height).toBe(2);

    for (const mat of [src, rgb, lab, rgba, l, a, b]) {
      expect(mat.deleted).toBe(true);
    }
    expect(mv.deleted).toBe(true);
    expect(clahe.deleted).toBe(true);
  });

  it("skips the brightness stretch when the range is already wide", () => {
    const { cv, l } = buildCv({ minVal: 0, maxVal: 250 });
    const imageData = new FakeImageData(new Uint8ClampedArray(16), 2, 2) as unknown as ImageData;

    runEnhanceContrast(cv, { imageData });

    expect(cv.convertScaleAbs).not.toHaveBeenCalled();
    void l;
  });

  it("deletes every Mat/CLAHE instance it creates, even when clahe.apply throws", () => {
    const { cv, src, rgb, lab, rgba, l, a, b, mv, clahe } = buildCv({ minVal: 50, maxVal: 150 });
    clahe.apply = vi.fn(() => {
      throw new Error("boom");
    });
    const imageData = new FakeImageData(new Uint8ClampedArray(16), 2, 2) as unknown as ImageData;

    expect(() => runEnhanceContrast(cv, { imageData })).toThrow("boom");

    for (const mat of [src, rgb, lab, rgba, l, a, b]) {
      expect(mat.deleted).toBe(true);
    }
    expect(mv.deleted).toBe(true);
    expect(clahe.deleted).toBe(true);
  });
});
