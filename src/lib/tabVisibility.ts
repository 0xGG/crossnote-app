import type { TabNode } from "flexlayout-react";

// FlexLayout keeps one listener per event on a tab: setting another replaces
// the first, and removing it leaves none. A note's panel and the list of
// references inside it both follow whether their tab shows, so each took the
// other's place. Here the tab has the one listener, which tells them all.

type Listener = (visible: boolean) => void;

const listeners = new WeakMap<TabNode, Set<Listener>>();

/**
 * Calls back when a tab comes to the front or goes behind another; gives
 * what stops it.
 */
export function onTabVisibility(tab: TabNode, listener: Listener): () => void {
  let its = listeners.get(tab);
  if (!its) {
    const added = new Set<Listener>();
    its = added;
    listeners.set(tab, added);
    tab.setEventListener("visibility", (params: { visible: boolean }) => {
      for (const each of [...added]) {
        each(params.visible);
      }
    });
  }
  its.add(listener);
  return () => {
    const left = listeners.get(tab);
    if (!left) {
      return;
    }
    left.delete(listener);
    if (left.size === 0) {
      listeners.delete(tab);
      tab.removeEventListener("visibility");
    }
  };
}
