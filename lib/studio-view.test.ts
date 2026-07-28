import { describe, it, expect } from "vitest";
import { weekDays, addDaysKey, segmentForDay } from "./studio-view";
import { studioDayStartUtc } from "./studio-schedule";

describe("weekDays", () => {
  it("returns 7 Monday-first days containing the anchor", () => {
    // 2026-07-15 is a Wednesday.
    const days = weekDays(new Date("2026-07-15T12:00:00Z"));
    expect(days).toHaveLength(7);
    expect(days[0]!.dateKey).toBe("2026-07-13"); // Monday
    expect(days[6]!.dateKey).toBe("2026-07-19"); // Sunday
  });
});

describe("addDaysKey", () => {
  it("advances a day key across a month boundary", () => {
    expect(addDaysKey("2026-07-31", 1)).toBe("2026-08-01");
  });
});

describe("segmentForDay", () => {
  const day = { dateKey: "2026-07-15", startUtc: studioDayStartUtc("2026-07-15"), isToday: false };
  const next = studioDayStartUtc("2026-07-16");
  it("maps a same-day booking to its local-minute span", () => {
    // 14:00–16:00 BST = 13:00–15:00 UTC.
    const seg = segmentForDay(
      new Date("2026-07-15T13:00:00Z"), new Date("2026-07-15T15:00:00Z"), day, next
    );
    expect(seg).toEqual({ topMin: 840, bottomMin: 960 });
  });
  it("returns null for a booking on another day", () => {
    const seg = segmentForDay(
      new Date("2026-07-16T13:00:00Z"), new Date("2026-07-16T15:00:00Z"), day, next
    );
    expect(seg).toBeNull();
  });
  it("clamps an overnight booking to end-of-day", () => {
    // 23:00 local → 02:00 next day local; within THIS day it runs to 1440.
    const seg = segmentForDay(
      new Date("2026-07-15T22:00:00Z"), new Date("2026-07-16T01:00:00Z"), day, next
    );
    expect(seg?.topMin).toBe(1380); // 23:00
    expect(seg?.bottomMin).toBe(1440);
  });
});
