import { I18nLabel } from "flexlayout-react";
import { describe, expect, it } from "vitest";
import { enUS } from "../i18n/lang/enUS";
import { jaJP } from "../i18n/lang/jaJP";
import { zhCN } from "../i18n/lang/zhCN";
import { zhTW } from "../i18n/lang/zhTW";
import { layoutLabelKeys, translateLayoutLabel } from "./layoutLabels";

const packs = { enUS, zhCN, zhTW, jaJP };

describe("layout labels", () => {
  it("only maps labels FlexLayout has", () => {
    const labels: string[] = Object.values(I18nLabel);
    for (const label of Object.keys(layoutLabelKeys)) {
      expect(labels).toContain(label);
    }
  });

  it("finds every key in all four language packs", () => {
    for (const [name, pack] of Object.entries(packs)) {
      for (const key of Object.values(layoutLabelKeys)) {
        expect(pack.translation, `${key} in ${name}`).toHaveProperty([key]);
      }
    }
  });

  it("keeps the one ? the drag image fills with the number of tabs", () => {
    for (const pack of Object.values(packs)) {
      expect(pack.translation["layout/move-tabs"].split("?")).toHaveLength(2);
    }
  });

  it("translates the labels and hands tab names back as they are", () => {
    const t = (key: string) => `<${key}>`;
    expect(translateLayoutLabel(t, I18nLabel.Splitter)).toBe("<layout/resize>");
    expect(translateLayoutLabel(t, I18nLabel.Close_Tab)).toBe(
      "<general/close>",
    );
    expect(translateLayoutLabel(t, "README")).toBe("README");
  });

  it("hands back tab names every object has a property for", () => {
    const t = (key: string) => `<${key}>`;
    for (const name of Object.getOwnPropertyNames(Object.prototype)) {
      expect(translateLayoutLabel(t, name)).toBe(name);
    }
  });
});
