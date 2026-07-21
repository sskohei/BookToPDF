import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CvMat, CvModule } from "../opencv-types";
import { computeDeskewAngle, runDeskew } from "./deskew";

class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

type FakeMat = Omit<CvMat, "data" | "data32S"> & {
  data: Uint8Array;
  data32S: Int32Array;
  deleted: boolean;
};

function fakeMat(cols = 0, rows = 0): FakeMat {
  const mat: FakeMat = {
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

function linesFromSegments(segments: Array<[number, number, number, number]>): Int32Array {
  const data = new Int32Array(segments.length * 4);
  segments.forEach(([x1, y1, x2, y2], i) => {
    data[i * 4] = x1;
    data[i * 4 + 1] = y1;
    data[i * 4 + 2] = x2;
    data[i * 4 + 3] = y2;
  });
  return data;
}

beforeEach(() => {
  vi.stubGlobal("ImageData", FakeImageData);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("computeDeskewAngle", () => {
  it("returns the median angle (degrees) of near-horizontal lines", () => {
    const lines = fakeMat();
    lines.data32S = linesFromSegments([
      [0, 0, 100, 2], // ~1.15deg
      [0, 0, 100, 4], // ~2.29deg
      [0, 0, 100, 6], // ~3.43deg
    ]);
    expect(computeDeskewAngle(lines)).toBeCloseTo(2.29, 1);
  });

  it("normalizes reversed-direction horizontal lines (endpoints swapped) to the same small angle", () => {
    const lines = fakeMat();
    lines.data32S = linesFromSegments([
      [0, 0, 100, 2],
      [100, 2, 0, 0], // same line, endpoints reversed -> angle near 180, should normalize near 1.15
      [0, 1, 100, 3],
    ]);
    const angle = computeDeskewAngle(lines);
    expect(angle).toBeGreaterThan(0);
    expect(angle).toBeLessThan(5);
  });

  it("excludes lines beyond the +-15 degree tilt assumption", () => {
    const lines = fakeMat();
    lines.data32S = linesFromSegments([
      [0, 0, 100, 2],
      [0, 0, 100, 3],
      [0, 0, 100, 1],
      [0, 0, 10, 100], // near-vertical, ~84deg, excluded
    ]);
    expect(computeDeskewAngle(lines)).not.toBe(0);
    // sanity: only the 3 near-horizontal lines contribute, median of [~1.15, ~1.72, ~0.57] ~= 1.15
    expect(computeDeskewAngle(lines)).toBeCloseTo(1.15, 1);
  });

  it("returns 0 when fewer than 3 valid lines are found", () => {
    const lines = fakeMat();
    lines.data32S = linesFromSegments([
      [0, 0, 100, 5],
      [0, 0, 100, 5],
    ]);
    expect(computeDeskewAngle(lines)).toBe(0);
  });
});

function buildCv(linesData32S: Int32Array) {
  const src = fakeMat(10, 10);
  const gray = fakeMat(10, 10);
  const blurred = fakeMat(10, 10);
  const edges = fakeMat(10, 10);
  const lines = fakeMat();
  lines.data32S = linesData32S;
  const rotationMatrix = fakeMat();
  const rotated = fakeMat(10, 10);

  const matQueue: FakeMat[] = [gray, blurred, edges, lines];
  const rotatedQueue: FakeMat[] = [rotated];

  const cv: CvModule = {
    Mat: vi.fn(function () {
      return (matQueue.shift() ?? rotatedQueue.shift()) as CvMat;
    }) as unknown as CvModule["Mat"],
    MatVector: vi.fn() as unknown as CvModule["MatVector"],
    Size: vi.fn(function (width: number, height: number) {
      return { width, height };
    }) as unknown as CvModule["Size"],
    Point: vi.fn(function (x: number, y: number) {
      return { x, y };
    }) as unknown as CvModule["Point"],
    Rect: vi.fn() as unknown as CvModule["Rect"],
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
    getRotationMatrix2D: vi.fn(() => rotationMatrix),
    warpAffine: vi.fn(),
    threshold: vi.fn(),
    boundingRect: vi.fn() as unknown as CvModule["boundingRect"],
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

  return { cv, src, gray, blurred, edges, lines, rotationMatrix, rotated };
}

describe("runDeskew", () => {
  it("rotates by the computed angle when a confident tilt is found", () => {
    const linesData = linesFromSegments([
      [0, 0, 100, 2],
      [0, 0, 100, 3],
      [0, 0, 100, 1],
    ]);
    const { cv, src, gray, blurred, edges, lines, rotationMatrix, rotated } = buildCv(linesData);
    const imageData = new FakeImageData(new Uint8ClampedArray(400), 10, 10) as unknown as ImageData;

    const result = runDeskew(cv, { imageData });

    expect(cv.cvtColor).toHaveBeenCalledWith(src, gray, cv.COLOR_RGBA2GRAY);
    expect(cv.GaussianBlur).toHaveBeenCalledWith(gray, blurred, { width: 5, height: 5 }, 0);
    expect(cv.Canny).toHaveBeenCalledWith(blurred, edges, expect.any(Number), expect.any(Number));
    expect(cv.HoughLinesP).toHaveBeenCalledWith(
      edges,
      lines,
      1,
      Math.PI / 180,
      80,
      expect.any(Number),
      20,
    );
    expect(cv.getRotationMatrix2D).toHaveBeenCalledWith(
      { x: 5, y: 5 },
      expect.closeTo(1.15, 1),
      1.0,
    );
    expect(cv.warpAffine).toHaveBeenCalledWith(
      src,
      rotated,
      rotationMatrix,
      { width: 10, height: 10 },
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      [255, 255, 255, 255],
    );
    expect(result.angleDegrees).toBeCloseTo(1.15, 1);
    expect(result.imageData.width).toBe(10);
    expect(result.imageData.height).toBe(10);

    expect(src.deleted).toBe(true);
    expect(gray.deleted).toBe(true);
    expect(blurred.deleted).toBe(true);
    expect(edges.deleted).toBe(true);
    expect(lines.deleted).toBe(true);
    expect(rotationMatrix.deleted).toBe(true);
    expect(rotated.deleted).toBe(true);
  });

  it("skips warpAffine and returns the input unchanged when no confident angle is found", () => {
    const linesData = linesFromSegments([[0, 0, 100, 5]]); // only 1 valid line, below MIN_VALID_LINE_COUNT
    const { cv, src, gray, blurred, edges, lines } = buildCv(linesData);
    const imageData = new FakeImageData(new Uint8ClampedArray(400), 10, 10) as unknown as ImageData;

    const result = runDeskew(cv, { imageData });

    expect(cv.getRotationMatrix2D).not.toHaveBeenCalled();
    expect(cv.warpAffine).not.toHaveBeenCalled();
    expect(result).toEqual({ imageData, angleDegrees: 0 });

    expect(src.deleted).toBe(true);
    expect(gray.deleted).toBe(true);
    expect(blurred.deleted).toBe(true);
    expect(edges.deleted).toBe(true);
    expect(lines.deleted).toBe(true);
  });

  it("deletes every Mat it creates, even when warpAffine throws", () => {
    const linesData = linesFromSegments([
      [0, 0, 100, 2],
      [0, 0, 100, 3],
      [0, 0, 100, 1],
    ]);
    const { cv, src, gray, blurred, edges, lines, rotationMatrix, rotated } = buildCv(linesData);
    cv.warpAffine = vi.fn(() => {
      throw new Error("boom");
    });
    const imageData = new FakeImageData(new Uint8ClampedArray(400), 10, 10) as unknown as ImageData;

    expect(() => runDeskew(cv, { imageData })).toThrow("boom");

    expect(src.deleted).toBe(true);
    expect(gray.deleted).toBe(true);
    expect(blurred.deleted).toBe(true);
    expect(edges.deleted).toBe(true);
    expect(lines.deleted).toBe(true);
    expect(rotationMatrix.deleted).toBe(true);
    expect(rotated.deleted).toBe(true);
  });
});
