/** Client-only presentation policy; never changes operational order history or status. */
export type StatusVisibilityMode = "normal" | "hide_selected" | "current_only";

export type StatusVisibilityPolicy = {
  mode: StatusVisibilityMode;
  hiddenStatusKeys: string[];
  showNextStep: boolean;
  showProgress: boolean;
};

export type ResolvedStatusVisibility = {
  visibleKeys: string[];
  showTimeline: boolean;
  showNextStep: boolean;
  showProgress: boolean;
};

export const DEFAULT_STATUS_VISIBILITY: StatusVisibilityPolicy = {
  mode: "normal",
  hiddenStatusKeys: [],
  showNextStep: true,
  showProgress: true,
};

/** Pure, fail-open for absent rules, fail-closed for current-only layout. */
export function resolveStatusVisibility(
  allKeys: readonly string[],
  currentStatus: string,
  policy?: StatusVisibilityPolicy | null,
): ResolvedStatusVisibility {
  const keys = [...new Set(allKeys.filter(Boolean))];
  const mode = policy?.mode ?? "normal";
  if (mode === "current_only") {
    return { visibleKeys: [], showTimeline: false, showNextStep: false, showProgress: false };
  }
  if (mode !== "hide_selected") {
    return { visibleKeys: keys, showTimeline: true, showNextStep: true, showProgress: true };
  }
  const hidden = new Set((policy?.hiddenStatusKeys ?? []).filter(key => key !== currentStatus));
  return {
    visibleKeys: keys.filter(key => !hidden.has(key)),
    showTimeline: true,
    showNextStep: policy?.showNextStep !== false,
    showProgress: policy?.showProgress !== false,
  };
}

/** The original, unfiltered sequence is authoritative for true percentages. */
export function getNextVisibleStatusKey(
  originalKeys: readonly string[],
  visibleKeys: readonly string[],
  originalIndex: number,
): string | null {
  const allowed = new Set(visibleKeys);
  for (let i = Math.max(0, originalIndex + 1); i < originalKeys.length; i++) {
    if (allowed.has(originalKeys[i])) return originalKeys[i];
  }
  return null;
}
