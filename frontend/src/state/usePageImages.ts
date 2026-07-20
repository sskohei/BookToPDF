"use client";

import { useCallback, useState } from "react";
import type { Corners } from "../lib/cv/geometry";
import { addPageImages, removePageImage, setPageImageCorners, type PageImage } from "./pageImages";

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

  const setCorners = useCallback((id: string, corners: Corners | null) => {
    setImages((current) => setPageImageCorners(current, id, corners));
  }, []);

  return { images, addFiles, removeImage, setCorners };
}
