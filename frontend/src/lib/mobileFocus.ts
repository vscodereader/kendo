import type React from 'react';

function focusElement(element: Element | null) {
  if (!element || !(element instanceof HTMLElement)) return;

  window.requestAnimationFrame(() => {
    element.focus();

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      try {
        element.select();
      } catch {
        // no-op
      }
    }
  });
}

export function focusClosestEditable(event: React.SyntheticEvent<HTMLElement>) {
  const target = event.target as HTMLElement | null;
  if (!target) return;

  const directField = target.closest(
    'input, textarea, select, [contenteditable="true"], .ql-editor'
  );

  if (directField) {
    focusElement(directField);
    return;
  }

  const container = target.closest(
    'td, .form-field, .filter-field, .contact-search-row, .notice-search-controls, .notice-editor, .rich-editor-wrap, .rich-board-editor'
  );

  const nestedField = container?.querySelector(
    'input, textarea, select, [contenteditable="true"], .ql-editor'
  );

  if (nestedField) {
    focusElement(nestedField);
  }
}