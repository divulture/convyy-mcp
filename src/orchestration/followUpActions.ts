import type { McpFollowUpAction } from "../contracts/session";

function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().trim().replace(/\s+/g, " ");
}

function includesAny(prompt: string, phrases: ReadonlyArray<string>): boolean {
  return phrases.some((phrase) => prompt.includes(phrase));
}

function extractPageNameQuery(prompt: string): string | null {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  const quotedMatch = normalized.match(
    /(?:page|страниц(?:у|е|а)?|на страницу|to page|on page)\s+["“]([^"”]+)["”]/i,
  );
  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim();
  }

  const unquotedMatch = normalized.match(
    /(?:page|страниц(?:у|е|а)?|на страницу|to page|on page)\s+([^,.!?]+?)(?:$|[,.!?])/i,
  );
  return unquotedMatch?.[1]?.trim() || null;
}

export function resolveFollowUpActionFromPrompt(
  prompt: string,
  currentPageId?: string | null,
  currentPageName?: string | null,
): McpFollowUpAction {
  const normalized = normalizePrompt(prompt);
  const pageNameQuery = extractPageNameQuery(prompt);

  if (includesAny(normalized, ["убери это", "убери результат", "undo", "отмени", "откат", "remove this", "remove the result"])) {
    return { type: "undo-last-batch" };
  }

  if (includesAny(normalized, ["replace", "замени", "переделай", "заново", "redo this", "redo it", "rework this"])) {
    return { type: "replace-last-batch" };
  }

  if (includesAny(normalized, ["new page", "another page", "на новой странице", "создай новую страницу", "новая страница"])) {
    return { type: "new-page" };
  }

  if (
    pageNameQuery ||
    includesAny(normalized, ["bind page", "bind to page", "switch to page", "go to page", "привяжи к странице", "на странице", "на страницу"])
  ) {
    return {
      type: "bind-page",
      targetPageId: currentPageId ?? undefined,
      targetPageName: pageNameQuery ?? currentPageName ?? null,
    };
  }

  return {
    type: "append",
    targetPageId: currentPageId ?? undefined,
  };
}
