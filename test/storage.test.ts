// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IdbStore, LocalStore } from "../src/adapters/storage/index.js";

describe("IdbStore", () => {
  it("stores values far bigger than localStorage allows", async () => {
    const store = new IdbStore("t1:", "db-big");
    const big = "x".repeat(8 * 1024 * 1024); // 8 MB, e.g. several background photos
    await store.set("posts", big);
    expect((await new IdbStore("t1:", "db-big").get("posts"))?.length).toBe(big.length);
    await store.delete("posts");
    expect(await store.get("posts")).toBeNull();
  });
  it("moves data written by older versions out of localStorage", async () => {
    localStorage.setItem("t2:posts:acme", "[1,2]");
    const store = new IdbStore("t2:", "db-migrate");
    expect(await store.get("posts:acme")).toBe("[1,2]");
    expect(localStorage.getItem("t2:posts:acme")).toBeNull();
    expect(await new IdbStore("t2:", "db-migrate").get("posts:acme")).toBe("[1,2]");
  });
  it("adds its store to a database of the same name made by someone else", async () => {
    await new Promise<void>(r => { const req = indexedDB.open("db-foreign", 1); req.onupgradeneeded = () => req.result.createObjectStore("other"); req.onsuccess = () => { req.result.close(); r(); }; });
    const store = new IdbStore("t3:", "db-foreign");
    await store.set("k", "v");
    expect(await store.get("k")).toBe("v");
  });
});

describe("LocalStore", () => {
  it("never reads a stale value back after a failed write", async () => {
    const store = new LocalStore("t4:");
    await store.set("k", "old");
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException("full", "QuotaExceededError"); };
    try {
      await store.set("k", "new");
      expect(await store.get("k")).toBe("new");
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
});
