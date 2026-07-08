import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug";

describe("vitest harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
  it("resolves @/ path aliases", () => {
    // Import resolving to a function proves the tsconfig-paths plugin works.
    expect(typeof slugify).toBe("function");
  });
});
