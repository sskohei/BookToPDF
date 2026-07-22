import { describe, expect, it } from "vitest";
import {
  classifySpread,
  cornersBoundingBox,
  deriveHalfCorners,
  orderCorners,
  quadSize,
  selectTopBottomEdges,
  splitEdgeCurvesAtGutter,
  type Corners,
  type EdgeCurvePoints,
  type Point,
} from "./geometry";

describe("orderCorners", () => {
  it("orders an axis-aligned square regardless of input order", () => {
    const topLeft: Point = { x: 0, y: 0 };
    const topRight: Point = { x: 10, y: 0 };
    const bottomRight: Point = { x: 10, y: 10 };
    const bottomLeft: Point = { x: 0, y: 10 };

    const result = orderCorners([bottomRight, topLeft, bottomLeft, topRight]);

    expect(result).toEqual({ topLeft, topRight, bottomRight, bottomLeft });
  });

  it("orders a rotated rectangle regardless of input order", () => {
    // A rectangle tilted clockwise by a few degrees, points listed out of order.
    const topLeft: Point = { x: 12, y: 2 };
    const topRight: Point = { x: 108, y: 20 };
    const bottomRight: Point = { x: 98, y: 78 };
    const bottomLeft: Point = { x: 2, y: 60 };

    const result = orderCorners([topRight, bottomLeft, topLeft, bottomRight]);

    expect(result).toEqual({ topLeft, topRight, bottomRight, bottomLeft });
  });

  it("throws when given fewer or more than 4 points", () => {
    expect(() => orderCorners([{ x: 0, y: 0 }])).toThrow(/4 points/);
    expect(() =>
      orderCorners([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 0.5, y: 0.5 },
      ]),
    ).toThrow(/4 points/);
  });
});

describe("quadSize", () => {
  it("uses the longer of each pair of opposite sides, rounded", () => {
    // A slightly non-rectangular quad: bottom edge a bit longer than the top.
    const corners: Corners = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 0 },
      bottomRight: { x: 105, y: 200 },
      bottomLeft: { x: -5, y: 200 },
    };

    const result = quadSize(corners);

    expect(result).toEqual({ width: 110, height: 200 });
  });

  it("clamps degenerate (zero-area) quads to a minimum of 1", () => {
    const corners: Corners = {
      topLeft: { x: 5, y: 5 },
      topRight: { x: 5, y: 5 },
      bottomRight: { x: 5, y: 5 },
      bottomLeft: { x: 5, y: 5 },
    };

    expect(quadSize(corners)).toEqual({ width: 1, height: 1 });
  });
});

describe("classifySpread", () => {
  it("classifies a portrait single-page quad as single", () => {
    const corners: Corners = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 0 },
      bottomRight: { x: 100, y: 150 },
      bottomLeft: { x: 0, y: 150 },
    };

    expect(classifySpread(corners)).toBe("single");
  });

  it("classifies a landscape two-page-wide quad as spread", () => {
    const corners: Corners = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 200, y: 0 },
      bottomRight: { x: 200, y: 150 },
      bottomLeft: { x: 0, y: 150 },
    };

    expect(classifySpread(corners)).toBe("spread");
  });

  it("classifies a keystoned/rotated spread quad (as from a real, slightly angled photo) as spread", () => {
    // Not axis-aligned: top edge tilted and slightly shorter than the bottom edge,
    // approximating perspective keystoning from a real handheld photo.
    const corners: Corners = {
      topLeft: { x: 20, y: 5 },
      topRight: { x: 260, y: 15 },
      bottomRight: { x: 280, y: 220 },
      bottomLeft: { x: 0, y: 210 },
    };

    expect(classifySpread(corners)).toBe("spread");
  });

  it("classifies a real spread photo whose aspect ratio is just under the old 1.2 threshold as spread", () => {
    // 実写真での回帰: 4000x3000の実写真から自動検出された見開き全体の四隅は
    // width=2944, height=2478 (ratio≈1.188) だった。旧しきい値1.2ではこれが単ページとして
    // 誤判定され、ユーザーが手動で四隅を調整しないと見開きとして認識されなかった。
    const corners: Corners = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 2944, y: 0 },
      bottomRight: { x: 2944, y: 2478 },
      bottomLeft: { x: 0, y: 2478 },
    };

    expect(classifySpread(corners)).toBe("spread");
  });
});

describe("cornersBoundingBox", () => {
  it("returns the min/max x and y across all four corners", () => {
    const corners: Corners = {
      topLeft: { x: 5, y: 2 },
      topRight: { x: 205, y: 8 },
      bottomRight: { x: 200, y: 150 },
      bottomLeft: { x: 0, y: 140 },
    };

    expect(cornersBoundingBox(corners)).toEqual({ minX: 0, maxX: 205, minY: 2, maxY: 150 });
  });
});

describe("deriveHalfCorners", () => {
  it("splits an axis-aligned spread rectangle at the given gutter x (vertical line, topX === bottomX)", () => {
    const corners: Corners = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 200, y: 0 },
      bottomRight: { x: 200, y: 150 },
      bottomLeft: { x: 0, y: 150 },
    };

    const [left, right] = deriveHalfCorners(corners, { topX: 100, bottomX: 100 });

    expect(left).toEqual({
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 0 },
      bottomRight: { x: 100, y: 150 },
      bottomLeft: { x: 0, y: 150 },
    });
    expect(right).toEqual({
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 0 },
      bottomRight: { x: 100, y: 150 },
      bottomLeft: { x: 0, y: 150 },
    });
  });

  it("linearly interpolates the gutter point along the top/bottom edges of a keystoned quad", () => {
    // Top edge narrower (x: 20..180) than the bottom edge (x: 0..200), as from a photo
    // taken at a slight angle. gutterX=100 sits at the midpoint of each edge's own x-range.
    const corners: Corners = {
      topLeft: { x: 20, y: 0 },
      topRight: { x: 180, y: 20 },
      bottomRight: { x: 200, y: 200 },
      bottomLeft: { x: 0, y: 180 },
    };

    const [left, right] = deriveHalfCorners(corners, { topX: 100, bottomX: 100 });

    expect(left).toEqual({
      topLeft: { x: 20, y: 0 },
      topRight: { x: 100, y: 10 },
      bottomRight: { x: 100, y: 190 },
      bottomLeft: { x: 0, y: 180 },
    });
    expect(right).toEqual({
      topLeft: { x: 0, y: 10 },
      topRight: { x: 80, y: 20 },
      bottomRight: { x: 100, y: 200 },
      bottomLeft: { x: 0, y: 190 },
    });
  });

  it("derives non-rectangular half quads from a slanted gutter line (topX !== bottomX)", () => {
    // A rotated photo: the gutter's top point sits at x=90, bottom point at x=110.
    const corners: Corners = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 200, y: 0 },
      bottomRight: { x: 200, y: 150 },
      bottomLeft: { x: 0, y: 150 },
    };

    const [left, right] = deriveHalfCorners(corners, { topX: 90, bottomX: 110 });

    expect(left).toEqual({
      topLeft: { x: 0, y: 0 },
      topRight: { x: 90, y: 0 },
      bottomRight: { x: 110, y: 150 },
      bottomLeft: { x: 0, y: 150 },
    });
    // Right half's local origin is shifted by min(topX, bottomX) = 90, matching
    // splitImageDataAt's raster crop start for the overlapping right half.
    expect(right).toEqual({
      topLeft: { x: 0, y: 0 },
      topRight: { x: 110, y: 0 },
      bottomRight: { x: 110, y: 150 },
      bottomLeft: { x: 20, y: 150 },
    });
  });
});

describe("selectTopBottomEdges", () => {
  const topLeft: Point = { x: 0, y: 0 };
  const topRight: Point = { x: 100, y: 0 };
  const bottomRight: Point = { x: 100, y: 150 };
  const bottomLeft: Point = { x: 0, y: 150 };
  const corners: Corners = { topLeft, topRight, bottomRight, bottomLeft };

  it("returns the top edge as-is and reverses the bottom edge to start at bottomLeft", () => {
    // points/edges follow a clockwise contour traversal: TL->TR->BR->BL->TL.
    const points = [topLeft, topRight, bottomRight, bottomLeft];
    const topEdge: Point[] = [{ x: 30, y: -1 }, { x: 70, y: -1 }];
    const rightEdge: Point[] = [{ x: 101, y: 75 }];
    const bottomEdgeBrToBl: Point[] = [
      { x: 150, y: 152 },
      { x: 100, y: 153 },
      { x: 50, y: 152 },
    ];
    const leftEdge: Point[] = [{ x: -1, y: 75 }];
    const edges = [topEdge, rightEdge, bottomEdgeBrToBl, leftEdge];

    const result = selectTopBottomEdges(points, edges, corners);

    expect(result?.top).toEqual(topEdge);
    expect(result?.bottom).toEqual([...bottomEdgeBrToBl].reverse());
  });

  it("still finds the right edges when points start at a different corner in the same cycle", () => {
    // Counter-clockwise cycle starting at bottomRight: BR->BL->TL->TR->(BR).
    const points = [bottomRight, bottomLeft, topLeft, topRight];
    const bottomEdgeBrToBl: Point[] = [{ x: 50, y: 152 }];
    const leftEdge: Point[] = [{ x: -1, y: 75 }];
    const topEdge: Point[] = [{ x: 50, y: -1 }];
    const rightEdge: Point[] = [{ x: 101, y: 75 }];
    const edges = [bottomEdgeBrToBl, leftEdge, topEdge, rightEdge];

    const result = selectTopBottomEdges(points, edges, corners);

    expect(result?.top).toEqual(topEdge);
    expect(result?.bottom).toEqual([...bottomEdgeBrToBl].reverse());
  });

  it("returns undefined for a degenerate quad where corners can't be distinguished", () => {
    const samePoint: Point = { x: 5, y: 5 };
    const points = [samePoint, samePoint, samePoint, samePoint];
    const edges = [[samePoint], [samePoint], [samePoint], [samePoint]];

    expect(selectTopBottomEdges(points, edges, corners)).toBeUndefined();
  });
});

describe("splitEdgeCurvesAtGutter", () => {
  it("splits at a vertical gutter (topX === bottomX), shifting the right half by the gutter x", () => {
    const edgeCurves: EdgeCurvePoints = {
      top: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 200, y: 0 },
      ],
      bottom: [
        { x: 0, y: 150 },
        { x: 100, y: 150 },
        { x: 200, y: 150 },
      ],
    };

    const [left, right] = splitEdgeCurvesAtGutter(edgeCurves, { topX: 100, bottomX: 100 });

    expect(left).toEqual({
      top: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ],
      bottom: [
        { x: 0, y: 150 },
        { x: 100, y: 150 },
      ],
    });
    expect(right).toEqual({
      top: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      bottom: [
        { x: 0, y: 150 },
        { x: 100, y: 150 },
      ],
    });
  });

  it("uses topX/bottomX independently for a slanted gutter, shifting by min(topX, bottomX)", () => {
    const edgeCurves: EdgeCurvePoints = {
      top: [
        { x: 0, y: 0 },
        { x: 90, y: 5 },
        { x: 200, y: 0 },
      ],
      bottom: [
        { x: 0, y: 150 },
        { x: 110, y: 148 },
        { x: 200, y: 150 },
      ],
    };

    const [left, right] = splitEdgeCurvesAtGutter(edgeCurves, { topX: 90, bottomX: 110 });

    expect(left).toEqual({
      top: [
        { x: 0, y: 0 },
        { x: 90, y: 5 },
      ],
      bottom: [
        { x: 0, y: 150 },
        { x: 110, y: 148 },
      ],
    });
    // 右半分は min(90, 110) = 90 だけxをシフトする(splitImageDataAt/deriveHalfCornersと同じ規約)。
    expect(right).toEqual({
      top: [
        { x: 0, y: 5 },
        { x: 110, y: 0 },
      ],
      bottom: [
        { x: 20, y: 148 },
        { x: 110, y: 150 },
      ],
    });
  });
});
