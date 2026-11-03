export type CommandTab = "library" | "builder";

export function getNextCommandTab(current: CommandTab, key: string): CommandTab | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowLeft":
      return current === "library" ? "builder" : "library";
    case "Home":
      return "library";
    case "End":
      return "builder";
    default:
      return null;
  }
}
