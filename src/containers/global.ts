import { CrossnoteContainer } from "./crossnote";

interface GlobalContainers {
  crossnoteContainer: ReturnType<typeof CrossnoteContainer.useContainer>;
}

export const globalContainers: GlobalContainers = {
  crossnoteContainer: null,
};
