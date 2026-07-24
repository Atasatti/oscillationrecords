import { describe, expect, it } from "vitest";
import {
  DUE_DATE_SERVER_GRACE_MS,
  isClearlyPastDue,
  isPastDueDate,
  localTodayStr,
} from "./task-due-date";

describe("localTodayStr", () => {
  it("formats the LOCAL calendar date, zero-padded", () => {
    expect(localTodayStr(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localTodayStr(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("does not drift a day near midnight (uses local fields, not toISOString)", () => {
    // 23:30 local — toISOString would flip to the next UTC day east of UTC.
    expect(localTodayStr(new Date(2026, 6, 24, 23, 30))).toBe("2026-07-24");
    expect(localTodayStr(new Date(2026, 6, 24, 0, 10))).toBe("2026-07-24");
  });
});

describe("isPastDueDate (exact client rule)", () => {
  const TODAY = "2026-07-24";
  it("rejects any day before today", () => {
    expect(isPastDueDate("2026-07-23", TODAY)).toBe(true);
    expect(isPastDueDate("2020-01-01", TODAY)).toBe(true);
  });
  it("allows today and the future", () => {
    expect(isPastDueDate("2026-07-24", TODAY)).toBe(false);
    expect(isPastDueDate("2026-07-25", TODAY)).toBe(false);
    expect(isPastDueDate("2027-01-01", TODAY)).toBe(false);
  });
  it("ignores non-date strings (empty = no due date)", () => {
    expect(isPastDueDate("", TODAY)).toBe(false);
    expect(isPastDueDate("not-a-date", TODAY)).toBe(false);
  });
});

describe("isClearlyPastDue (server backstop with timezone grace)", () => {
  // Fixed "now": 2026-07-24T12:00:00Z.
  const NOW = Date.parse("2026-07-24T12:00:00Z");

  it("rejects dates two or more days back", () => {
    expect(isClearlyPastDue("2026-07-20", NOW)).toBe(true);
    expect(isClearlyPastDue("2020-01-01", NOW)).toBe(true);
    // 2026-07-22T00:00Z is 60h before now — beyond any timezone's today.
    expect(isClearlyPastDue("2026-07-22", NOW)).toBe(true);
  });

  it("never rejects 'today' for any timezone on Earth", () => {
    // An admin at UTC-12 whose local today is 2026-07-23 submits that string
    // while the server clock reads the 24th — 36h grace admits it.
    expect(isClearlyPastDue("2026-07-23", NOW)).toBe(false);
    expect(isClearlyPastDue("2026-07-24", NOW)).toBe(false);
    expect(isClearlyPastDue("2026-08-01", NOW)).toBe(false);
  });

  it("treats absent/invalid values as not-past (the required-field rules own those)", () => {
    expect(isClearlyPastDue(null, NOW)).toBe(false);
    expect(isClearlyPastDue(undefined, NOW)).toBe(false);
    expect(isClearlyPastDue("", NOW)).toBe(false);
    expect(isClearlyPastDue("garbage", NOW)).toBe(false);
    expect(isClearlyPastDue(12345, NOW)).toBe(false);
  });

  it("grace window is exactly 36 hours", () => {
    expect(DUE_DATE_SERVER_GRACE_MS).toBe(36 * 60 * 60 * 1000);
    const boundary = NOW - DUE_DATE_SERVER_GRACE_MS;
    expect(isClearlyPastDue(new Date(boundary - 1000).toISOString(), NOW)).toBe(true);
    expect(isClearlyPastDue(new Date(boundary + 1000).toISOString(), NOW)).toBe(false);
  });
});
