import { describe, it, expect } from "vitest";
import {
  zonedWallTimeToUtc,
  studioParts,
  minutesIntoStudioDay,
  bookingsOverlap,
  validateBookingInput,
} from "./studio-schedule";

describe("zonedWallTimeToUtc", () => {
  it("maps a winter (GMT) wall time to the same UTC hour", () => {
    // 2026-01-15 is GMT (offset 0).
    expect(zonedWallTimeToUtc("2026-01-15", "12:00").toISOString()).toBe(
      "2026-01-15T12:00:00.000Z"
    );
  });
  it("maps a summer (BST, +1) wall time back one hour to UTC", () => {
    // 2026-07-15 is BST (offset +60).
    expect(zonedWallTimeToUtc("2026-07-15", "12:00").toISOString()).toBe(
      "2026-07-15T11:00:00.000Z"
    );
  });
  it("resolves a time just after the spring-forward gap", () => {
    // BST begins 2026-03-29 01:00→02:00. 03:00 local exists and is BST (+1).
    expect(zonedWallTimeToUtc("2026-03-29", "03:00").toISOString()).toBe(
      "2026-03-29T02:00:00.000Z"
    );
  });
});

describe("studioParts / minutesIntoStudioDay", () => {
  it("reads back local noon from a BST instant", () => {
    const p = studioParts(new Date("2026-07-15T11:00:00.000Z"));
    expect(p.hour).toBe(12);
    expect(p.minute).toBe(0);
  });
  it("minutesIntoStudioDay is 720 at local noon in summer", () => {
    expect(minutesIntoStudioDay(new Date("2026-07-15T11:00:00.000Z"))).toBe(720);
  });
});

describe("bookingsOverlap", () => {
  const d = (s: string) => new Date(s);
  it("touching intervals do not overlap (back-to-back allowed)", () => {
    expect(
      bookingsOverlap(
        d("2026-07-15T10:00:00Z"), d("2026-07-15T12:00:00Z"),
        d("2026-07-15T12:00:00Z"), d("2026-07-15T13:00:00Z"),
      )
    ).toBe(false);
  });
  it("partial overlap is detected", () => {
    expect(
      bookingsOverlap(
        d("2026-07-15T10:00:00Z"), d("2026-07-15T12:00:00Z"),
        d("2026-07-15T11:00:00Z"), d("2026-07-15T11:30:00Z"),
      )
    ).toBe(true);
  });
  it("an enveloping interval overlaps", () => {
    expect(
      bookingsOverlap(
        d("2026-07-15T10:00:00Z"), d("2026-07-15T12:00:00Z"),
        d("2026-07-15T09:00:00Z"), d("2026-07-15T13:00:00Z"),
      )
    ).toBe(true);
  });
});

describe("validateBookingInput", () => {
  const now = new Date("2026-07-15T09:00:00.000Z"); // 10:00 BST
  const base = { startDate: "2026-07-16", startTime: "14:00", endDate: "2026-07-16", endTime: "16:00" };
  it("accepts a valid future booking", () => {
    const r = validateBookingInput(base, now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.start.toISOString()).toBe("2026-07-16T13:00:00.000Z");
      expect(r.end.toISOString()).toBe("2026-07-16T15:00:00.000Z");
    }
  });
  it("rejects end <= start", () => {
    const r = validateBookingInput({ ...base, endTime: "14:00" }, now);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("after") });
  });
  it("rejects a booking shorter than the minimum", () => {
    const r = validateBookingInput({ ...base, endTime: "14:15" }, now);
    expect(r.ok).toBe(false);
  });
  it("rejects a booking more than a day in the past", () => {
    const r = validateBookingInput(
      { startDate: "2026-07-13", startTime: "14:00", endDate: "2026-07-13", endTime: "16:00" },
      now
    );
    expect(r.ok).toBe(false);
  });
  it("allows a start earlier the same day (within the 24h back-fill grace)", () => {
    // now is 10:00 BST on 2026-07-15; the all-day block starts at local 00:00.
    const r = validateBookingInput(
      { startDate: "2026-07-15", startTime: "00:00", endDate: "2026-07-16", endTime: "00:00" },
      now
    );
    expect(r.ok).toBe(true);
  });
  it("rejects a booking beyond the horizon", () => {
    const r = validateBookingInput(
      { startDate: "2027-06-01", startTime: "14:00", endDate: "2027-06-01", endTime: "16:00" },
      now
    );
    expect(r.ok).toBe(false);
  });
  it("rejects malformed input", () => {
    const r = validateBookingInput({ startDate: "nope", startTime: "14:00", endDate: "2026-07-16", endTime: "16:00" }, now);
    expect(r.ok).toBe(false);
  });
  it("accepts a 24-hour all-day booking (00:00 to next-day 00:00)", () => {
    const r = validateBookingInput(
      { startDate: "2026-07-16", startTime: "00:00", endDate: "2026-07-17", endTime: "00:00" },
      now
    );
    expect(r.ok).toBe(true);
  });
  it("accepts the 25-hour all-day booking on the autumn DST fall-back day", () => {
    // London clocks go back on 2026-10-25, making that local day 25 hours long.
    const r = validateBookingInput(
      { startDate: "2026-10-25", startTime: "00:00", endDate: "2026-10-26", endTime: "00:00" },
      new Date("2026-10-01T09:00:00.000Z")
    );
    expect(r.ok).toBe(true);
  });
  it("rejects a booking longer than a full day", () => {
    const r = validateBookingInput(
      { startDate: "2026-07-16", startTime: "00:00", endDate: "2026-07-18", endTime: "02:00" },
      now
    );
    expect(r.ok).toBe(false);
  });
});
