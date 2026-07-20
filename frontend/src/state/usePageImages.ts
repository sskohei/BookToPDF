"use client";

import { useCallback, useState } from "react";
import { addPageImages, removePageImage, type PageImage } from "./pageImages";

export function usePageImages() {
  const [images, setImages] = useState<PageImage[]>([]);

  const addFiles = useCallback((files: FileList | File[]) => {
    // Convert eagerly: `files` may be a live FileList that the caller clears
    // (e.g. resetting `input.value`) right after this call returns, before
    // the setState updater below actually runs.
    const fileArray = Array.from(files);
    setImages((current) => addPageImages(current, fileArray));
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((current) => removePageImage(current, id));
  }, []);

  return { images, addFiles, removeImage };
}
