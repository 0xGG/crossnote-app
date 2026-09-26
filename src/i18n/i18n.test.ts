import { enUS, ja, zhCN, zhTW } from "date-fns/locale";
import { describe, expect, it } from "vitest";
import { languageCodeToDateFNSLocale } from "./i18n";

describe("languageCodeToDateFNSLocale", () => {
  it("dates each language the app offers in that language", () => {
    expect(languageCodeToDateFNSLocale("en-US")).toBe(enUS);
    expect(languageCodeToDateFNSLocale("zh-CN")).toBe(zhCN);
    expect(languageCodeToDateFNSLocale("zh-TW")).toBe(zhTW);
    expect(languageCodeToDateFNSLocale("ja-JP")).toBe(ja);
  });
});
