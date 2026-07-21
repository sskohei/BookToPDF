/**
 * PDFバイト列をBlob URL経由でブラウザのダウンロードとしてトリガーする。
 * <a download>要素をDOMに一瞬だけ挿入してclick()する標準的な手法。
 * URL.revokeObjectURLをclick()直後に呼ぶと、ダウンロード開始処理が
 * 非同期で走るブラウザでは解放が早すぎる場合があるため、少し遅延させる。
 */
export function triggerDownload(bytes: Uint8Array, filename: string): void {
  // pdf-lib's Uint8Array may be backed by an ArrayBufferLike that TS's BlobPart
  // type doesn't accept directly; copying into a fresh Uint8Array guarantees a
  // plain ArrayBuffer-backed view.
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
