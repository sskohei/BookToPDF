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
    roi: vi.fn(() => mat) as unknown as CvMat["roi"],
    clone: vi.fn(() => mat) as unknown as CvMat["clone"],
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
 * `runDetectCorners`はCannyベース1回目(元画像)・2回目(`equalizeHist`後)・Otsu二値化ベース
 * (3回目、常に元画像に対して行う)を常に全て試し、結果を比較して採用する候補を選ぶ。
 * `passes[0]`が1回目(Canny/元画像)、`passes[1]`が2回目(Canny/equalizeHist後)、`passes[2]`が
 * 3回目(Otsu二値化)の輪郭候補(いずれも省略時は0件)。`Mat`/`getStructuringElement`は呼ばれる
 * たびに新しいfakeMatを生成し`createdMats`/`createdKernels`に生成順で記録する
 * (gray→blurred→equalized→(1回目)edges/hierarchy/approx→(2回目)edges/hierarchy/approx→
 * (3回目)mask/opened/closed/hierarchy/approxの順で常に14個、カーネルはCanny用2個+
 * Otsu用(open/close)2個の常に4個)。
 */
function buildCv(passes: ContourSpec[][], options: { blurredData?: Uint8Array } = {}) {
  const [firstPassSpecs, secondPassSpecs = [], thirdPassSpecs = []] = passes;

  const src = fakeMat();
  const pass1 = makeContourPass(firstPassSpecs);
  const pass2 = makeContourPass(secondPassSpecs);
  const pass3 = makeContourPass(thirdPassSpecs);

  const specByContour = new Map<CvMat, ContourSpec>();
  firstPassSpecs.forEach((spec, i) => specByContour.set(pass1.contourMats[i], spec));
  secondPassSpecs.forEach((spec, i) => specByContour.set(pass2.contourMats[i], spec));
  thirdPassSpecs.forEach((spec, i) => specByContour.set(pass3.contourMats[i], spec));

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

  const vectors = [pass1.vector, pass2.vector, pass3.vector];
  let vectorCalls = 0;
  const MatVectorCtor = vi.fn(function () {
    return vectors[vectorCalls++];
  });

  const createdMats: FakeMat[] = [];
  const MatCtor = vi.fn(function () {
    const mat = fakeMat();
    // 2番目に生成されるMatが`blurred`(gray=0, blurred=1)。Otsu二値化パスの背景輝度判定
    // (`averageCornerBrightness`)はこの`blurred`を読むため、テストからその画素値を注入できるようにする。
    if (createdMats.length === 1 && options.blurredData) {
      mat.data = options.blurredData;
    }
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
  const threshold = vi.fn();

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
    Point: vi.fn() as unknown as CvModule["Point"],
    Rect: vi.fn() as unknown as CvModule["Rect"],
    CLAHE: vi.fn() as unknown as CvModule["CLAHE"],
    HoughLinesP: vi.fn(),
    getRotationMatrix2D: vi.fn() as unknown as CvModule["getRotationMatrix2D"],
    warpAffine: vi.fn(),
    threshold,
    boundingRect: vi.fn() as unknown as CvModule["boundingRect"],
    minMaxLoc: vi.fn() as unknown as CvModule["minMaxLoc"],
    convertScaleAbs: vi.fn(),
    split: vi.fn(),
    merge: vi.fn(),
    COLOR_RGBA2GRAY: 11,
    COLOR_GRAY2RGBA: 12,
    COLOR_RGBA2RGB: 0,
    COLOR_RGB2RGBA: 0,
    COLOR_RGB2Lab: 0,
    COLOR_Lab2RGB: 0,
    RETR_EXTERNAL: 21,
    CHAIN_APPROX_SIMPLE: 22,
    CV_32FC2: 0,
    MORPH_CLOSE: 31,
    MORPH_OPEN: 30,
    MORPH_RECT: 32,
    THRESH_BINARY: 0,
    THRESH_BINARY_INV: 1,
    THRESH_OTSU: 8,
    BORDER_CONSTANT: 0,
    INTER_LINEAR: 0,
  };

  return {
    cv,
    src,
    createdMats,
    createdKernels,
    pass1,
    pass2,
    pass3,
    minAreaRect,
    rotatedRectPoints,
    equalizeHist,
    threshold,
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

    // gray=[0], blurred=[1], equalized=[2], edges/hierarchy/approx(1回目)=[3..5]
    const [gray, blurred, , edges, hierarchy] = createdMats;
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
    expect(equalizeHist).toHaveBeenCalledTimes(1);

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
    // (2回目のパスは輪郭候補なしのため`approxPolyDP`は呼ばれない)
    expect(cv.approxPolyDP).toHaveBeenCalledTimes(3);
    expect(minAreaRect).not.toHaveBeenCalled();
    expect(equalizeHist).toHaveBeenCalledTimes(1);
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

  it("uses the second pass's (equalizeHist) result when the first pass finds nothing", () => {
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

    // gray=[0], blurred=[1], equalized=[2], (1回目)edges/hierarchy/approx=[3..5],
    // (2回目)edges/hierarchy/approx=[6..8], (3回目=Otsu)mask/opened/closed/hierarchy/approx=[9..13]
    expect(createdMats).toHaveLength(14);
    const blurred = createdMats[1];
    const equalized = createdMats[2];
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
    expect(createdKernels).toHaveLength(4);
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

  it("prefers a larger candidate found in the second pass over a smaller one already found in the first pass", () => {
    // ページ内の表・図版のような、ページより小さいがコントラストの強い矩形が1回目のパスで
    // 先に(面積条件を満たした上で)見つかっても、2回目(equalizeHist後)のパスでページ本体らしき
    // より大きい矩形が見つかれば、そちらを優先しなければならない。
    const tableQuad: Point[] = [
      { x: 100, y: 100 },
      { x: 770, y: 100 },
      { x: 770, y: 770 },
      { x: 100, y: 770 },
    ];
    const pageTopLeft: Point = { x: 20, y: 20 };
    const pageTopRight: Point = { x: 980, y: 20 };
    const pageBottomRight: Point = { x: 980, y: 980 };
    const pageBottomLeft: Point = { x: 20, y: 980 };
    const pageQuad = [pageBottomRight, pageTopLeft, pageBottomLeft, pageTopRight];

    const { cv } = buildCv([
      [{ points: tableQuad, area: 670 * 670 }], // 画像の約45% (新閾値0.4は超える)
      [{ points: pageQuad, area: 960 * 960 }], // 画像の約92%
    ]);

    const result = runDetectCorners(cv, makeInput(1000, 1000));

    expect(result).toEqual({
      found: true,
      corners: {
        topLeft: pageTopLeft,
        topRight: pageTopRight,
        bottomRight: pageBottomRight,
        bottomLeft: pageBottomLeft,
      },
    });
  });

  it("rejects a converged contour whose area is below the (raised) minimum area ratio", () => {
    // 画像全体の25%程度の矩形は、旧閾値(0.1)なら採用されていたが、新閾値(0.4)では
    // ページ本体としては小さすぎるとみなして棄却されるべき。
    const quad: Point[] = [
      { x: 10, y: 10 },
      { x: 60, y: 10 },
      { x: 60, y: 60 },
      { x: 10, y: 60 },
    ];

    const { cv, minAreaRect } = buildCv([[{ points: quad, area: 2500 }]]);

    const result = runDetectCorners(cv, makeInput(100, 100));

    expect(result).toEqual({ found: false });
    expect(minAreaRect).not.toHaveBeenCalled();
  });

  describe("Otsu二値化ベースの検出(質感のある背景を持つ実写真向けの3回目のパス)", () => {
    it("uses the Otsu-threshold pass's result when both Canny passes find nothing", () => {
      // 木目調の机など質感のある背景を持つ実写真では、Cannyベースの2パスは輪郭が閉じたループを
      // 形成できず失敗しやすい(実写真での検証で確認済み)。その場合でもOtsu二値化ベースの
      // 3回目のパスがページ全体を検出できれば採用されるべき。
      const topLeft: Point = { x: 10, y: 10 };
      const topRight: Point = { x: 90, y: 10 };
      const bottomRight: Point = { x: 90, y: 90 };
      const bottomLeft: Point = { x: 10, y: 90 };
      const pageQuad = [bottomRight, topLeft, bottomLeft, topRight];

      const { cv, pass3 } = buildCv([
        [], // 1回目(Canny/元画像): 何も見つからない
        [], // 2回目(Canny/equalizeHist後): 何も見つからない
        [{ points: pageQuad, area: 6400 }], // 3回目(Otsu二値化): ページ全体を検出
      ]);

      const result = runDetectCorners(cv, makeInput(100, 100));

      expect(result).toEqual({
        found: true,
        corners: { topLeft, topRight, bottomRight, bottomLeft },
      });
      expect(pass3.vector.deleted).toBe(true);
      for (const contour of pass3.contourMats) {
        expect(contour.deleted).toBe(true);
      }
    });

    it("thresholds with THRESH_BINARY_INV when the sampled background corners are bright", () => {
      const width = 100;
      const height = 100;
      const brightData = new Uint8Array(width * height).fill(200);

      const { cv, threshold } = buildCv([[], [], []], { blurredData: brightData });

      runDetectCorners(cv, makeInput(width, height));

      expect(threshold).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        0,
        255,
        cv.THRESH_BINARY_INV | cv.THRESH_OTSU,
      );
    });

    it("thresholds with THRESH_BINARY when the sampled background corners are dark", () => {
      const width = 100;
      const height = 100;
      const darkData = new Uint8Array(width * height).fill(30);

      const { cv, threshold } = buildCv([[], [], []], { blurredData: darkData });

      runDetectCorners(cv, makeInput(width, height));

      expect(threshold).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        0,
        255,
        cv.THRESH_BINARY | cv.THRESH_OTSU,
      );
    });

    it("opens then closes the thresholded mask with distinct kernels before findContours", () => {
      const { cv, createdKernels } = buildCv([[], [], []]);

      runDetectCorners(cv, makeInput(100, 100));

      // カーネルは(Canny 1回目用、Canny 2回目用) + (Otsu用open, close)の順で生成される。
      const [, , openKernel, closeKernel] = createdKernels;
      expect(cv.morphologyEx).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        cv.MORPH_OPEN,
        openKernel,
      );
      expect(cv.morphologyEx).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        cv.MORPH_CLOSE,
        closeKernel,
      );
    });
  });
});
