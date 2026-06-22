import type { McpFollowUpAction } from "../contracts/session";

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase();
}

function extractQuotedName(prompt: string): string | null {
  const match = prompt.match(/["“”']([^"'“”]+)["“”']/);
  return match?.[1]?.trim() || null;
}

export function resolveFollowUpActionFromPrompt(prompt: string): McpFollowUpAction {
  const normalized = normalizePrompt(prompt);

  if (
    normalized.includes("undo") ||
    normalized.includes("отмени") ||
    normalized.includes("откат")
  ) {
    return { type: "undo-last-batch" };
  }

  if (
    normalized.includes("replace") ||
    normalized.includes("замени") ||
    normalized.includes("переделай")
  ) {
    return { type: "replace-last-batch" };
  }

  if (
    normalized.includes("new page") ||
    normalized.includes("на новой странице") ||
    normalized.includes("создай новую страницу")
  ) {
    return { type: "new-page" };
  }

  if (
    normalized.includes("bind page") ||
    normalized.includes("привяжи к странице") ||
    normalized.includes("на страницу")
  ) {
    return {
      type: "bind-page",
      targetPageName: extractQuotedName(prompt),
    };
  }

  return { type: "append" };
}
