import { afterEach, describe, expect, it, vi } from "vitest";
import { keepStorage, persistStorage, storagePersistence } from "./storage";

// jsdom has no navigator.storage; each test puts in the one it needs.
function stubStorage(storage: Partial<StorageManager> | undefined) {
  Object.defineProperty(navigator, "storage", {
    value: storage,
    configurable: true,
  });
}

afterEach(() => {
  stubStorage(undefined);
});

describe("keepStorage", () => {
  it("asks the browser to keep the site's storage when it does not yet", async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persisted: async () => false, persist });
    expect(await keepStorage()).toBe("persisted");
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does not ask again when the browser keeps it", async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persisted: async () => true, persist });
    expect(await keepStorage()).toBe("persisted");
    expect(persist).not.toHaveBeenCalled();
  });

  it("tells a refusal", async () => {
    stubStorage({ persisted: async () => false, persist: async () => false });
    expect(await keepStorage()).toBe("not-persisted");
  });
});

describe("storage persistence", () => {
  it("is unsupported where the browser does not offer it", async () => {
    stubStorage(undefined);
    expect(await storagePersistence()).toBe("unsupported");
    expect(await persistStorage()).toBe("unsupported");
  });

  it("counts a request the browser throws on as not granted", async () => {
    stubStorage({
      persisted: async () => false,
      persist: async () => {
        throw new TypeError("not allowed");
      },
    });
    expect(await persistStorage()).toBe("not-persisted");
  });
});
