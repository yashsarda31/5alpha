export function dashboardNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function dashboardChange(value) {
  const number = dashboardNumber(value);
  if (number === null) return { label: 'N/A', tone: '' };
  return {
    label: `${number > 0 ? '+' : ''}${number.toFixed(2)}%`,
    tone: number > 0 ? 'tone-gain' : number < 0 ? 'tone-loss' : '',
  };
}
