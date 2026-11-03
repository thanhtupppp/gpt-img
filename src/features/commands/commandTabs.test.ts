import { describe, expect, it } from "vitest";
import { getNextCommandTab } from "./commandTabs";

describe("command tab keyboard navigation", () => {
  it("moves between tabs with wrapping arrow navigation", () => {
    expect(getNextCommandTab("library", "ArrowRight")).toBe("builder");
    expect(getNextCommandTab("builder", "ArrowRight")).toBe("library");
    expect(getNextCommandTab("library", "ArrowLeft")).toBe("builder");
    expect(getNextCommandTab("builder", "ArrowLeft")).toBe("library");
  });

  it("moves to the first or last tab with Home and End", () => {
    expect(getNextCommandTab("builder", "Home")).toBe("library");
    expect(getNextCommandTab("library", "End")).toBe("builder");
  });

  it("ignores keys outside the tab navigation contract", () => {
    expect(getNextCommandTab("library", "Tab")).toBeNull();
    expect(getNextCommandTab("builder", "Enter")).toBeNull();
  });
});
