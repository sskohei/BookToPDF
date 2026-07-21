import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Point } from "../geometry";
import type { CvMat, CvMatVector, CvModule, CvRotatedRect } from "../opencv-types";
import {
  computeAutoCannyThresholds,
  computeMedianIntensity,
  runDetectCorners,
} from "./detectCorners";

class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

/**
 * `CvMat.data`/`data32S` は本来readonlyだが、テスト側で
 * `Canny`入力の画素値や`approxPolyDP`の呼び出し結果を差し替えるために
 * 書き込み可能な型で再宣言する。
 */
type FakeMat = Omit<CvMat, "data" | "data32S"> & {
  data: Uint8Array;
  data32S: Int32Array;
  deleted: boolean;
};

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

/**
 * `points`に配列の配列を渡すと、`approxPolyDP`の呼び出し順(epsilon緩和の各段階)ごとに
 * 異なる近似結果を返せる。呼び出し回数が配列長を超えたら最後の要素を使い続ける。
 * 単一の`Point[]`を渡した場合は、全ての呼び出しで同じ結果を返す。
 */
type ContourSpec = { points: Point[] | Point[][]; area: number };

function approxSequence(spec: ContourSpec): Point[][] {
  return Array.isArray(spec.points[0]) ? (spec.points as Point[][]) : [spec.points as Point[]];
}

function makeContourPass(specs: ContourSpec[]) {
  const contourMats = specs.map(() => fakeMat());
  const vector: CvMatVector & { deleted: boolean } = {
    deleted: false,
    size: () => contourMats.length,
    get: (i: number) => contourMats[i],
    delete() {
      vector.deleted = true;
    },
  };
  return { contourMats, vector };
}

/**
 * `runDetectCorners`は1回目(元画像)で見つからなければ`equalizeHist`後の画像で2回目を試みる。
 * `passes[0]`が1回目の輪郭候補、`passes[1]`が2回目(equalizeHist後)の輪郭候補(省略時は0件、
 * つまり2回目も見つからない)。`Mat`/`getStructuringElement`は呼ばれるたびに新しいfakeMatを
 * 生成し`createdMats`/`createdKernels`に生成順で記録する(内部でのMat確保回数がパス数によって
 * 可変なため、固定キューではなく記録配列でテスト側から参照する)。
 */
function buildCv(passes: ContourSpec[][]) {
  const [firstPassSpecs, secondPassSpecs = []] = passes;

  const src = fakeMat();
  const pass1 = makeContourPass(firstPassSpecs);
  const pass2 = makeContourPass(secondPassSpecs);

  const specByContour = new Map<CvMat, ContourSpec>();
  firstPassSpecs.forEach((spec, i) => specByContour.set(pass1.contourMats[i], spec));
  secondPassSpecs.forEach((spec, i) => specByContour.set(pass2.contourMats[i], spec));

  const attemptCounts = new Map<CvMat, number>();
  let currentArea = 0;
  const approxPolyDP = vi.fn((contour: CvMat, approxMat: CvMat) => {
    const spec = specByContour.get(contour);
    if (!spec) return;
    const sequence = approxSequence(spec);
    const attempt = attemptCounts.get(contour) ?? 0;
    attemptCounts.set(contour, attempt + 1);
    const points = sequence[Math.min(attempt, sequence.length - 1)];
    (approxMat as FakeMat).data32S = pointsToData32S(points);
    currentArea = spec.area;
  });
  const contourArea = vi.fn(() => currentArea);

  const vectors = [pass1.vector, pass2.vector];
  let vectorCalls = 0;
  const MatVectorCtor = vi.fn(function () {
    return vectors[vectorCalls++];
  });

  const createdMats: FakeMat[] = [];
  const MatCtor = vi.fn(function () {
    const mat = fakeMat();
    createdMats.push(mat);
    return mat as unknown as CvMat;
  });

  const createdKernels: FakeMat[] = [];
  const getStructuringElement = vi.fn(() => {
    const kernel = fakeMat();
    createdKernels.push(kernel);
    return kernel as unknown as CvMat;
  });

  const minAreaRectResult: CvRotatedRect = {
    center: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
    angle: 0,
  };
  const minAreaRect = vi.fn(() => minAreaRectResult);
  const rotatedRectPoints = vi.fn(() => [] as Array<{ x: number; y: number }>);
  const morphologyEx = vi.fn();
  const equalizeHist = vi.fn();

  const cv: CvModule = {
    Mat: MatCtor as unknown as CvModule["Mat"],
    MatVector: MatVectorCtor as unknown as CvModule["MatVector"],
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
    equalizeHist,
    morphologyEx,
    getStructuringElement,
    minAreaRect,
    RotatedRect: { points: rotatedRectPoints },
    COLOR_RGBA2GRAY: 11,
    COLOR_GRAY2RGBA: 12,
    RETR_EXTERNAL: 21,
    CHAIN_APPROX_SIMPLE: 22,
    CV_32FC2: 0,
    MORPH_CLOSE: 31,
    MORPH_RECT: 32,
  };

  return {
    cv,
    src,
    createdMats,
    createdKernels,
    pass1,
    pass2,
    minAreaRect,
    rotatedRectPoints,
    equalizeHist,
  };
}

function makeInput(width: number, height: number) {
  return { imageData: new FakeImageData(new Uint8ClampedArray(width * height * 4), width, height) as unknown as ImageData };
}

describe("computeMedianIntensity", () => {
  it("returns 0 for empty data", () => {
    expect(computeMedianIntensity(new Uint8Array(0))).toBe(0);
  });

  it("returns the median of grayscale pixel values", () => {
    expect(computeMedianIntensity(new Uint8Array([10, 20, 30, 40, 50]))).toBe(30);
  });

  it("handles an even-length array by picking the upper-middle value", () => {
    expect(computeMedianIntensity(new Uint8Array([10, 20, 30, 40]))).toBe(30);
  });
});

describe("computeAutoCannyThresholds", () => {
  it("computes low/high thresholds at +-33% of the median by default", () => {
    expect(computeAutoCannyThresholds(100)).toEqual({ low: 67, high: 133 });
  });

  it("clamps low to 0 and high to 255", () => {
    expect(computeAutoCannyThresholds(0)).toEqual({ low: 0, high: 0 });
    expect(computeAutoCannyThresholds(255).high).toBeLessThanOrEqual(255);
  });

  it("accepts a custom sigma", () => {
    expect(computeAutoCannyThresholds(100, 0.5)).toEqual({ low: 50, high: 150 });
  });
});

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

    const { cv, src, createdMats, createdKernels, pass1, minAreaRect, equalizeHist } = buildCv([
      [
        { points: triangle, area: 0 },
        { points: smallQuad, area: 50 },
        { points: largeQuad, area: 5000 },
      ],
    ]);
    const result = runDetectCorners(cv, makeInput(100, 100));

    // gray=createdMats[0], blurred=createdMats[1], edges/hierarchy/approx(1回目)=createdMats[2..4]
    const [gray, blurred, edges, hierarchy] = createdMats;
    const [kernel] = createdKernels;

    expect(cv.cvtColor).toHaveBeenNthCalledWith(1, src, gray, cv.COLOR_RGBA2GRAY);
    expect(cv.GaussianBlur).toHaveBeenNthCalledWith(1, gray, blurred, { width: 5, height: 5 }, 0);
    expect(cv.Canny).toHaveBeenNthCalledWith(
      1,
      blurred,
      edges,
      expect.any(Number),
      expect.any(Number),
    );
    expect(cv.getStructuringElement).toHaveBeenCalledWith(cv.MORPH_RECT, { width: 3, height: 3 });
    expect(cv.morphologyEx).toHaveBeenCalledWith(edges, edges, cv.MORPH_CLOSE, kernel);
    expect(cv.findContours).toHaveBeenNthCalledWith(
      1,
      edges,
      pass1.vector,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );

    expect(result).toEqual({
      found: true,
      corners: { topLeft, topRight, bottomRight, bottomLeft },
    });
    expect(minAreaRect).not.toHaveBeenCalled();
    expect(equalizeHist).not.toHaveBeenCalled();

    expect(src.deleted).toBe(true);
    expect(createdMats.every((mat) => mat.deleted)).toBe(true);
    expect(createdKernels.every((mat) => mat.deleted)).toBe(true);
    expect(pass1.vector.deleted).toBe(true);
    for (const contour of pass1.contourMats) {
      expect(contour.deleted).toBe(true);
    }
  });

  it("relaxes approxPolyDP epsilon in stages until a contour converges to 4 points", () => {
    const topLeft: Point = { x: 10, y: 10 };
    const topRight: Point = { x: 90, y: 10 };
    const bottomRight: Point = { x: 90, y: 90 };
    const bottomLeft: Point = { x: 10, y: 90 };

    const hexagon: Point[] = [
      { x: 10, y: 10 },
      { x: 50, y: 5 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
      { x: 50, y: 95 },
      { x: 10, y: 90 },
    ];
    const pentagon: Point[] = [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 95, y: 50 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ];
    const quad = [bottomRight, topLeft, bottomLeft, topRight];

    const { cv, minAreaRect, equalizeHist } = buildCv([
      [{ points: [hexagon, pentagon, quad], area: 5000 }],
    ]);

    const result = runDetectCorners(cv, makeInput(100, 100));

    expect(result).toEqual({
      found: true,
      corners: { topLeft, topRight, bottomRight, bottomLeft },
    });
    // epsilon比[0.01, 0.02, 0.03, ...]のうち3段階目(index 2)で4点に収束し、そこで打ち切る。
    expect(cv.approxPolyDP).toHaveBeenCalledTimes(3);
    expect(minAreaRect).not.toHaveBeenCalled();
    expect(equalizeHist).not.toHaveBeenCalled();
  });

  it("falls back to minAreaRect when the largest qualifying contour never converges to 4 points", () => {
    const raggedShape: Point[] = [
      { x: 10, y: 10 },
      { x: 30, y: 8 },
      { x: 60, y: 12 },
      { x: 90, y: 10 },
      { x: 92, y: 50 },
      { x: 90, y: 90 },
      { x: 50, y: 88 },
      { x: 10, y: 90 },
    ];

    const { cv, minAreaRect, rotatedRectPoints, pass1 } = buildCv([
      [{ points: raggedShape, area: 5000 }],
    ]);

    const rectVertices = [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ];
    rotatedRectPoints.mockReturnValue(rectVertices);

    const result = runDetectCorners(cv, makeInput(100, 100));

    // 5段階すべてのepsilonを試しても4点に収束しないため、全て試行される。
    expect(cv.approxPolyDP).toHaveBeenCalledTimes(5);
    expect(minAreaRect).toHaveBeenCalledTimes(1);
    expect(minAreaRect).toHaveBeenCalledWith(pass1.contourMats[0]);
    expect(rotatedRectPoints).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      found: true,
      corners: {
        topLeft: { x: 10, y: 10 },
        topRight: { x: 90, y: 10 },
        bottomRight: { x: 90, y: 90 },
        bottomLeft: { x: 10, y: 90 },
      },
    });
  });

  it("falls back to a second pass with equalizeHist when the first pass finds nothing, and returns its result", () => {
    const triangle: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 2, y: 5 },
    ];
    const topLeft: Point = { x: 10, y: 10 };
    const topRight: Point = { x: 90, y: 10 };
    const bottomRight: Point = { x: 90, y: 90 };
    const bottomLeft: Point = { x: 10, y: 90 };
    const largeQuad = [bottomRight, topLeft, bottomLeft, topRight];

    const { cv, createdMats, createdKernels, pass1, pass2, equalizeHist, minAreaRect } = buildCv([
      [{ points: triangle, area: 0 }],
      [{ points: largeQuad, area: 5000 }],
    ]);

    const result = runDetectCorners(cv, makeInput(100, 100));

    expect(result).toEqual({
      found: true,
      corners: { topLeft, topRight, bottomRight, bottomLeft },
    });

    // gray=[0], blurred=[1], (1回目)edges/hierarchy/approx=[2..4], equalized=[5],
    // (2回目)edges/hierarchy/approx=[6..8]
    expect(createdMats).toHaveLength(9);
    const blurred = createdMats[1];
    const equalized = createdMats[5];
    const edges2 = createdMats[6];
    const hierarchy2 = createdMats[7];

    expect(equalizeHist).toHaveBeenCalledTimes(1);
    expect(equalizeHist).toHaveBeenCalledWith(blurred, equalized);
    expect(cv.Canny).toHaveBeenNthCalledWith(
      2,
      equalized,
      edges2,
      expect.any(Number),
      expect.any(Number),
    );
    expect(cv.findContours).toHaveBeenNthCalledWith(
      2,
      edges2,
      pass2.vector,
      hierarchy2,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );
    expect(minAreaRect).not.toHaveBeenCalled();

    expect(createdMats.every((mat) => mat.deleted)).toBe(true);
    expect(createdKernels).toHaveLength(2);
    expect(createdKernels.every((mat) => mat.deleted)).toBe(true);
    expect(pass1.vector.deleted).toBe(true);
    expect(pass2.vector.deleted).toBe(true);
    for (const contour of [...pass1.contourMats, ...pass2.contourMats]) {
      expect(contour.deleted).toBe(true);
    }
  });

  it("returns found:false and cleans up every Mat/kernel from both passes when nothing is ever found", () => {
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

    const { cv, src, createdMats, createdKernels, pass1, pass2, minAreaRect, equalizeHist } =
      buildCv([
        [
          { points: triangle, area: 0 },
          { points: tooSmallQuad, area: 50 },
        ],
        // 2回目(equalizeHist後)も輪郭候補なし(デフォルト)
      ]);

    const result = runDetectCorners(cv, makeInput(100, 100));

    expect(result).toEqual({ found: false });
    expect(minAreaRect).not.toHaveBeenCalled();
    expect(equalizeHist).toHaveBeenCalledTimes(1);

    expect(src.deleted).toBe(true);
    expect(createdMats.every((mat) => mat.deleted)).toBe(true);
    expect(createdKernels.every((mat) => mat.deleted)).toBe(true);
    expect(pass1.vector.deleted).toBe(true);
    expect(pass2.vector.deleted).toBe(true);
    for (const contour of pass1.contourMats) {
      expect(contour.deleted).toBe(true);
    }
  });
});
