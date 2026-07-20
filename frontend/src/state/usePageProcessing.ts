"use client";

import { useEffect, useRef } from "react";
import { fileToImageData, imageDataToObjectUrl } from "../lib/cv/browserImage";
import { createCvWorkerClient, type CvWorkerClient } from "../lib/cv/client";
import { classifySpread, type Corners } from "../lib/cv/geometry";
import { splitImageDataInHalf } from "../lib/cv/imageSplit";
import type { PageImage } from "./pageImages";

type Actions = {
  setCorners: (id: string, corners: Corners | null) => void;
  setProcessedPreviewUrls: (id: string, urls: string[]) => void;
};

/**
 * アップロードされた画像のうち四隅検出が未試行(`corners === undefined`)のものを見つけ、
 * cv Web Workerで自動処理する（四隅検出→見開き/単ページ判定→(見開きなら分割して各半分を再検出)→
 * 透視補正→表示用URL化）。検出できなかった場合は `corners` を `null` にして手動調整UIへの
 * フォールバック対象であることを示す（`CornerEditor`自体は別issueのスコープ）。
 */
export function usePageProcessing(images: PageImage[], { setCorners, setProcessedPreviewUrls }: Actions) {
  const clientRef = useRef<CvWorkerClient | null>(null);
  const inFlightRef = useRef<Set<string>>(new Set());

  // Workerの生成・破棄はuseEffect内で行う。useState(() => createCvWorkerClient())のような
  // 遅延初期化はReact Strict Mode下で初期化関数が開発時に2回呼ばれるためWorkerがリークしうるが、
  // useEffectのクリーンアップは正しくマウント→クリーンアップ→再マウントの順で効くため安全。
  useEffect(() => {
    const client = createCvWorkerClient();
    clientRef.current = client;
    return () => {
      clientRef.current = null;
      client.terminate();
    };
  }, []);

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;

    for (const image of images) {
      if (image.corners !== undefined || inFlightRef.current.has(image.id)) continue;
      inFlightRef.current.add(image.id);
      void processImage(client, image, { setCorners, setProcessedPreviewUrls }).finally(() => {
        inFlightRef.current.delete(image.id);
      });
    }
  }, [images, setCorners, setProcessedPreviewUrls]);
}

async function processImage(
  client: CvWorkerClient,
  image: PageImage,
  { setCorners, setProcessedPreviewUrls }: Actions,
): Promise<void> {
  try {
    const imageData = await fileToImageData(image.file);
    const detected = await client.run("detectCorners", { imageData });
    if (!detected.found) {
      setCorners(image.id, null);
      return;
    }
    setCorners(image.id, detected.corners);

    if (classifySpread(detected.corners) === "single") {
      const corrected = await client.run("perspectiveTransform", {
        imageData,
        corners: detected.corners,
      });
      setProcessedPreviewUrls(image.id, [await imageDataToObjectUrl(corrected.imageData)]);
      return;
    }

    const [left, right] = splitImageDataInHalf(imageData);
    const [leftDetected, rightDetected] = await Promise.all([
      client.run("detectCorners", { imageData: left }),
      client.run("detectCorners", { imageData: right }),
    ]);

    const urls: string[] = [];
    if (leftDetected.found) {
      const corrected = await client.run("perspectiveTransform", {
        imageData: left,
        corners: leftDetected.corners,
      });
      urls.push(await imageDataToObjectUrl(corrected.imageData));
    }
    if (rightDetected.found) {
      const corrected = await client.run("perspectiveTransform", {
        imageData: right,
        corners: rightDetected.corners,
      });
      urls.push(await imageDataToObjectUrl(corrected.imageData));
    }
    setProcessedPreviewUrls(image.id, urls);
  } catch (err) {
    console.error("page processing failed", err);
    setCorners(image.id, null);
  }
}
