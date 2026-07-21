export type Locale = "ja" | "en";

export const locales: Locale[] = ["ja", "en"];

type TranslationParams = Record<string, string | number>;

const dictionaries = {
  ja: {
    "capture.title.empty": "ページを追加",
    "capture.title.filled": "ページを確認",
    "capture.pageCount": "{count}枚",
    "capture.dropzone.label": "ここにドラッグ&ドロップ",
    "capture.button.camera": "カメラで撮影",
    "capture.button.chooseFiles": "ファイルを選択",
    "capture.tip.label": "撮影のコツ:",
    "capture.tip.body": "明るい場所で、ページ全体が影なく写るように。",
    "capture.footnote": "対応形式: JPG・PNG・HEIC / 1枚あたり最大 10MB",
    "capture.uploading": "アップロード中… {progress}%",
    "capture.uploadButton": "{count}枚をアップロード",
    "previewGrid.pageBadge": "p.{index}",
    "previewGrid.removeAria": "p.{index} を削除",
    "previewGrid.previewAlt": "ページ {index} のプレビュー",
    "previewGrid.correctedAlt": "ページ {index} の補正済みプレビュー",
    "previewGrid.addTile": "追加",
    "previewGrid.processing": "処理中…",
    "previewGrid.detectionFailed": "検出できませんでした",
    "previewGrid.leftPage": "左",
    "previewGrid.rightPage": "右",
    "previewGrid.adjustAria": "p.{index} の四隅を調整",
    "previewGrid.viewAria": "p.{index} を拡大表示",
    "pageReorder.dragHandleAria": "p.{index} をドラッグして並び替え",
    "imageViewer.close": "閉じる",
    "cornerEditor.title": "四隅を調整",
    "cornerEditor.instructions": "ハンドルをドラッグしてページの四隅に合わせてください",
    "cornerEditor.cancel": "キャンセル",
    "cornerEditor.confirm": "この位置で補正",
    "cornerEditor.applying": "補正中…",
    "cornerEditor.handle.topLeft": "左上のハンドル",
    "cornerEditor.handle.topRight": "右上のハンドル",
    "cornerEditor.handle.bottomRight": "右下のハンドル",
    "cornerEditor.handle.bottomLeft": "左下のハンドル",
    "appHeader.title": "BookToPDF",
    "languageToggle.ja": "日本語",
    "languageToggle.en": "English",
    "themeToggle.light": "ライト",
    "themeToggle.dark": "ダーク",
  },
  en: {
    "capture.title.empty": "Add pages",
    "capture.title.filled": "Review pages",
    "capture.pageCount": "{count} photos",
    "capture.dropzone.label": "Drag & drop your photos here",
    "capture.button.camera": "Camera",
    "capture.button.chooseFiles": "Choose files",
    "capture.tip.label": "Tip:",
    "capture.tip.body": "Shoot in good light, keep the page flat and shadow-free.",
    "capture.footnote": "Supported: JPG · PNG · HEIC / up to 10MB each",
    "capture.uploading": "Uploading… {progress}%",
    "capture.uploadButton": "Upload {count} photos",
    "previewGrid.pageBadge": "p.{index}",
    "previewGrid.removeAria": "Delete p.{index}",
    "previewGrid.previewAlt": "Preview of page {index}",
    "previewGrid.correctedAlt": "Corrected preview of page {index}",
    "previewGrid.addTile": "Add",
    "previewGrid.processing": "Processing…",
    "previewGrid.detectionFailed": "Could not detect",
    "previewGrid.leftPage": "L",
    "previewGrid.rightPage": "R",
    "previewGrid.adjustAria": "Adjust corners of p.{index}",
    "previewGrid.viewAria": "View p.{index} enlarged",
    "pageReorder.dragHandleAria": "Drag to reorder p.{index}",
    "imageViewer.close": "Close",
    "cornerEditor.title": "Adjust corners",
    "cornerEditor.instructions": "Drag the handles to match the page's four corners",
    "cornerEditor.cancel": "Cancel",
    "cornerEditor.confirm": "Apply correction",
    "cornerEditor.applying": "Applying…",
    "cornerEditor.handle.topLeft": "Top-left handle",
    "cornerEditor.handle.topRight": "Top-right handle",
    "cornerEditor.handle.bottomRight": "Bottom-right handle",
    "cornerEditor.handle.bottomLeft": "Bottom-left handle",
    "appHeader.title": "BookToPDF",
    "languageToggle.ja": "日本語",
    "languageToggle.en": "English",
    "themeToggle.light": "Light",
    "themeToggle.dark": "Dark",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type TranslationKey = keyof (typeof dictionaries)["ja"];

export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const template = dictionaries[locale][key] ?? dictionaries.ja[key] ?? key;
  if (!params) return template;
  return Object.entries(params).reduce<string>(
    (result, [paramKey, value]) => result.replaceAll(`{${paramKey}}`, String(value)),
    template,
  );
}
