import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRedisInstance = vi.hoisted(() => ({
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    set = mockRedisInstance.set;
    get = mockRedisInstance.get;
    del = mockRedisInstance.del;
  },
}));

import { acquireLock } from "../redis";

describe("acquireLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stable Date.now and Math.random for predictable lock values
    vi.spyOn(Date, "now").mockReturnValue(1000);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  it("returns a release function when lock is acquired", async () => {
    mockRedisInstance.set.mockResolvedValue("OK");

    const release = await acquireLock("my-resource");

    expect(release).toBeTypeOf("function");
  });

  it("returns null when lock is already held", async () => {
    mockRedisInstance.set.mockResolvedValue(null);

    const release = await acquireLock("my-resource");

    expect(release).toBeNull();
  });

  it("release function calls redis.del when lock value matches", async () => {
    mockRedisInstance.set.mockResolvedValue("OK");
    mockRedisInstance.get.mockResolvedValue("1000-0.5");

    const release = await acquireLock("my-resource");
    await release!();

    expect(mockRedisInstance.get).toHaveBeenCalledWith("lock:my-resource");
    expect(mockRedisInstance.del).toHaveBeenCalledWith("lock:my-resource");
  });

  it("release function does NOT call redis.del when lock value doesn't match (stolen lock)", async () => {
    mockRedisInstance.set.mockResolvedValue("OK");
    // Simulate another process having overwritten the lock
    mockRedisInstance.get.mockResolvedValue("9999-0.9");

    const release = await acquireLock("my-resource");
    await release!();

    expect(mockRedisInstance.get).toHaveBeenCalledWith("lock:my-resource");
    expect(mockRedisInstance.del).not.toHaveBeenCalled();
  });

  it("uses correct lock key format: lock:${key}", async () => {
    mockRedisInstance.set.mockResolvedValue("OK");

    await acquireLock("ingest:moltbook");

    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      "lock:ingest:moltbook",
      expect.any(String),
      expect.any(Object)
    );
  });

  it("passes correct SET options (nx: true, ex: ttlSeconds)", async () => {
    mockRedisInstance.set.mockResolvedValue("OK");

    await acquireLock("my-resource", 600);

    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      "lock:my-resource",
      expect.any(String),
      { nx: true, ex: 600 }
    );
  });

  it("uses default TTL of 300 when not specified", async () => {
    mockRedisInstance.set.mockResolvedValue("OK");

    await acquireLock("my-resource");

    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      "lock:my-resource",
      expect.any(String),
      { nx: true, ex: 300 }
    );
  });

  it("uses custom TTL when provided", async () => {
    mockRedisInstance.set.mockResolvedValue("OK");

    await acquireLock("my-resource", 60);

    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      "lock:my-resource",
      expect.any(String),
      { nx: true, ex: 60 }
    );
  });

  it("generates lock value from Date.now and Math.random", async () => {
    mockRedisInstance.set.mockResolvedValue("OK");

    await acquireLock("my-resource");

    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      "lock:my-resource",
      "1000-0.5",
      { nx: true, ex: 300 }
    );
  });
});
