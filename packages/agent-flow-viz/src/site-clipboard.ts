import { Effect } from "effect";

// The temporary selection supports the served HTTP/IP preview as well as HTTPS.
const copyWithSelection = (text: string): boolean => {
  const focused = document.activeElement;
  const selection = window.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) =>
        selection.getRangeAt(i).cloneRange(),
      )
    : [];
  const inputSelection =
    focused instanceof HTMLInputElement ||
    focused instanceof HTMLTextAreaElement
      ? {
          start: focused.selectionStart,
          end: focused.selectionEnd,
          direction: focused.selectionDirection,
        }
      : undefined;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("aria-hidden", "true");
  field.style.cssText = "position:fixed;left:-9999px;top:0;";
  document.body.append(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    return document.execCommand("copy");
  } finally {
    field.remove();
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
    if (
      inputSelection &&
      (focused instanceof HTMLInputElement ||
        focused instanceof HTMLTextAreaElement)
    ) {
      try {
        focused.setSelectionRange(
          inputSelection.start,
          inputSelection.end,
          inputSelection.direction ?? undefined,
        );
      } catch {
        /* Some input types cannot hold a text selection. */
      }
    }
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
};
export const copyText = Effect.fn("Site.copyText")((text: string) =>
  Effect.promise(async () => {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        /* Try the HTTP-compatible selection path. */
      }
    }
    try {
      return copyWithSelection(text);
    } catch {
      return false;
    }
  }),
);
