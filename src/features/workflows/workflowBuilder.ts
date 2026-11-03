import type { WorkflowStep } from "../../domain/types";

export interface WorkflowBuilderStep extends WorkflowStep {
  argumentsText: string;
}

export function buildWorkflowPrompt(steps: WorkflowBuilderStep[]): string {
  return steps
    .map((step) => {
      const command = step.commandId.trim().replace(/^\\/+/, "");
      if (!command) return "";
      const args = step.argumentsText.trim();
      return args ? `/${command} ${args}` : `/${command}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function moveWorkflowStep<T>(steps: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) return steps;
  const next = [...steps];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function validateWorkflowCommandIds(
  steps: WorkflowStep[],
  knownCommandIds: ReadonlySet<string>,
): string[] {
  return steps.flatMap((step, index) => {
    const commandId = step.commandId.trim().replace(/^\\/+/, "");
    if (!commandId) return [`Step ${index + 1}: command is required.`];
    if (!knownCommandIds.has(commandId)) return [`Step ${index + 1}: unknown command "${step.commandId}".`];
    return [];
  });
}
