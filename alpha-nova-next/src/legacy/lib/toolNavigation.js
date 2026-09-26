const RECENT_KEY = 'alphanova_recent_tools_v1';

export const filterToolSections = (sections, query) => {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return sections;
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.label.toLowerCase().includes(needle)),
    }))
    .filter((section) => section.items.length > 0);
};

export const readRecentTools = (storage) => {
  try {
    return JSON.parse(storage?.getItem(RECENT_KEY) || '[]').slice(0, 4);
  } catch {
    return [];
  }
};

export const recordRecentTool = (storage, item) => {
  if (!storage || !item?.to || !item?.label) return [];
  const next = [item, ...readRecentTools(storage).filter((saved) => saved.to !== item.to)].slice(0, 4);
  try {
    storage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    return next;
  }
  return next;
};
