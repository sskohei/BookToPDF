import { describe, expect, it, vi } from "vitest";
import type { Corners } from "../lib/cv/geometry";
import {
  addPageImages,
  flattenPagesForExport,
  removePageImage,
  reorderPageImages,
  setPageImageCorners,
  setProcessedPreviewUrls,
} from "./pageImages";

function fakeFile(name: string): File {
  return new File(["dummy"], name, { type: "image/jpeg" });
}

describe("addPageImages", () => {
  it("appends new images with generated ids and preview urls", () => {
    const createObjectUrl = vi.fn((file: File) => `blob:${file.name}`);

    const result = addPageImages([], [fakeFile("a.jpg"), fakeFile("b.jpg")], createObjectUrl);

    expect(result).toHaveLength(2);
    expect(result[0].previewUrl).toBe("blob:a.jpg");
    expect(result[1].previewUrl).toBe("blob:b.jpg");
    expect(result[0].id).not.toBe(result[1].id);
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
  });

  it("keeps existing images when adding more", () => {
    const createObjectUrl = vi.fn((file: File) => `blob:${file.name}`);
    const first = addPageImages([], [fakeFile("a.jpg")], createObjectUrl);

    const result = addPageImages(first, [fakeFile("b.jpg")], createObjectUrl);

    expect(result.map((image) => image.file.name)).toEqual(["a.jpg", "b.jpg"]);
  });
});

describe("removePageImage", () => {
  it("removes the matching image and revokes its preview url", () => {
    const createObjectUrl = vi.fn((file: File) => `blob:${file.name}`);
    const revokeObjectUrl = vi.fn();
    const images = addPageImages([], [fakeFile("a.jpg"), fakeFile("b.jpg")], createObjectUrl);
    const target = images[0];

    const result = removePageImage(images, target.id, revokeObjectUrl);

    expect(result).toHaveLength(1);
    expect(result[0].file.name).toBe("b.jpg");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:a.jpg");
  });

  it("is a no-op when the id does not exist", () => {
    const createObjectUrl = vi.fn((file: File) => `blob:${file.name}`);
    const revokeObjectUrl = vi.fn();
    const images = addPageImages([], [fakeFile("a.jpg")], createObjectUrl);

    const result = removePageImage(images, "missing-id", revokeObjectUrl);

    expect(result).toHaveLength(1);
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("also revokes processedPreviewUrls of the removed image", () => {
    const createObjectUrl = vi.fn((file: File) => `blob:${file.name}`);
    const revokeObjectUrl = vi.fn();
    const images = addPageImages([], [fakeFile("a.jpg")], createObjectUrl);
    const withProcessed = setProcessedPreviewUrls(
      images,
      images[0].id,
      ["blob:processed-1", "blob:processed-2"],
      vi.fn(),
    );

    removePageImage(withProcessed, images[0].id, revokeObjectUrl);

    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:a.jpg");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:processed-1");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:processed-2");
  });
});

describe("setPageImageCorners", () => {
  const corners: Corners = {
    topLeft: { x: 1, y: 1 },
    topRight: { x: 9, y: 1 },
    bottomRight: { x: 9, y: 9 },
    bottomLeft: { x: 1, y: 9 },
  };

  it("sets corners on the matching image only", () => {
    const createObjectUrl = vi.fn((file: File) => `blob:${file.name}`);
    const images = addPageImages([], [fakeFile("a.jpg"), fakeFile("b.jpg")], createObjectUrl);
    const target = images[0];

    const result = setPageImageCorners(images, target.id, corners);

    expect(result[0].corners).toEqual(corners);
    expect(result[1].corners).toBeUndefined();
  });

  it("can clear corners back to null (detection attempted but not found)", () => {
    const createObjectUrl = vi.fn((file: File) => `blob:${file.name}`);
    const images = addPageImages([], [fakeFile("a.jpg")], createObjectUrl);
    const withCorners = setPageImageCorners(images, images[0].id, corners);

    const result = setPageImageCorners(withCorners, images[0].id, null);

    expect(result[0].corners).toBeNull();
  });

  it("is a no-op when the id does not exist", () => {
    const createObjectUrl = vi.fn((file: File) => `blob:${file.name}`);
    const images = addPageImages([], [fakeFile("a.jpg")], createObjectUrl);

    const result = setPageImageCorners(images, "missing-id", corners);

    expect(result).toEqual(images);
  });
});

describe("setProcessedPreviewUrls", () => {
  it("sets processedPreviewUrls on the matching image only", () => {
    const createObjectUrl = vi.fn((file: File) => `blob:${file.name}`);
    const revokeObjectUrl = vi.fn();
    const images = addPageImages([], [fakeFile("a.jpg"), fakeFile("b.jpg")], createObjectUrl);

    const result = setProcessedPreviewUrls(images, images[0].id, ["blob:corrected"], revokeObjectUrl);

    expect(result[0].processedPreviewUrls).toEqual(["blob:corrected"]);
    expect(result[1].processedPreviewUrls).toBeUndefined();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("revokes the previous urls before replacing them", () => {
    const createObjectUrl = vi.fn((file: File) => `blob:${file.name}`);
    const revokeObjectUrl = vi.fn();
    const images = addPageImages([], [fakeFile("a.jpg")], createObjectUrl);
    const first = setProcessedPreviewUrls(images, images[0].id, ["blob:v1-left", "blob:v1-right"], revokeObjectUrl);

    const result = setProcessedPreviewUrls(first, images[0].id, ["blob:v2"], revokeObjectUrl);

    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:v1-left");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:v1-right");
    expect(result[0].processedPreviewUrls).toEqual(["blob:v2"]);
  });

  it("is a no-op when the id does not exist", () => {
    const createObjectUrl = vi.fn((file: File) => `blob:${file.name}`);
    const revokeObjectUrl = vi.fn();
    const images = addPageImages([], [fakeFile("a.jpg")], createObjectUrl);

    const result = setProcessedPreviewUrls(images, "missing-id", ["blob:corrected"], revokeObjectUrl);

    expect(result).toEqual(images);
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });
});

describe("reorderPageImages", () => {
  const createObjectUrl = vi.fn((file: File) => `blob:${file.name}`);

  it("moves an image forward", () => {
    const images = addPageImages([], [fakeFile("a.jpg"), fakeFile("b.jpg"), fakeFile("c.jpg")], createObjectUrl);

    const result = reorderPageImages(images, images[0].id, images[2].id);

    expect(result.map((image) => image.file.name)).toEqual(["b.jpg", "c.jpg", "a.jpg"]);
  });

  it("moves an image backward", () => {
    const images = addPageImages([], [fakeFile("a.jpg"), fakeFile("b.jpg"), fakeFile("c.jpg")], createObjectUrl);

    const result = reorderPageImages(images, images[2].id, images[0].id);

    expect(result.map((image) => image.file.name)).toEqual(["c.jpg", "a.jpg", "b.jpg"]);
  });

  it("is a no-op when activeId and overId are the same", () => {
    const images = addPageImages([], [fakeFile("a.jpg"), fakeFile("b.jpg")], createObjectUrl);

    const result = reorderPageImages(images, images[0].id, images[0].id);

    expect(result).toBe(images);
  });

  it("is a no-op when activeId does not exist", () => {
    const images = addPageImages([], [fakeFile("a.jpg"), fakeFile("b.jpg")], createObjectUrl);

    const result = reorderPageImages(images, "missing-id", images[0].id);

    expect(result).toEqual(images);
  });

  it("is a no-op when overId does not exist", () => {
    const images = addPageImages([], [fakeFile("a.jpg"), fakeFile("b.jpg")], createObjectUrl);

    const result = reorderPageImages(images, images[0].id, "missing-id");

    expect(result).toEqual(images);
  });

  it("preserves each image's other fields after moving", () => {
    const corners: Corners = {
      topLeft: { x: 1, y: 1 },
      topRight: { x: 9, y: 1 },
      bottomRight: { x: 9, y: 9 },
      bottomLeft: { x: 1, y: 9 },
    };
    const images = addPageImages([], [fakeFile("a.jpg"), fakeFile("b.jpg")], createObjectUrl);
    const withCorners = setPageImageCorners(images, images[0].id, corners);
    const withProcessed = setProcessedPreviewUrls(withCorners, images[0].id, ["blob:corrected"], vi.fn());

    const result = reorderPageImages(withProcessed, images[0].id, images[1].id);

    const moved = result.find((image) => image.id === images[0].id);
    expect(moved?.corners).toEqual(corners);
    expect(moved?.processedPreviewUrls).toEqual(["blob:corrected"]);
  });
});

describe("flattenPagesForExport", () => {
  const createObjectUrl = vi.fn((file: File) => `blob:${file.name}`);

  it("returns one entry per single-page image", () => {
    const images = addPageImages([], [fakeFile("a.jpg")], createObjectUrl);
    const processed = setProcessedPreviewUrls(images, images[0].id, ["blob:corrected"], vi.fn());

    const result = flattenPagesForExport(processed);

    expect(result).toEqual([
      { id: `${images[0].id}:0`, imageId: images[0].id, halfIndex: 0, previewUrl: "blob:corrected" },
    ]);
  });

  it("returns two ordered entries for a spread image", () => {
    const images = addPageImages([], [fakeFile("a.jpg")], createObjectUrl);
    const processed = setProcessedPreviewUrls(images, images[0].id, ["blob:left", "blob:right"], vi.fn());

    const result = flattenPagesForExport(processed);

    expect(result).toEqual([
      { id: `${images[0].id}:0`, imageId: images[0].id, halfIndex: 0, previewUrl: "blob:left" },
      { id: `${images[0].id}:1`, imageId: images[0].id, halfIndex: 1, previewUrl: "blob:right" },
    ]);
  });

  it("falls back to previewUrl when not yet processed", () => {
    const images = addPageImages([], [fakeFile("a.jpg")], createObjectUrl);

    const result = flattenPagesForExport(images);

    expect(result).toEqual([
      { id: `${images[0].id}:0`, imageId: images[0].id, halfIndex: 0, previewUrl: "blob:a.jpg" },
    ]);
  });

  it("falls back to previewUrl when correction failed for all pages", () => {
    const images = addPageImages([], [fakeFile("a.jpg")], createObjectUrl);
    const processed = setProcessedPreviewUrls(images, images[0].id, [], vi.fn());

    const result = flattenPagesForExport(processed);

    expect(result).toEqual([
      { id: `${images[0].id}:0`, imageId: images[0].id, halfIndex: 0, previewUrl: "blob:a.jpg" },
    ]);
  });

  it("reflects the images array's order, e.g. after a reorder", () => {
    const images = addPageImages([], [fakeFile("a.jpg"), fakeFile("b.jpg")], createObjectUrl);
    const reordered = reorderPageImages(images, images[0].id, images[1].id);

    const result = flattenPagesForExport(reordered);

    expect(result.map((page) => page.previewUrl)).toEqual(["blob:b.jpg", "blob:a.jpg"]);
  });
});
