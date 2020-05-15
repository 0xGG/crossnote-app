import { CloudContainer } from "./cloud";
import { SettingsContainer } from "./settings";
import { CrossnoteContainer } from "./crossnote";

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
