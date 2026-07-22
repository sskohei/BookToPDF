import { describe, expect, it } from "vitest";
import {
  fitLineOrthogonal,
  intersectLines,
  refineQuadCorners,
  splitContourIntoEdges,
  type LinePD,
} from "./contourGeometry";
import type { Point } from "./geometry";

describe("fitLineOrthogonal", () => {
  it("recovers a near-horizontal line from noisy points", () => {
    const points: Point[] = [];
    for (let x = 0; x <= 100; x += 5) {
      const jitter = x % 10 === 0 ? 1 : -1;
      points.push({ x, y: 5 + jitter });
    }

    const fit = fitLineOrthogonal(points);

    expect(Math.abs(fit.direction.y)).toBeLessThan(0.05);
    expect(fit.point.y).toBeCloseTo(5, 0);
  });

  it("recovers a near-vertical line from noisy points", () => {
    const points: Point[] = [];
    for (let y = 0; y <= 100; y += 5) {
      const jitter = y % 10 === 0 ? 1 : -1;
      points.push({ x: 40 + jitter, y });
    }

    const fit = fitLineOrthogonal(points);

    expect(Math.abs(fit.direction.x)).toBeLessThan(0.05);
    expect(fit.point.x).toBeCloseTo(40, 0);
  });

  it("throws when given fewer than 2 points", () => {
    expect(() => fitLineOrthogonal([{ x: 0, y: 0 }])).toThrow(/at least 2/);
  });
});

describe("intersectLines", () => {
  it("finds the intersection of a horizontal and a vertical line", () => {
    const horizontal: LinePD = { point: { x: 0, y: 0 }, direction: { x: 1, y: 0 } };
    const vertical: LinePD = { point: { x: 5, y: -5 }, direction: { x: 0, y: 1 } };

    expect(intersectLines(horizontal, vertical)).toEqual({ x: 5, y: 0 });
  });

  it("returns undefined for parallel lines", () => {
    const a: LinePD = { point: { x: 0, y: 0 }, direction: { x: 1, y: 0 } };
    const b: LinePD = { point: { x: 0, y: 10 }, direction: { x: -1, y: 0 } };

    expect(intersectLines(a, b)).toBeUndefined();
  });
});

describe("splitContourIntoEdges", () => {
  it("splits a dense contour into 4 arcs between consecutive approx vertices", () => {
    const denseContour: Point[] = Array.from({ length: 8 }, (_, i) => ({ x: i, y: 0 }));
    const approxVertices = [denseContour[1], denseContour[3], denseContour[5], denseContour[7]];

    const edges = splitContourIntoEdges(denseContour, approxVertices);

    expect(edges[0]).toEqual([denseContour[1], denseContour[2], denseContour[3]]);
    expect(edges[1]).toEqual([denseContour[3], denseContour[4], denseContour[5]]);
    expect(edges[2]).toEqual([denseContour[5], denseContour[6], denseContour[7]]);
  });

  it("wraps around the end of the dense contour array for the last edge", () => {
    const denseContour: Point[] = Array.from({ length: 8 }, (_, i) => ({ x: i, y: 0 }));
    const approxVertices = [denseContour[1], denseContour[3], denseContour[5], denseContour[7]];

    const edges = splitContourIntoEdges(denseContour, approxVertices);

    // 4本目の辺は index7 -> index1 で、0を経由してラップする。
    expect(edges[3]).toEqual([denseContour[7], denseContour[0], denseContour[1]]);
  });

  it("returns 4 empty arcs when the dense contour is empty", () => {
    const approxVertices: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    expect(splitContourIntoEdges([], approxVertices)).toEqual([[], [], [], []]);
  });
});

function jitteredSegment(a: Point, b: Point, count: number, jitterPattern: number[]): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;

  const points: Point[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const jitter = jitterPattern[i % jitterPattern.length];
    points.push({ x: a.x + dx * t + nx * jitter, y: a.y + dy * t + ny * jitter });
  }
  return points;
}

describe("refineQuadCorners", () => {
  it("refines noisy raw vertices closer to the true corners of a jittered rectangle", () => {
    const trueTopLeft: Point = { x: 0, y: 0 };
    const trueTopRight: Point = { x: 100, y: 0 };
    const trueBottomRight: Point = { x: 100, y: 150 };
    const trueBottomLeft: Point = { x: 0, y: 150 };

    const jitter = [1, -1, 0.5, -0.5];
    const top = jitteredSegment(trueTopLeft, trueTopRight, 20, jitter);
    const right = jitteredSegment(trueTopRight, trueBottomRight, 20, jitter);
    const bottom = jitteredSegment(trueBottomRight, trueBottomLeft, 20, jitter);
    const left = jitteredSegment(trueBottomLeft, trueTopLeft, 20, jitter);

    // 隣接する辺同士で頂点を共有しないよう、各辺の最後の点(=次の辺の最初の点)を落として
    // 1周分の輪郭点列にする。
    const denseContour = [...top.slice(0, -1), ...right.slice(0, -1), ...bottom.slice(0, -1), ...left.slice(0, -1)];

    // 生のapproxPolyDP頂点はノイズで本来の角から数px程度ずれているものとする。
    const rawTopLeft: Point = { x: 3, y: -4 };
    const rawTopRight: Point = { x: 97, y: 4 };
    const rawBottomRight: Point = { x: 104, y: 146 };
    const rawBottomLeft: Point = { x: -2, y: 153 };
    const approxVertices = [rawTopLeft, rawTopRight, rawBottomRight, rawBottomLeft];

    const refined = refineQuadCorners(denseContour, approxVertices);

    const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    expect(dist(refined[0], trueTopLeft)).toBeLessThan(dist(rawTopLeft, trueTopLeft));
    expect(dist(refined[1], trueTopRight)).toBeLessThan(dist(rawTopRight, trueTopRight));
    expect(dist(refined[2], trueBottomRight)).toBeLessThan(dist(rawBottomRight, trueBottomRight));
    expect(dist(refined[3], trueBottomLeft)).toBeLessThan(dist(rawBottomLeft, trueBottomLeft));
  });

  it("falls back per-corner to the raw vertex when an adjacent edge has too few points", () => {
    const topLeft: Point = { x: 0, y: 0 };
    const topRight: Point = { x: 100, y: 0 };
    const bottomRight: Point = { x: 100, y: 150 };
    const bottomLeft: Point = { x: 0, y: 150 };
    const jitter = [0];

    const top = jitteredSegment(topLeft, topRight, 20, jitter);
    // 右辺はほぼ点無し(2点のみ)で、フィットに必要な最小点数を満たさない。
    const right = [topRight, bottomRight];
    const bottom = jitteredSegment(bottomRight, bottomLeft, 20, jitter);
    const left = jitteredSegment(bottomLeft, topLeft, 20, jitter);

    const denseContour = [...top.slice(0, -1), ...right.slice(0, -1), ...bottom.slice(0, -1), ...left.slice(0, -1)];
    const approxVertices = [topLeft, topRight, bottomRight, bottomLeft];

    const refined = refineQuadCorners(denseContour, approxVertices);

    // topRight・bottomRightは右辺(データ不足)に隣接するため生の頂点のままになる。
    expect(refined[1]).toEqual(topRight);
    expect(refined[2]).toEqual(bottomRight);
  });

  it("falls back to all raw vertices when the dense contour is empty", () => {
    const approxVertices: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    expect(refineQuadCorners([], approxVertices)).toEqual(approxVertices);
  });

  it("falls back to the raw vertex when maxDisplacement is exceeded (extrapolation across a genuinely tilted edge)", () => {
    // 実写真での回帰: ページ外周辺がわずかに(この例では水平から~1.7度)傾いているだけでも、
    // 辺全体にフィットした直線同士の交点は、素朴な生の頂点検出(rawBottomLeft)から
    // 60px以上離れうる。この程度の乖離は「精密化」ではなく信頼できない外挿とみなすべき。
    const topLeft: Point = { x: 0, y: 0 };
    const topRight: Point = { x: 2000, y: 0 };
    const bottomRight: Point = { x: 2000, y: 1000 };
    const trueBottomLeftOnTiltedEdge: Point = { x: 0, y: 1060 };
    const rawBottomLeft: Point = { x: 5, y: 998 };

    const top = jitteredSegment(topLeft, topRight, 50, [0]);
    const right = jitteredSegment(topRight, bottomRight, 25, [0]);
    const bottom = jitteredSegment(bottomRight, trueBottomLeftOnTiltedEdge, 50, [0]);
    const left = jitteredSegment(trueBottomLeftOnTiltedEdge, topLeft, 25, [0]);
    const denseContour = [
      ...top.slice(0, -1),
      ...right.slice(0, -1),
      ...bottom.slice(0, -1),
      ...left.slice(0, -1),
    ];
    const approxVertices = [topLeft, topRight, bottomRight, rawBottomLeft];

    const withoutCap = refineQuadCorners(denseContour, approxVertices);
    expect(withoutCap[3].y).toBeCloseTo(1060, 0);

    const withSmallCap = refineQuadCorners(denseContour, approxVertices, { maxDisplacement: 30 });
    expect(withSmallCap[3]).toEqual(rawBottomLeft);

    const withLargeCap = refineQuadCorners(denseContour, approxVertices, { maxDisplacement: 100 });
    expect(withLargeCap[3].y).toBeCloseTo(1060, 0);
  });
});
