import { describe, expect, it } from "vitest";
import { isClientDisconnect } from "../instrumentation";

/** Build the error Node raises when a client abandons an in-flight request. */
function abortError(): Error {
  const e = new Error("aborted") as NodeJS.ErrnoException;
  e.code = "ECONNRESET";
  return e;
}

describe("isClientDisconnect", () => {
  it("matches the request-aborted signature", () => {
    // What the server logs when a browser navigates away mid-request:
    //   [Error: aborted] { code: 'ECONNRESET' }
    expect(isClientDisconnect(abortError())).toBe(true);
  });

  it("matches a prematurely closed stream", () => {
    const e = new Error("Premature close") as NodeJS.ErrnoException;
    e.code = "ERR_STREAM_PREMATURE_CLOSE";
    expect(isClientDisconnect(e)).toBe(true);
  });

  it("does NOT swallow an ECONNRESET from an upstream call we made", () => {
    // Our own outbound request failing IS an application problem worth logging;
    // it reads differently from Node's bare request-teardown error.
    const e = new Error("fetch failed") as NodeJS.ErrnoException;
    e.code = "ECONNRESET";
    expect(isClientDisconnect(e)).toBe(false);

    const hangup = new Error("socket hang up") as NodeJS.ErrnoException;
    hangup.code = "ECONNRESET";
    expect(isClientDisconnect(hangup)).toBe(false);
  });

  it("does NOT swallow an unrelated error that happens to say 'aborted'", () => {
    // No ECONNRESET code — e.g. an AbortController timeout in our own code.
    expect(isClientDisconnect(new Error("aborted"))).toBe(false);
  });

  it("does NOT swallow ordinary application errors", () => {
    expect(isClientDisconnect(new Error("Invalid `prisma.release.update()` invocation"))).toBe(false);
    expect(isClientDisconnect(new TypeError("x is not a function"))).toBe(false);
  });

  it("ignores non-Error values", () => {
    expect(isClientDisconnect("aborted")).toBe(false);
    expect(isClientDisconnect(null)).toBe(false);
    expect(isClientDisconnect(undefined)).toBe(false);
    expect(isClientDisconnect({ code: "ECONNRESET", message: "aborted" })).toBe(false);
  });
});
