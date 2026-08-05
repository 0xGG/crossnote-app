import { CrossnoteContainer } from "./crossnote";
import { SettingsContainer } from "./settings";

interface GlobalContainers {
  settingsContainer: ReturnType<typeof SettingsContainer.useContainer>;
  crossnoteContainer: ReturnType<typeof CrossnoteContainer.useContainer>;
}

export const globalContainers: GlobalContainers = {
  settingsContainer: null,
  crossnoteContainer: null,
};
