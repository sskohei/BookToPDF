import { describe, expect, it, vi } from "vitest";
import { addPageImages, removePageImage } from "./pageImages";

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
});
