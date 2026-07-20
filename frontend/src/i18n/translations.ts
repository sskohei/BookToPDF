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
    "previewGrid.addTile": "追加",
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
    "previewGrid.addTile": "Add",
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
