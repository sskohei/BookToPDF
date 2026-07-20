import { describe, expect, it } from "vitest";
import { orderCorners, type Point } from "./geometry";

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
