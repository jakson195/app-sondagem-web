import type { CadAiCommand } from "@/lib/rtk-validation/cad/ai-command-types";
import type { CadProject } from "@/lib/rtk-validation/cad/types";

export type CadAssistantPending = {
  snapshot: CadProject;
  nextProject: CadProject;
  selectedId: string | null;
  commands: CadAiCommand[];
  preview: string;
  destructive: boolean;
};

export type CadAssistantUndoEntry = {
  project: CadProject;
  selectedId: string | null;
};

export function cloneCadProject(project: CadProject): CadProject {
  return structuredClone(project);
}

export function pushUndo(stack: CadAssistantUndoEntry[], entry: CadAssistantUndoEntry, limit = 20) {
  stack.push({ project: cloneCadProject(entry.project), selectedId: entry.selectedId });
  if (stack.length > limit) stack.splice(0, stack.length - limit);
}

export function popUndo(stack: CadAssistantUndoEntry[]): CadAssistantUndoEntry | null {
  return stack.pop() ?? null;
}
