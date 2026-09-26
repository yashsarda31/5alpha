export function nextQuality(fps, current) {
  if (current === 'static') return 'static';
  if (fps < 30) return current === 'full' ? 'reduced' : 'static';
  return current;
}

export function particleCountFor(level, isMobile) {
  if (level === 'static') return 0;
  if (level === 'reduced') return isMobile ? 180 : 450;
  return isMobile ? 350 : 900;
}

export function shouldUseMagic({ flag, webgl, reducedMotion }) {
  if (String(flag).toLowerCase() === 'off') return false;
  if (!webgl) return false;
  if (reducedMotion) return false;
  return true;
}
