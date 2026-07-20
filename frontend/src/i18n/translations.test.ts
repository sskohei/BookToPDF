import { describe, expect, it } from "vitest";
import { translate } from "./translations";

describe("translate", () => {
  it("returns the string for the requested locale", () => {
    expect(translate("ja", "capture.button.chooseFiles")).toBe("ファイルを選択");
    expect(translate("en", "capture.button.chooseFiles")).toBe("Choose files");
  });

  it("substitutes placeholders from params", () => {
    expect(translate("ja", "capture.pageCount", { count: 3 })).toBe("3枚");
    expect(translate("en", "capture.pageCount", { count: 3 })).toBe("3 photos");
  });

  it("substitutes multiple occurrences of the same placeholder", () => {
    expect(translate("ja", "previewGrid.pageBadge", { index: 2 })).toBe("p.2");
  });

  it("falls back to the key itself when no translation exists", () => {
    // @ts-expect-error -- intentionally testing an unknown key at runtime
    expect(translate("en", "does.not.exist")).toBe("does.not.exist");
  });
});
