import { describe, it, expect, vi } from "vitest";
import { Watchdog, watchdogReason } from "../../src/agents/watchdog.js";

describe("Watchdog", () => {
  it("starts idle clock on start, no decision when fresh", () => {
    let now = 1_000;
    const w = new Watchdog(() => now);
    w.start("a1");
    const d = w.check(45 * 60_000, 45 * 60_000, () => true);
    expect(d.size).toBe(0);
  });

  it("reports tool timeout when a tool runs too long", () => {
    let now = 0;
    const w = new Watchdog(() => now);
    w.start("a1");
    w.recordActivity("a1", { type: "start", toolName: "fetch_content" });
    now = 46 * 60_000;
    const d = w.check(45 * 60_000, 45 * 60_000, () => true);
    expect(d.get("a1")?.kind).toBe("tool");
    expect(d.get("a1")?.toolName).toBe("fetch_content");
    expect(watchdogReason(d.get("a1")!)).toContain("fetch_content");
  });

  it("clears tool timer on end, then idle timeout applies", () => {
    let now = 0;
    const w = new Watchdog(() => now);
    w.start("a1");
    w.recordActivity("a1", { type: "start", toolName: "bash" });
    now = 10 * 60_000;
    w.recordActivity("a1", { type: "end", toolName: "bash" });
    now = 10 * 60_000 + 46 * 60_000;
    const d = w.check(45 * 60_000, 45 * 60_000, () => true);
    expect(d.get("a1")?.kind).toBe("idle");
  });

  it("0 disables a check", () => {
    let now = 0;
    const w = new Watchdog(() => now);
    w.start("a1");
    now = 10_000_000;
    expect(w.check(0, 0, () => true).size).toBe(0);
    expect(w.check(0, 45 * 60_000, () => true).get("a1")?.kind).toBe("idle");
  });

  it("drops non-running agents (self-healing)", () => {
    const w = new Watchdog(() => 0);
    w.start("gone");
    const d = w.check(1, 1, () => false);
    expect(d.size).toBe(0);
    // second check should not see it either
    expect(w.check(1, 1, () => false).size).toBe(0);
  });

  it("recordText resets idle clock", () => {
    let now = 0;
    const w = new Watchdog(() => now);
    w.start("a1");
    now = 40 * 60_000;
    w.recordText("a1");
    now = 40 * 60_000 + 40 * 60_000;
    // only 40m since last activity → no idle (45m threshold)
    expect(w.check(0, 45 * 60_000, () => true).size).toBe(0);
    now += 10 * 60_000;
    expect(w.check(0, 45 * 60_000, () => true).get("a1")?.kind).toBe("idle");
  });
});
