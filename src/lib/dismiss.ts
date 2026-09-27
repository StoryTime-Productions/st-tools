export function keepOpenForInlineEdit(event: KeyboardEvent) {
  if (event.target instanceof HTMLElement && event.target.closest("[data-inline-edit]")) {
    event.preventDefault();
  }
}
