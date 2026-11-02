export interface CommandBuilderStep {
  id: string;
  commandId: string;
  argumentsText: string;
}

export function buildCommandPrompt(steps: CommandBuilderStep[]): string {
  return steps
    .map((step) => {
      const command = step.commandId.trim().replace(/^\/+/, "");
      if (!command) return "";
      const args = step.argumentsText.trim();
      return args ? `/${command} ${args}` : `/${command}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function moveCommandStep<T>(steps: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) return steps;
  const next = [...steps];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
