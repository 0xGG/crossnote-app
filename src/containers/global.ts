import { CloudContainer } from "./cloud";
import { CrossnoteContainer } from "./crossnote";
import { SettingsContainer } from "./settings";

interface GlobalContainers {
  cloudContainer: ReturnType<typeof CloudContainer.useContainer>;
  settingsContainer: ReturnType<typeof SettingsContainer.useContainer>;
  crossnoteContainer: ReturnType<typeof CrossnoteContainer.useContainer>;
}

export const globalContainers: GlobalContainers = {
  cloudContainer: null,
  settingsContainer: null,
  crossnoteContainer: null,
};
