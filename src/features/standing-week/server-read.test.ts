import { describe, expect, it } from "vitest";
import { isCacheOnly, serverRead, type ServerReadInput } from "./server-read";

/**
 * An answer from the server, or "can't tell" (voice review follow-up, Sep 27
 * 2026): a snapshot only this iPad's cache gave is never a read the week
 * check may call a slot open on.
 */

const at = (over: Partial<ServerReadInput>): ServerReadInput => ({
  loading: false,
  failed: false,
  fromCache: false,
  online: true,
  waitedOut: false,
  ...over,
});

describe("serverRead", () => {
  it("is ready only for the server's answer", () => {
    expect(serverRead(at({}))).toBe("ready");
    expect(serverRead(at({ fromCache: true }))).toBe("loading");
    expect(serverRead(at({ loading: true }))).toBe("loading");
  });

  it("says can't tell offline, or once the server has kept it waiting", () => {
    expect(serverRead(at({ fromCache: true, online: false }))).toBe("offline");
    expect(serverRead(at({ loading: true, online: false }))).toBe("offline");
    expect(serverRead(at({ fromCache: true, waitedOut: true }))).toBe("offline");
    // An answer from the server stands, whatever the browser says now.
    expect(serverRead(at({ online: false }))).toBe("ready");
  });

  it("puts a failed read first", () => {
    expect(serverRead(at({ failed: true, fromCache: true, online: false }))).toBe("failed");
  });
});

describe("isCacheOnly", () => {
  it("is the snapshot's own flag; a snapshot without metadata is the server's", () => {
    expect(isCacheOnly({ metadata: { fromCache: true } })).toBe(true);
    expect(isCacheOnly({ metadata: { fromCache: false } })).toBe(false);
    expect(isCacheOnly({})).toBe(false);
    expect(isCacheOnly(null)).toBe(false);
  });
});
