"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useLanguage } from "@/i18n/LanguageProvider";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useLanguage();
  // Avoid rendering the resolved theme before the client has mounted, since
  // the server can't know the visitor's system preference.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-flag pattern recommended by next-themes to avoid SSR/client hydration mismatch
    setMounted(true);
  }, []);

  const current = mounted ? resolvedTheme : undefined;

  return (
    <div className="flex gap-1 rounded-full border border-[var(--border)] bg-[var(--panel-bg)] p-1 shadow-sm">
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={current === "light"}
        className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
          current === "light"
            ? "bg-[#f97316] text-white"
            : "bg-transparent text-[var(--muted)]"
        }`}
      >
        {t("themeToggle.light")}
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={current === "dark"}
        className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
          current === "dark"
            ? "bg-[#f97316] text-white"
            : "bg-transparent text-[var(--muted)]"
        }`}
      >
        {t("themeToggle.dark")}
      </button>
    </div>
  );
}
