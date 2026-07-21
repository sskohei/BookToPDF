"use client";

import { useCallback, useEffect, useRef } from "react";
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
 * フォールバック対象であることを示す。手動調整後の再実行には戻り値の `retryWithCorners` を使う
 * （`CornerEditor`自体はこのフックの外、`components/CornerEditor.tsx` 側の責務）。
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

  const retryWithCorners = useCallback(
    (id: string, corners: Corners): Promise<void> => {
      const client = clientRef.current;
      const image = images.find((img) => img.id === id);
      if (!client || !image) return Promise.resolve();
      return retryWithCornersImpl(client, image, corners, { setCorners, setProcessedPreviewUrls });
    },
    [images, setCorners, setProcessedPreviewUrls],
  );

  return { retryWithCorners };
}

/**
 * 見開き/単ページ判定以降(必要なら分割・各半分の再検出・透視補正・表示用URL化)を行う。
 * 自動検出パス(`processImage`)と、ユーザーが手動で確定した四隅からの再実行パス
 * (`retryWithCornersImpl`)の両方から呼ばれる共通処理。
 */
async function runCorrectionPipeline(
  client: CvWorkerClient,
  imageData: ImageData,
  corners: Corners,
  onUrls: (urls: string[]) => void,
): Promise<void> {
  if (classifySpread(corners) === "single") {
    const corrected = await client.run("perspectiveTransform", { imageData, corners });
    onUrls([await imageDataToObjectUrl(corrected.imageData)]);
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
  onUrls(urls);
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
    await runCorrectionPipeline(client, imageData, detected.corners, (urls) =>
      setProcessedPreviewUrls(image.id, urls),
    );
  } catch (err) {
    console.error("page processing failed", err);
    setCorners(image.id, null);
  }
}

/**
 * ユーザーがCornerEditorで確定した四隅で再実行する。自動パスと異なり、失敗しても
 * `corners`を`null`に戻さない（ユーザーが明示的に指定した値を、一時的な失敗で
 * 消してしまうと再度エディタを開いたときにデフォルトの初期矩形に後退してしまうため）。
 * 代わりに`processedPreviewUrls`を空配列にし、既存の「補正失敗」表示にフォールバックさせる。
 */
async function retryWithCornersImpl(
  client: CvWorkerClient,
  image: PageImage,
  corners: Corners,
  { setCorners, setProcessedPreviewUrls }: Actions,
): Promise<void> {
  setCorners(image.id, corners);
  try {
    const imageData = await fileToImageData(image.file);
    await runCorrectionPipeline(client, imageData, corners, (urls) =>
      setProcessedPreviewUrls(image.id, urls),
    );
  } catch (err) {
    console.error("manual correction failed", err);
    setProcessedPreviewUrls(image.id, []);
  }
}
