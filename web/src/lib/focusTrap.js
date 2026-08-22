const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export const nextFocusIndex = (count, index, reverse) => {
  if (!count) return -1;
  if (index < 0) return reverse ? count - 1 : 0;
  return (index + (reverse ? -1 : 1) + count) % count;
};

export const trapFocus = (event, container) => {
  if (event.key !== 'Tab' || !container) return false;
  const items = [...container.querySelectorAll(FOCUSABLE)]
    .filter((item) => !item.hidden && item.getClientRects().length > 0);
  const index = items.indexOf(document.activeElement);
  const wrapsForward = !event.shiftKey && index === items.length - 1;
  const wrapsBack = event.shiftKey && index <= 0;
  if (!items.length || (!wrapsForward && !wrapsBack)) return false;
  event.preventDefault();
  items[nextFocusIndex(items.length, index, event.shiftKey)].focus();
  return true;
};
