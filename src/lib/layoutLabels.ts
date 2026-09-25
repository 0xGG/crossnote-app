import { I18nLabel } from "flexlayout-react";

// FlexLayout's own words that can show in this app, mapped to the language
// packs. The rest of its labels belong to features the app leaves off:
// popouts, floating panels, maximizing, renaming, pinning, tab groups, the
// active tabset marker, the tabset close button and context menus.
export const layoutLabelKeys: Partial<Record<I18nLabel, string>> = {
  [I18nLabel.Close_Tab]: "general/close",
  [I18nLabel.Overflow_Menu_Tooltip]: "layout/hidden-tabs",
  [I18nLabel.Splitter]: "layout/resize",
  // Shown while dragging a whole tabset by its tab strip; the "?" becomes
  // the number of tabs.
  [I18nLabel.Move_Tabs]: "layout/move-tabs",
  [I18nLabel.Move_Tabset]: "layout/move-tabset",
  [I18nLabel.Error_rendering_component]: "layout/error-rendering-component",
  [I18nLabel.Error_rendering_component_retry]: "layout/retry",
};

// For the Layout's i18nTranslator, which is handed the tabs' names as well
// as its labels: anything that is not one of the labels above comes back as
// it is. A tab can be named anything, "toString" or "constructor" too, so
// only the table's own keys count.
export function translateLayoutLabel(
  t: (key: string) => string,
  key: string,
): string {
  return Object.prototype.hasOwnProperty.call(layoutLabelKeys, key)
    ? t(layoutLabelKeys[key as I18nLabel])
    : key;
}
