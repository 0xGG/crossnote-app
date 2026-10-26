// Notes in the browser's own storage are this site's data, which the browser
// may clear to free up space unless the site has been granted persistent
// storage. Granted, the browser keeps it until the user clears it.

export type StoragePersistence = "persisted" | "not-persisted" | "unsupported";

async function ask(
  question: "persisted" | "persist",
): Promise<StoragePersistence> {
  const storage =
    typeof navigator === "undefined" ? undefined : navigator.storage;
  if (!storage || typeof storage[question] !== "function") {
    return "unsupported";
  }
  try {
    return (await storage[question]()) ? "persisted" : "not-persisted";
  } catch (error) {
    // Refused outright, as some browsers do for a page that is not secure.
    return "not-persisted";
  }
}

/** Whether the browser keeps this site's storage, as it stands. */
export function storagePersistence(): Promise<StoragePersistence> {
  return ask("persisted");
}

/**
 * Asks the browser to keep this site's storage. Chromium decides by itself
 * how the site is used; Firefox asks the user.
 */
export function persistStorage(): Promise<StoragePersistence> {
  return ask("persist");
}

/** Asks once, as the app starts, unless the browser already keeps it. */
export async function keepStorage(): Promise<StoragePersistence> {
  const persistence = await storagePersistence();
  return persistence === "not-persisted" ? persistStorage() : persistence;
}
