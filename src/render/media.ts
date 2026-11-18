import i18n from "../i18n/i18n";
import type { MediaSource } from "../utilities/media";

/** A native player whose address and resources belong to this mounted view. */
export function mountMediaPlayer(
  kind: "audio" | "video",
  label: string,
  load: () => Promise<MediaSource>,
  changed: () => void = () => {},
) {
  const element = document.createElement("span");
  element.className = "cn-media";
  const player = document.createElement(kind);
  player.controls = true;
  player.preload = "metadata";
  player.setAttribute("aria-label", label || kind);
  player.style.maxWidth = "100%";
  element.append(player);
  let disposed = false;
  let source: MediaSource | undefined;
  const fail = () => {
    if (disposed || element.querySelector("[role=status]")) return;
    const message = document.createElement("span");
    message.setAttribute("role", "status");
    message.textContent = i18n.t("attachment/playback-failed");
    element.append(message);
    changed();
  };
  player.addEventListener("error", fail);
  player.addEventListener("loadedmetadata", changed);
  const done = load()
    .then((resolved) => {
      if (disposed) {
        resolved.dispose();
        return;
      }
      source = resolved;
      player.src = resolved.url;
    })
    .catch(fail);
  return {
    element,
    done,
    dispose() {
      if (disposed) return;
      disposed = true;
      player.removeEventListener("error", fail);
      player.removeEventListener("loadedmetadata", changed);
      player.pause();
      player.removeAttribute("src");
      player.load();
      source?.dispose();
    },
  };
}
