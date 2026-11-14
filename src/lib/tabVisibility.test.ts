import type { TabNode } from "flexlayout-react";
import { describe, expect, it, vi } from "vitest";
import { onTabVisibility } from "./tabVisibility";

// A tab as FlexLayout keeps its listeners: one to an event, the last set.
function tab() {
  let listener: ((params: { visible: boolean }) => void) | undefined;
  const node = {
    setEventListener: vi.fn((_event: string, callback: typeof listener) => {
      listener = callback;
    }),
    removeEventListener: vi.fn(() => {
      listener = undefined;
    }),
  };
  return {
    node: node as unknown as TabNode,
    spies: node,
    show: (visible: boolean) => listener?.({ visible }),
  };
}

describe("onTabVisibility", () => {
  it("tells every listener of a tab, through the one FlexLayout keeps", () => {
    const { node, spies, show } = tab();
    const panel = vi.fn();
    const references = vi.fn();
    onTabVisibility(node, panel);
    onTabVisibility(node, references);
    expect(spies.setEventListener).toHaveBeenCalledTimes(1);
    show(true);
    show(false);
    expect(panel.mock.calls).toEqual([[true], [false]]);
    expect(references.mock.calls).toEqual([[true], [false]]);
  });

  it("goes on telling the others when one stops listening", () => {
    const { node, spies, show } = tab();
    const panel = vi.fn();
    const references = vi.fn();
    onTabVisibility(node, panel);
    const stop = onTabVisibility(node, references);
    stop();
    show(true);
    expect(panel).toHaveBeenCalledWith(true);
    expect(references).not.toHaveBeenCalled();
    expect(spies.removeEventListener).not.toHaveBeenCalled();
  });

  it("takes its listener off the tab with the last of them, and puts one back for the next", () => {
    const { node, spies, show } = tab();
    const stop = onTabVisibility(node, vi.fn());
    stop();
    // Twice is once.
    stop();
    expect(spies.removeEventListener).toHaveBeenCalledTimes(1);
    const again = vi.fn();
    onTabVisibility(node, again);
    expect(spies.setEventListener).toHaveBeenCalledTimes(2);
    show(true);
    expect(again).toHaveBeenCalledWith(true);
  });

  it("keeps the listeners of different tabs apart", () => {
    const first = tab();
    const second = tab();
    const one = vi.fn();
    const two = vi.fn();
    onTabVisibility(first.node, one);
    onTabVisibility(second.node, two);
    first.show(true);
    expect(one).toHaveBeenCalledWith(true);
    expect(two).not.toHaveBeenCalled();
  });
});
