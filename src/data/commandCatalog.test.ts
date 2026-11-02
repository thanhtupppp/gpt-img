import { describe, expect, it } from "vitest";
import { commandCatalog, getCommandById, searchCommands } from "./commandCatalog";

describe("PIECS command catalog", () => {
  it("contains exactly 80 unique commands across eight modules", () => {
    expect(commandCatalog).toHaveLength(80);
    expect(new Set(commandCatalog.map((command) => command.id)).size).toBe(80);
    expect(new Set(commandCatalog.map((command) => command.module)).size).toBe(8);
  });

  it("provides usable documentation for every command", () => {
    for (const command of commandCatalog) {
      expect(command.name.trim()).not.toBe("");
      expect(command.description.trim()).not.toBe("");
      expect(command.syntax).toMatch(/^\\//);
      expect(command.examples.length).toBeGreaterThan(0);
    }
  });

  it("looks up commands by stable ID", () => {
    expect(getCommandById("analyze")?.name).toBe("Analyze");
    expect(getCommandById("missing")).toBeUndefined();
  });

  it("searches names, descriptions, modules, and tags case-insensitively", () => {
    expect(searchCommands("portrait").some((command) => command.id === "lock-face")).toBe(true);
    expect(searchCommands("quality").some((command) => command.id === "qc")).toBe(true);
    expect(searchCommands("NO_MATCH")).toEqual([]);
  });
});
