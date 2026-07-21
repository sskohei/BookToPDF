import { describe, expect, it } from "vitest";
import {
  classifySpread,
  cornersBoundingBox,
  deriveHalfCorners,
  orderCorners,
  quadSize,
  type Corners,
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
  it("splits an axis-aligned spread rectangle at the given gutter x", () => {
    const corners: Corners = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 200, y: 0 },
      bottomRight: { x: 200, y: 150 },
      bottomLeft: { x: 0, y: 150 },
    };

    const [left, right] = deriveHalfCorners(corners, 100);

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

    const [left, right] = deriveHalfCorners(corners, 100);

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
});
