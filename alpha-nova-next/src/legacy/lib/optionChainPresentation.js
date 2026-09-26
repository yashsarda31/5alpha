export const getBuildupLabel = (buildup, side) => {
  if (!buildup) return '';
  if (buildup === 'Long Buildup') return side === 'call' ? 'Call Buying' : 'Put Buying';
  if (buildup === 'Short Buildup') return side === 'call' ? 'Call Selling' : 'Put Selling';
  return buildup;
};

export const getBuildupColorClass = (buildup, side) => {
  if (buildup === 'Short Buildup' && side === 'put') return 'text-green';
  if (buildup === 'Long Buildup') return 'text-green';
  if (buildup === 'Short Buildup') return 'text-red';
  if (buildup === 'Short Covering') return 'text-green';
  if (buildup === 'Long Unwinding') return 'text-red';
  return 'text-neutral';
};
