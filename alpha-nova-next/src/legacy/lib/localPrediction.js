const STORAGE_KEY = 'alphanova_local_prediction';
const VALID_CHOICES = new Set(['UP', 'DOWN']);

export const readLocalChoice = (storage, qdate) => {
  if (!qdate) return null;
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
    return saved?.qdate === qdate && VALID_CHOICES.has(saved?.choice)
      ? saved.choice
      : null;
  } catch {
    return null;
  }
};

export const writeLocalChoice = (storage, qdate, choice) => {
  if (!qdate || !VALID_CHOICES.has(choice)) return false;
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ qdate, choice }));
    return true;
  } catch {
    return false;
  }
};
