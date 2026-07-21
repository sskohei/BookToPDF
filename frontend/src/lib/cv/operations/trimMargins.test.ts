import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CvMat, CvModule, CvRect } from "../opencv-types";
import { runTrimMargins } from "./trimMargins";

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

/** 四隅の8x8パッチを`brightness`で塗った、残りは反対の輝度で埋めたグレースケール画素配列を作る。 */
function grayDataWithCornerBrightness(width: number, height: number, brightness: number): Uint8Array {
  const data = new Uint8Array(width * height);
  data.fill(brightness >= 128 ? 0 : 255); // 内容側は背景と反対の輝度で埋めておく
  const patch = Math.min(8, width, height);
  const corners: Array<[number, number]> = [
    [0, 0],
    [width - patch, 0],
    [0, height - patch],
    [width - patch, height - patch],
  ];
  for (const [startX, startY] of corners) {
    for (let y = startY; y < startY + patch; y++) {
      for (let x = startX; x < startX + patch; x++) {
        data[y * width + x] = brightness;
      }
    }
  }
  return data;
}

beforeEach(() => {
  vi.stubGlobal("ImageData", FakeImageData);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function buildCv(grayData: Uint8Array, boundingRectResult: CvRect) {
  const src = fakeMat(20, 20);
  const gray = fakeMat(20, 20);
  (gray as unknown as { data: Uint8Array }).data = grayData;
  const mask = fakeMat(20, 20);
  const cropped = fakeMat(boundingRectResult.width, boundingRectResult.height);
  const roiView = fakeMat(boundingRectResult.width, boundingRectResult.height);
  roiView.clone = vi.fn(() => cropped) as unknown as CvMat["clone"];
  src.roi = vi.fn(() => roiView) as unknown as CvMat["roi"];

  const matQueue = [gray, mask];

  const cv: CvModule = {
    Mat: vi.fn(function () {
      return matQueue.shift() as CvMat;
    }) as unknown as CvModule["Mat"],
    MatVector: vi.fn() as unknown as CvModule["MatVector"],
    Size: vi.fn() as unknown as CvModule["Size"],
    Point: vi.fn() as unknown as CvModule["Point"],
    Rect: vi.fn(function (x: number, y: number, width: number, height: number) {
      return { x, y, width, height };
    }) as unknown as CvModule["Rect"],
    CLAHE: vi.fn() as unknown as CvModule["CLAHE"],
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
    boundingRect: vi.fn(() => boundingRectResult),
    minMaxLoc: vi.fn() as unknown as CvModule["minMaxLoc"],
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

  return { cv, src, gray, mask, roiView, cropped };
}

describe("runTrimMargins", () => {
  it("uses THRESH_BINARY_INV|OTSU when the sampled corners are bright (background)", () => {
    const grayData = grayDataWithCornerBrightness(20, 20, 200);
    const rect: CvRect = { x: 1, y: 1, width: 18, height: 18 };
    const { cv, gray, mask, src, roiView, cropped } = buildCv(grayData, rect);
    const imageData = new FakeImageData(new Uint8ClampedArray(20 * 20 * 4), 20, 20) as unknown as ImageData;

    const result = runTrimMargins(cv, { imageData });

    expect(cv.threshold).toHaveBeenCalledWith(gray, mask, 0, 255, 9); // BINARY_INV(1) | OTSU(8)
    expect(cv.Rect).toHaveBeenCalledWith(1, 1, 18, 18);
    expect(src.roi).toHaveBeenCalled();
    expect(roiView.clone).toHaveBeenCalled();
    expect(result).toEqual({ imageData: expect.anything(), trimmed: true });
    expect(result.imageData.width).toBe(cropped.cols);
    expect(result.imageData.height).toBe(cropped.rows);
  });

  it("uses THRESH_BINARY|OTSU when the sampled corners are dark (background)", () => {
    const grayData = grayDataWithCornerBrightness(20, 20, 30);
    const rect: CvRect = { x: 1, y: 1, width: 18, height: 18 };
    const { cv, gray, mask } = buildCv(grayData, rect);
    const imageData = new FakeImageData(new Uint8ClampedArray(20 * 20 * 4), 20, 20) as unknown as ImageData;

    runTrimMargins(cv, { imageData });

    expect(cv.threshold).toHaveBeenCalledWith(gray, mask, 0, 255, 8); // BINARY(0) | OTSU(8)
  });

  it("returns trimmed:false and the original image when the detected content area is implausibly small", () => {
    const grayData = grayDataWithCornerBrightness(20, 20, 200);
    const rect: CvRect = { x: 8, y: 8, width: 4, height: 4 }; // area ratio 16/400 = 0.04
    const { cv, src } = buildCv(grayData, rect);
    const imageData = new FakeImageData(new Uint8ClampedArray(20 * 20 * 4), 20, 20) as unknown as ImageData;

    const result = runTrimMargins(cv, { imageData });

    expect(src.roi).not.toHaveBeenCalled();
    expect(result).toEqual({ imageData, trimmed: false });
  });

  it("deletes every Mat it creates, including on the trimmed path", () => {
    const grayData = grayDataWithCornerBrightness(20, 20, 200);
    const rect: CvRect = { x: 1, y: 1, width: 18, height: 18 };
    const { cv, src, gray, mask, roiView, cropped } = buildCv(grayData, rect);
    const imageData = new FakeImageData(new Uint8ClampedArray(20 * 20 * 4), 20, 20) as unknown as ImageData;

    runTrimMargins(cv, { imageData });

    expect(src.deleted).toBe(true);
    expect(gray.deleted).toBe(true);
    expect(mask.deleted).toBe(true);
    expect(roiView.deleted).toBe(true);
    expect(cropped.deleted).toBe(true);
  });

  it("deletes src/gray/mask even when nothing is trimmed", () => {
    const grayData = grayDataWithCornerBrightness(20, 20, 200);
    const rect: CvRect = { x: 8, y: 8, width: 4, height: 4 };
    const { cv, src, gray, mask } = buildCv(grayData, rect);
    const imageData = new FakeImageData(new Uint8ClampedArray(20 * 20 * 4), 20, 20) as unknown as ImageData;

    runTrimMargins(cv, { imageData });

    expect(src.deleted).toBe(true);
    expect(gray.deleted).toBe(true);
    expect(mask.deleted).toBe(true);
  });
});
