import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRuledSurfaceMap, clampCurveMagnitude, fitEdgeCurve } from "../edgeCurve";
import type { Corners } from "../geometry";
import type { CvMat, CvModule } from "../opencv-types";
import type { EdgeCurvePoints } from "../protocol";
import { runDewarpPage } from "./dewarpPage";

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

beforeEach(() => {
  vi.stubGlobal("ImageData", FakeImageData);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const CV_32FC2 = 13;
const CV_32FC1 = 14;

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
  const mapXMat = fakeMat();
  const mapYMat = fakeMat();
  const warped = fakeMat(100, 50);
  const matFromArrayCalls: unknown[][] = [];
  let cv32fc2Calls = 0;
  let cv32fc1Calls = 0;

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
    matFromArray: vi.fn((rows: number, cols: number, type: number, array: number[] | Float32Array) => {
      matFromArrayCalls.push([rows, cols, type, array]);
      if (type === CV_32FC2) {
        cv32fc2Calls++;
        return cv32fc2Calls === 1 ? srcPoints : dstPoints;
      }
      cv32fc1Calls++;
      return cv32fc1Calls === 1 ? mapXMat : mapYMat;
    }),
    getPerspectiveTransform: vi.fn(() => transform),
    warpPerspective: vi.fn(),
    remap: vi.fn(),
    exceptionFromPtr: vi.fn(() => ({ msg: "unused" })),
    equalizeHist: vi.fn(),
    morphologyEx: vi.fn(),
    getStructuringElement: vi.fn() as unknown as CvModule["getStructuringElement"],
    minAreaRect: vi.fn() as unknown as CvModule["minAreaRect"],
    RotatedRect: { points: vi.fn(() => []) },
    Point: vi.fn() as unknown as CvModule["Point"],
    Rect: vi.fn() as unknown as CvModule["Rect"],
    CLAHE: vi.fn() as unknown as CvModule["CLAHE"],
    HoughLinesP: vi.fn(),
    getRotationMatrix2D: vi.fn() as unknown as CvModule["getRotationMatrix2D"],
    warpAffine: vi.fn(),
    threshold: vi.fn(),
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
    CV_32FC2,
    CV_32FC1,
    MORPH_CLOSE: 31,
    MORPH_OPEN: 30,
    MORPH_RECT: 32,
    THRESH_BINARY: 0,
    THRESH_BINARY_INV: 0,
    THRESH_OTSU: 0,
    BORDER_CONSTANT: 0,
    INTER_LINEAR: 0,
  };

  return { cv, src, srcPoints, dstPoints, transform, mapXMat, mapYMat, warped, matFromArrayCalls };
}

// 上辺は綴じ目付近が5px程度沈み込む(u=50で最大、100pxの弦長に対して5% = デフォルトの
// クランプ上限6%以内)、下辺は完全に平らな曲線データ。症状「見開きページの湾曲」のうち
// 上辺だけが(クランプ不要な範囲で)有意に湾曲しているケースを模す。
const curvedEdgeCurves: EdgeCurvePoints = {
  top: Array.from({ length: 11 }, (_, i) => {
    const u = i * 10;
    return { x: u, y: -0.002 * u * u + 0.2 * u };
  }),
  bottom: Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 50 })),
};

// 上辺が20px(弦長100pxに対して20%、デフォルトのクランプ上限6%を大きく超える)沈み込む、
// 過剰な湾曲データ。実写真でのノイズ混入により暴走した湾曲を模す。
const excessivelyCurvedEdgeCurves: EdgeCurvePoints = {
  top: Array.from({ length: 11 }, (_, i) => {
    const u = i * 10;
    return { x: u, y: -0.008 * u * u + 0.8 * u };
  }),
  bottom: Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 50 })),
};

// 点数がMIN_POINTS_FOR_RELIABLE_FIT(8)未満の湾曲データ(見た目の湾曲量自体は大きい)。
const tooFewPointsEdgeCurves: EdgeCurvePoints = {
  top: [
    { x: 0, y: 0 },
    { x: 50, y: 20 },
    { x: 100, y: 0 },
  ],
  bottom: Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 50 })),
};

// 点数は十分だが、綴じ目のカーブとは無関係にばらついた(残差が大きい)ノイズ状の湾曲データ。
const noisyEdgeCurves: EdgeCurvePoints = {
  top: [
    { x: 0, y: 0 },
    { x: 10, y: 18 },
    { x: 20, y: -15 },
    { x: 30, y: 20 },
    { x: 40, y: -18 },
    { x: 50, y: 16 },
    { x: 60, y: -20 },
    { x: 70, y: 17 },
    { x: 80, y: -16 },
    { x: 90, y: 19 },
    { x: 100, y: 0 },
  ],
  bottom: Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 50 })),
};

const flatEdgeCurves: EdgeCurvePoints = {
  top: Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0 })),
  bottom: Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 50 })),
};

describe("runDewarpPage", () => {
  it("falls back to the flat perspective transform when no edgeCurves are given", () => {
    const { cv, src, srcPoints, dstPoints, transform, warped } = buildCv();
    const imageData = new FakeImageData(new Uint8ClampedArray(4), 1, 1) as unknown as ImageData;

    const result = runDewarpPage(cv, { imageData, corners });

    expect(cv.getPerspectiveTransform).toHaveBeenCalledWith(srcPoints, dstPoints);
    expect(cv.warpPerspective).toHaveBeenCalledWith(src, warped, transform, { width: 100, height: 50 });
    expect(cv.remap).not.toHaveBeenCalled();
    expect(result.curved).toBe(false);
    expect(result.imageData.width).toBe(100);
    expect(result.imageData.height).toBe(50);
  });

  it("falls back to the flat perspective transform when the fitted curves are not significant", () => {
    const { cv, warped } = buildCv();
    const imageData = new FakeImageData(new Uint8ClampedArray(4), 1, 1) as unknown as ImageData;

    const result = runDewarpPage(cv, { imageData, corners, edgeCurves: flatEdgeCurves });

    expect(cv.warpPerspective).toHaveBeenCalled();
    expect(cv.remap).not.toHaveBeenCalled();
    expect(result.curved).toBe(false);
    expect(result.imageData.width).toBe(warped.cols);
  });

  it("falls back to the flat perspective transform when there are too few points to trust the fit", () => {
    // 実写真での回帰: 少数点(3点)への二次フィットは必ず残差0になり見た目上「有意」に
    // 見えてしまうため、点数不足そのものを弾く必要がある。
    const { cv } = buildCv();
    const imageData = new FakeImageData(new Uint8ClampedArray(4), 1, 1) as unknown as ImageData;

    const result = runDewarpPage(cv, { imageData, corners, edgeCurves: tooFewPointsEdgeCurves });

    expect(cv.warpPerspective).toHaveBeenCalled();
    expect(cv.remap).not.toHaveBeenCalled();
    expect(result.curved).toBe(false);
  });

  it("falls back to the flat perspective transform when the curve fit residual is too large (noisy contour)", () => {
    // 実写真での回帰: 木目調の背景・手などのノイズが輪郭点に混じると、それらしい形の
    // 二次曲線が過剰適合しうるため、残差(当てはまり品質)も見て弾く必要がある。
    const { cv } = buildCv();
    const imageData = new FakeImageData(new Uint8ClampedArray(4), 1, 1) as unknown as ImageData;

    const result = runDewarpPage(cv, { imageData, corners, edgeCurves: noisyEdgeCurves });

    expect(cv.warpPerspective).toHaveBeenCalled();
    expect(cv.remap).not.toHaveBeenCalled();
    expect(result.curved).toBe(false);
  });

  it("uses a ruled-surface remap when the fitted top curve is significantly bowed", () => {
    const { cv, src, mapXMat, mapYMat, warped } = buildCv();
    const imageData = new FakeImageData(new Uint8ClampedArray(4), 1, 1) as unknown as ImageData;

    const topCurve = clampCurveMagnitude(fitEdgeCurve(curvedEdgeCurves.top, corners.topLeft, corners.topRight));
    const bottomCurve = clampCurveMagnitude(
      fitEdgeCurve(curvedEdgeCurves.bottom, corners.bottomLeft, corners.bottomRight),
    );
    const expectedMaps = buildRuledSurfaceMap(topCurve, bottomCurve, 100, 50);

    const result = runDewarpPage(cv, { imageData, corners, edgeCurves: curvedEdgeCurves });

    expect(cv.getPerspectiveTransform).not.toHaveBeenCalled();
    expect(cv.matFromArray).toHaveBeenCalledWith(50, 100, CV_32FC1, expectedMaps.mapX);
    expect(cv.matFromArray).toHaveBeenCalledWith(50, 100, CV_32FC1, expectedMaps.mapY);
    expect(cv.remap).toHaveBeenCalledWith(
      src,
      warped,
      mapXMat,
      mapYMat,
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      [255, 255, 255, 255],
    );
    expect(result.curved).toBe(true);
    expect(result.imageData.width).toBe(100);
    expect(result.imageData.height).toBe(50);
  });

  it("clamps an excessively large fitted curve to the physically-plausible cap before remapping", () => {
    // 実写真での回帰: フィット自体は(点数も残差も問題なく)「有意」と判定されても、
    // 変形量が物理的にありえないほど大きい(弦長の20%)場合は、そのまま適用せず
    // クランプ後の(弦長の6%相当の)曲線を使うべき。
    const { cv } = buildCv();
    const imageData = new FakeImageData(new Uint8ClampedArray(4), 1, 1) as unknown as ImageData;

    const rawTopCurve = fitEdgeCurve(
      excessivelyCurvedEdgeCurves.top,
      corners.topLeft,
      corners.topRight,
    );
    const rawBottomCurve = fitEdgeCurve(
      excessivelyCurvedEdgeCurves.bottom,
      corners.bottomLeft,
      corners.bottomRight,
    );
    const clampedTopCurve = clampCurveMagnitude(rawTopCurve);
    const clampedBottomCurve = clampCurveMagnitude(rawBottomCurve);
    // クランプが実際に効いていること自体を検証(そうでないとこのテストは無意味になる)。
    expect(clampedTopCurve.a).not.toBe(rawTopCurve.a);

    const expectedMaps = buildRuledSurfaceMap(clampedTopCurve, clampedBottomCurve, 100, 50);

    const result = runDewarpPage(cv, { imageData, corners, edgeCurves: excessivelyCurvedEdgeCurves });

    expect(cv.matFromArray).toHaveBeenCalledWith(50, 100, CV_32FC1, expectedMaps.mapX);
    expect(cv.matFromArray).toHaveBeenCalledWith(50, 100, CV_32FC1, expectedMaps.mapY);
    expect(result.curved).toBe(true);
  });

  it("deletes every Mat it creates, even when remap throws", () => {
    const { cv, src, mapXMat, mapYMat, warped } = buildCv();
    cv.remap = vi.fn(() => {
      throw new Error("boom");
    });
    const imageData = new FakeImageData(new Uint8ClampedArray(4), 1, 1) as unknown as ImageData;

    expect(() => runDewarpPage(cv, { imageData, corners, edgeCurves: curvedEdgeCurves })).toThrow("boom");

    expect(src.deleted).toBe(true);
    expect(mapXMat.deleted).toBe(true);
    expect(mapYMat.deleted).toBe(true);
    expect(warped.deleted).toBe(true);
  });
});
