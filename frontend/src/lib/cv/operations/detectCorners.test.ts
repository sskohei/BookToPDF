import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Point } from "../geometry";
import type { CvMat, CvMatVector, CvModule } from "../opencv-types";
import { runDetectCorners } from "./detectCorners";

class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

/**
 * `CvMat.data32S` は本来readonlyだが、`approxPolyDP` の呼び出し結果をテスト側で
 * 差し替えるために書き込み可能な型で再宣言する。
 */
type FakeMat = Omit<CvMat, "data32S"> & { data32S: Int32Array; deleted: boolean };

function fakeMat(): FakeMat {
  const mat: FakeMat = {
    data: new Uint8Array(0),
    data32S: new Int32Array(0),
    cols: 0,
    rows: 0,
    deleted: false,
    delete() {
      mat.deleted = true;
    },
  };
  return mat;
}

function pointsToData32S(points: Point[]): Int32Array {
  const arr = new Int32Array(points.length * 2);
  points.forEach((p, i) => {
    arr[i * 2] = p.x;
    arr[i * 2 + 1] = p.y;
  });
  return arr;
}

beforeEach(() => {
  vi.stubGlobal("ImageData", FakeImageData);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type ContourSpec = { points: Point[]; area: number };

function buildCv(contourSpecs: ContourSpec[]) {
  const src = fakeMat();
  const gray = fakeMat();
  const blurred = fakeMat();
  const edges = fakeMat();
  const hierarchy = fakeMat();
  const approx = fakeMat();
  const matQueue = [gray, blurred, edges, hierarchy, approx];

  const contourMats = contourSpecs.map(() => fakeMat());
  const contoursVector: CvMatVector & { deleted: boolean } = {
    deleted: false,
    size: () => contourMats.length,
    get: (i: number) => contourMats[i],
    delete() {
      contoursVector.deleted = true;
    },
  };

  let currentArea = 0;
  const approxPolyDP = vi.fn((contour: CvMat) => {
    const index = contourMats.indexOf(contour as FakeMat);
    approx.data32S = pointsToData32S(contourSpecs[index].points);
    currentArea = contourSpecs[index].area;
  });
  const contourArea = vi.fn(() => currentArea);

  const cv: CvModule = {
    Mat: vi.fn(function () {
      return matQueue.shift() as CvMat;
    }) as unknown as CvModule["Mat"],
    MatVector: vi.fn(function () {
      return contoursVector;
    }) as unknown as CvModule["MatVector"],
    Size: vi.fn(function (width: number, height: number) {
      return { width, height };
    }) as unknown as CvModule["Size"],
    matFromImageData: vi.fn(() => src),
    cvtColor: vi.fn(),
    GaussianBlur: vi.fn(),
    Canny: vi.fn(),
    findContours: vi.fn(),
    contourArea,
    arcLength: vi.fn(() => 100),
    approxPolyDP,
    matFromArray: vi.fn() as unknown as CvModule["matFromArray"],
    getPerspectiveTransform: vi.fn() as unknown as CvModule["getPerspectiveTransform"],
    warpPerspective: vi.fn(),
    exceptionFromPtr: vi.fn(() => ({ msg: "unused" })),
    COLOR_RGBA2GRAY: 11,
    COLOR_GRAY2RGBA: 12,
    RETR_EXTERNAL: 21,
    CHAIN_APPROX_SIMPLE: 22,
    CV_32FC2: 0,
  };

  return { cv, src, gray, blurred, edges, hierarchy, approx, contoursVector, contourMats };
}

function makeInput(width: number, height: number) {
  return { imageData: new FakeImageData(new Uint8ClampedArray(width * height * 4), width, height) as unknown as ImageData };
}

describe("runDetectCorners", () => {
  it("picks the largest 4-point contour above the area threshold and returns ordered corners", () => {
    const triangle: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 2, y: 5 },
    ];
    const smallQuad: Point[] = [
      { x: 1, y: 1 },
      { x: 5, y: 1 },
      { x: 5, y: 5 },
      { x: 1, y: 5 },
    ];
    const topLeft: Point = { x: 10, y: 10 };
    const topRight: Point = { x: 90, y: 10 };
    const bottomRight: Point = { x: 90, y: 90 };
    const bottomLeft: Point = { x: 10, y: 90 };
    const largeQuad = [bottomRight, topLeft, bottomLeft, topRight];

    const { cv, src, gray, blurred, edges, hierarchy, approx, contoursVector, contourMats } = buildCv([
      { points: triangle, area: 0 },
      { points: smallQuad, area: 50 },
      { points: largeQuad, area: 5000 },
    ]);

    const result = runDetectCorners(cv, makeInput(100, 100));

    expect(cv.cvtColor).toHaveBeenNthCalledWith(1, src, gray, cv.COLOR_RGBA2GRAY);
    expect(cv.GaussianBlur).toHaveBeenNthCalledWith(1, gray, blurred, { width: 5, height: 5 }, 0);
    expect(cv.Canny).toHaveBeenNthCalledWith(1, blurred, edges, 75, 200);
    expect(cv.findContours).toHaveBeenNthCalledWith(
      1,
      edges,
      contoursVector,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );

    expect(result).toEqual({
      found: true,
      corners: { topLeft, topRight, bottomRight, bottomLeft },
    });

    expect(src.deleted).toBe(true);
    expect(gray.deleted).toBe(true);
    expect(blurred.deleted).toBe(true);
    expect(edges.deleted).toBe(true);
    expect(hierarchy.deleted).toBe(true);
    expect(approx.deleted).toBe(true);
    expect(contoursVector.deleted).toBe(true);
    for (const contour of contourMats) {
      expect(contour.deleted).toBe(true);
    }
  });

  it("returns found:false and still cleans up all Mats when no contour qualifies", () => {
    const triangle: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 2, y: 5 },
    ];
    const tooSmallQuad: Point[] = [
      { x: 1, y: 1 },
      { x: 5, y: 1 },
      { x: 5, y: 5 },
      { x: 1, y: 5 },
    ];

    const { cv, src, gray, blurred, edges, hierarchy, approx, contoursVector, contourMats } = buildCv([
      { points: triangle, area: 0 },
      { points: tooSmallQuad, area: 50 },
    ]);

    const result = runDetectCorners(cv, makeInput(100, 100));

    expect(result).toEqual({ found: false });

    expect(src.deleted).toBe(true);
    expect(gray.deleted).toBe(true);
    expect(blurred.deleted).toBe(true);
    expect(edges.deleted).toBe(true);
    expect(hierarchy.deleted).toBe(true);
    expect(approx.deleted).toBe(true);
    expect(contoursVector.deleted).toBe(true);
    for (const contour of contourMats) {
      expect(contour.deleted).toBe(true);
    }
  });
});
