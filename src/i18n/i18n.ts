import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { zhCN, enUS, zhTW, ja } from "date-fns/locale";
import { enUS as enUSLanguage } from "./lang/enUS";
// import { zhCN as zhCNLanguage } from "./lang/zhCN";
// import { zhTW as zhTWLanguage } from "./lang/zhTW";
// import { jaJP as jaJPLanguage } from "./lang/jaJP";

i18next.use(initReactI18next).init({
  interpolation: {
    // React already does escaping
    escapeValue: false
  },
  keySeparator: false, // we do not use keys in form messages.welcome
  lng: localStorage.getItem("language") || "en-US", // "en-US" | "zh-CN"
  fallbackLng: "en-US",
  resources: {
    "en-US": enUSLanguage
    // TODO: Support other languages
    // "zh-CN": zhCNLanguage,
    // "zh-TW": zhTWLanguage,
    // "ja-JP": jaJPLanguage
  }
});

export default i18next;

export function languageCodeToLanguageName(code: string) {
  if (code === "zh-CN") {
    return "简体中文";
  } else if (code === "zh-TW") {
    return "繁体中文";
  } else if (code === "ja-JP") {
    return "日本語";
  } else {
    return "English";
  }
}

export function languageCodeToDateFNSLocale(code: string) {
  if (code === "zh-CN") {
    return zhCN;
  } else if (code === "en-US") {
    return enUS;
  } else if (code === "zh-HK") {
    return zhTW;
  } else if (code === "ja-JP") {
    return ja;
  } else {
    return enUS;
  }
}
