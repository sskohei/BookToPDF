"use client";

import { useLanguage } from "@/i18n/LanguageProvider";
import { LanguageToggle } from "./LanguageToggle";
import { ThemeToggle } from "./ThemeToggle";

export function AppHeader() {
  const { t } = useLanguage();

  return (
    <header className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-5 pt-6 sm:px-8">
      <span className="text-sm font-bold text-[var(--text)]">{t("appHeader.title")}</span>
      <div className="flex flex-wrap gap-3">
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}
