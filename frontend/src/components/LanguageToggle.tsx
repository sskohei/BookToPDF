"use client";

import { useLanguage } from "@/i18n/LanguageProvider";
import type { Locale } from "@/i18n/translations";

export function LanguageToggle() {
  const { locale, setLocale, t } = useLanguage();

  const options: { value: Locale; labelKey: "languageToggle.ja" | "languageToggle.en" }[] = [
    { value: "ja", labelKey: "languageToggle.ja" },
    { value: "en", labelKey: "languageToggle.en" },
  ];

  return (
    <div className="flex gap-1 rounded-full border border-[var(--border)] bg-[var(--panel-bg)] p-1 shadow-sm">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setLocale(option.value)}
          aria-pressed={locale === option.value}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
            locale === option.value
              ? "bg-[#f97316] text-white"
              : "bg-transparent text-[var(--muted)]"
          }`}
        >
          {t(option.labelKey)}
        </button>
      ))}
    </div>
  );
}
