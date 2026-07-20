import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Corners } from "../geometry";
import type { CvMat, CvModule } from "../opencv-types";
import { runPerspectiveTransform } from "./perspectiveTransform";

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
    delete() {
      mat.deleted = true;
    },
  };
  return mat;
}

beforeEach(() => {
  vi.stubGlobal("ImageData", FakeImageData);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const corners: Corners = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 100, y: 0 },
  bottomRight: { x: 100, y: 50 },
  bottomLeft: { x: 0, y: 50 },
};

function buildCv() {
  const src = fakeMat();
  const srcPoints = fakeMat();
  const dstPoints = fakeMat();
  const transform = fakeMat();
  const warped = fakeMat(100, 50);
  const matFromArrayCalls: unknown[][] = [];

  const cv: CvModule = {
    Mat: vi.fn(function () {
      return warped;
    }) as unknown as CvModule["Mat"],
    MatVector: vi.fn() as unknown as CvModule["MatVector"],
    Size: vi.fn(function (width: number, height: number) {
      return { width, height };
    }) as unknown as CvModule["Size"],
    matFromImageData: vi.fn(() => src),
    cvtColor: vi.fn(),
    GaussianBlur: vi.fn(),
    Canny: vi.fn(),
    findContours: vi.fn(),
    contourArea: vi.fn(() => 0),
    arcLength: vi.fn(() => 0),
    approxPolyDP: vi.fn(),
    matFromArray: vi.fn((rows: number, cols: number, type: number, array: number[]) => {
      matFromArrayCalls.push([rows, cols, type, array]);
      return matFromArrayCalls.length === 1 ? srcPoints : dstPoints;
    }),
    getPerspectiveTransform: vi.fn(() => transform),
    warpPerspective: vi.fn(),
    exceptionFromPtr: vi.fn(() => ({ msg: "unused" })),
    COLOR_RGBA2GRAY: 11,
    COLOR_GRAY2RGBA: 12,
    RETR_EXTERNAL: 21,
    CHAIN_APPROX_SIMPLE: 22,
    CV_32FC2: 13,
  };

  return { cv, src, srcPoints, dstPoints, transform, warped, matFromArrayCalls };
}

describe("runPerspectiveTransform", () => {
  it("builds correspondence points in topLeft/topRight/bottomRight/bottomLeft order and warps to the quad size", () => {
    const { cv, src, srcPoints, dstPoints, transform, warped, matFromArrayCalls } = buildCv();
    const imageData = new FakeImageData(new Uint8ClampedArray(4), 1, 1) as unknown as ImageData;

    const result = runPerspectiveTransform(cv, { imageData, corners });

    expect(matFromArrayCalls[0]).toEqual([4, 1, cv.CV_32FC2, [0, 0, 100, 0, 100, 50, 0, 50]]);
    expect(matFromArrayCalls[1]).toEqual([4, 1, cv.CV_32FC2, [0, 0, 99, 0, 99, 49, 0, 49]]);
    expect(cv.getPerspectiveTransform).toHaveBeenCalledWith(srcPoints, dstPoints);
    expect(cv.warpPerspective).toHaveBeenCalledWith(src, warped, transform, { width: 100, height: 50 });
    expect(result.imageData.width).toBe(100);
    expect(result.imageData.height).toBe(50);
  });

  it("deletes every Mat it creates, even when warpPerspective throws", () => {
    const { cv, src, srcPoints, dstPoints, transform, warped } = buildCv();
    cv.warpPerspective = vi.fn(() => {
      throw new Error("boom");
    });
    const imageData = new FakeImageData(new Uint8ClampedArray(4), 1, 1) as unknown as ImageData;

    expect(() => runPerspectiveTransform(cv, { imageData, corners })).toThrow("boom");

    expect(src.deleted).toBe(true);
    expect(srcPoints.deleted).toBe(true);
    expect(dstPoints.deleted).toBe(true);
    expect(transform.deleted).toBe(true);
    expect(warped.deleted).toBe(true);
  });
});
