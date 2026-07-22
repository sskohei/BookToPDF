"use client";

import { useCallback, useEffect, useRef } from "react";
import { fileToImageData, imageDataToObjectUrl } from "../lib/cv/browserImage";
import { createCvWorkerClient, type CvWorkerClient } from "../lib/cv/client";
import { classifySpread, deriveHalfCorners, type Corners } from "../lib/cv/geometry";
import { findGutterLine } from "../lib/cv/gutter";
import { splitImageDataAt } from "../lib/cv/imageSplit";
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
 * 透視補正後の画像に、スキャンアプリ相当の見た目に近づけるための後処理
 * (傾き補正→CLAHEコントラスト/明るさ補正→余白トリミング、architecture.md step 7-8)を
 * この順で適用する。この順序は、deskewが透視変換後に残る微小な傾きのみを対象とすること、
 * enhanceContrastは傾きが直った状態でCLAHEのタイル境界を計算した方が精度が良いこと、
 * trimMarginsはdeskewの回転が作る四隅の白いウェッジを最後に取り除くのが最も安定すること、
 * による。
 */
async function applyPostProcessing(client: CvWorkerClient, imageData: ImageData): Promise<ImageData> {
  const deskewed = await client.run("deskew", { imageData });
  const contrasted = await client.run("enhanceContrast", { imageData: deskewed.imageData });
  const trimmed = await client.run("trimMargins", { imageData: contrasted.imageData });
  return trimmed.imageData;
}

/**
 * 見開き/単ページ判定以降(必要なら分割・各半分の再検出・透視補正・画質後処理・表示用URL化)を
 * 行う。自動検出パス(`processImage`)と、ユーザーが手動で確定した四隅からの再実行パス
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
    const finalImage = await applyPostProcessing(client, corrected.imageData);
    onUrls([await imageDataToObjectUrl(finalImage)]);
    return;
  }

  const gutterLine = findGutterLine(imageData, corners);
  const [left, right] = splitImageDataAt(imageData, gutterLine);
  const [leftFallbackCorners, rightFallbackCorners] = deriveHalfCorners(corners, gutterLine);

  const [leftDetected, rightDetected] = await Promise.all([
    client.run("detectCorners", { imageData: left }),
    client.run("detectCorners", { imageData: right }),
  ]);

  // 綴じ目側の辺は本が物理的に連続しているため輪郭が薄く、独立再検出(detectCorners)では
  // 隣ページとの境目を正しく見つけられないことがある(見つからず`found: false`になるのではなく、
  // 綴じ目を無視してラスター分割の切り口自体をページの辺と誤認し、隣ページの三角形のくさびを
  // 巻き込んだ`found: true`の四隅を返してしまう)。そのため綴じ目側の2頂点は常に
  // `gutterLine`から幾何学的に導出した点を使い、背景とのコントラストが強く独立検出が信頼できる
  // 外周側の2頂点だけをdetectCornersの結果(見つかれば)で上書きする。
  const leftCorners = mergeGutterSideCorners(
    leftDetected.found ? leftDetected.corners : null,
    leftFallbackCorners,
    "left",
  );
  const rightCorners = mergeGutterSideCorners(
    rightDetected.found ? rightDetected.corners : null,
    rightFallbackCorners,
    "right",
  );

  const urls = await Promise.all(
    [
      { half: left, corners: leftCorners },
      { half: right, corners: rightCorners },
    ].map(async ({ half, corners: halfCorners }) => {
      const corrected = await client.run("perspectiveTransform", { imageData: half, corners: halfCorners });
      const finalImage = await applyPostProcessing(client, corrected.imageData);
      return imageDataToObjectUrl(finalImage);
    }),
  );
  onUrls(urls);
}

/**
 * 見開き分割後の半分の四隅を組み立てる。外周側(背景とのコントラストが強く、独立検出
 * `detectCorners`が信頼できる2頂点)は検出結果があればそれを使い、綴じ目側(隣ページとの
 * 境目が薄く、検出結果を信用すると隣ページのくさびを巻き込みうる2頂点)は常に`fallback`
 * (`deriveHalfCorners`が`gutterLine`から幾何学的に導出したもの)を使う。`detected`が
 * `null`(独立検出に完全に失敗した)場合は`fallback`をそのまま使う。
 */
function mergeGutterSideCorners(detected: Corners | null, fallback: Corners, side: "left" | "right"): Corners {
  if (!detected) return fallback;
  if (side === "left") {
    return {
      topLeft: detected.topLeft,
      bottomLeft: detected.bottomLeft,
      topRight: fallback.topRight,
      bottomRight: fallback.bottomRight,
    };
  }
  return {
    topRight: detected.topRight,
    bottomRight: detected.bottomRight,
    topLeft: fallback.topLeft,
    bottomLeft: fallback.bottomLeft,
  };
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
