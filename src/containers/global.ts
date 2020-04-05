import { CloudContainer } from "./cloud";
import { SettingsContainer } from "./settings";

interface GlobalContainers {
  cloudContainer: ReturnType<typeof CloudContainer.useContainer>;
  settingsContainer: ReturnType<typeof SettingsContainer.useContainer>;
}

export const globalContainers: GlobalContainers = {
  cloudContainer: null,
  settingsContainer: null,
};
