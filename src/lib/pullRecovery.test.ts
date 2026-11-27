import { expect, it, vi } from "vitest";
import {
  deletePullRecovery,
  readPullRecovery,
  savePullRecovery,
  type PullRecovery,
} from "./pullRecovery";

const record: PullRecovery = {
  version: 2,
  localSha: "base",
  remoteSha: "remote",
  files: { "a.bin": new Uint8Array([0, 128, 255]), "gone.txt": null },
};

it("persists bytes and deletion atomically, readable after completion and removable", async () => {
  await savePullRecovery("bytes", record);
  const loaded = await readPullRecovery("bytes");
  expect({ ...loaded, files: undefined }).toEqual({
    ...record,
    files: undefined,
  });
  expect(Array.from(loaded!.files["a.bin"]!)).toEqual([0, 128, 255]);
  expect(loaded!.files["gone.txt"]).toBeNull();
  expect(ArrayBuffer.isView(loaded!.files["a.bin"])).toBe(true);
  await deletePullRecovery("bytes");
  expect(await readPullRecovery("bytes")).toBeUndefined();
});

it("rejects on transaction abort even after the put request succeeds, retaining the older recovery", async () => {
  await savePullRecovery("aborted", record);
  const put = IDBObjectStore.prototype.put;
  const spy = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (this: IDBObjectStore, ...args) {
      const request = put.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      return request;
    });
  try {
    await expect(
      savePullRecovery("aborted", { ...record, remoteSha: "lost" }),
    ).rejects.toThrow();
  } finally {
    spy.mockRestore();
  }
  expect((await readPullRecovery("aborted"))!.remoteSha).toBe("remote");
  await deletePullRecovery("aborted");
});
