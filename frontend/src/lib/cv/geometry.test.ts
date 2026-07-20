import { describe, expect, it } from "vitest";
import { classifySpread, orderCorners, quadSize, type Corners, type Point } from "./geometry";

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
});
