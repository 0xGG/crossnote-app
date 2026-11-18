import type { enUS } from "./lang/enUS";

declare module "i18next" {
  interface CustomTypeOptions {
    keySeparator: false;
    fallbackNS: ["translation"];
    resources: { translation: typeof enUS.translation };
  }
}
