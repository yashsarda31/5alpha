// Branded full-page share images. Captures the actual on-screen analysis
// (chart included — Plotly renders SVG, which the browser rasterizes
// faithfully via html-to-image's foreignObject approach) and frames it with
// an Alpha Nova header and URL footer. Elements marked data-noshare (e.g. the
// share button itself) are excluded from the capture.
//
// sharePageCapture(node, { shareText, filename }) -> 'shared' | 'copied' | 'downloaded' | 'cancelled'
import { toCanvas } from 'html-to-image';

const COLORS = {
  gold: '#F5DC8C', text: '#F5F5F7', dim: '#A1A1AA',
  bg: '#0B0B0E', hairline: 'rgba(255,255,255,0.14)',
};
const APP_URL = 'alphanova48.in';
const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";

let boltPromise = null;
const loadBolt = () => {
  if (!boltPromise) {
    boltPromise = fetch('/favicon.svg')
      .then((r) => r.text())
      .then((svg) => new Promise((res) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      }))
      .catch(() => null);
  }
  return boltPromise;
};

export async function renderPageCapture(node) {
  const bolt = await loadBolt();

  // backdrop-filter glass doesn't rasterize (foreignObject limitation): a
  // translucent panel would let content behind it bleed through in the image.
  // Temporarily swap glass for an opaque panel color, restore right after.
  const patched = [];
  [node, ...node.querySelectorAll('*')].forEach((el) => {
    const cs = getComputedStyle(el);
    const bf = cs.backdropFilter || cs.webkitBackdropFilter;
    if (bf && bf !== 'none') {
      patched.push([el, el.style.cssText]);
      el.style.backdropFilter = 'none';
      el.style.webkitBackdropFilter = 'none';
      el.style.backgroundColor = '#101014';
    }
  });

  let shot;
  try {
    // Rasterize the analysis exactly as rendered, at 2x for sharp text.
    shot = await toCanvas(node, {
      backgroundColor: '#050507',
      pixelRatio: 2,
      filter: (el) => !(el.dataset && el.dataset.noshare !== undefined),
    });
  } finally {
    patched.forEach(([el, css]) => { el.style.cssText = css; });
  }

  const W = shot.width;
  const u = W / 1080; // scale branding with capture width
  const headerH = Math.round(110 * u);
  const footerH = Math.round(84 * u);
  const H = headerH + shot.height + footerH;

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // Header band
  ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, W, headerH);
  const pad = Math.round(48 * u);
  const midY = headerH / 2;
  if (bolt) {
    const bh = Math.round(56 * u);
    ctx.drawImage(bolt, pad, midY - bh / 2, Math.round(bh * 1.04), bh);
  }
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(40 * u)}px ${FONT}`;
  ctx.fillStyle = COLORS.gold; ctx.fillText('Alpha', pad + Math.round(76 * u), midY);
  const alphaW = ctx.measureText('Alpha').width;
  ctx.fillStyle = COLORS.text; ctx.fillText(' Nova', pad + Math.round(76 * u) + alphaW, midY);
  ctx.font = `500 ${Math.round(24 * u)}px ${FONT}`;
  ctx.fillStyle = COLORS.dim; ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), W - pad, midY);
  ctx.textAlign = 'left';
  ctx.strokeStyle = COLORS.hairline; ctx.lineWidth = Math.max(1, u);
  ctx.beginPath(); ctx.moveTo(0, headerH - 1); ctx.lineTo(W, headerH - 1); ctx.stroke();

  // The captured analysis
  ctx.drawImage(shot, 0, headerH);

  // Footer band
  const fy = headerH + shot.height;
  ctx.fillStyle = COLORS.bg; ctx.fillRect(0, fy, W, footerH);
  ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy); ctx.stroke();
  const fmid = fy + footerH / 2;
  ctx.font = `700 ${Math.round(28 * u)}px ${FONT}`;
  ctx.fillStyle = COLORS.gold; ctx.fillText(APP_URL, pad, fmid);
  ctx.font = `500 ${Math.round(20 * u)}px ${FONT}`;
  ctx.fillStyle = COLORS.dim; ctx.textAlign = 'right';
  ctx.fillText('Educational analytics — not investment advice', W - pad, fmid);
  ctx.textAlign = 'left';

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('canvas export failed'))), 'image/png'));
}

export async function sharePageCapture(node, { shareText = 'Alpha Nova analysis', filename = 'alpha-nova-analysis.png', shareUrl = 'https://alphanova48.in' } = {}) {
  const blob = await renderPageCapture(node);
  const file = new File([blob], filename, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Alpha Nova', text: `${shareText}\n${shareUrl}`, url: shareUrl });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      // fall through to clipboard/download
    }
  }
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    }
  } catch { /* clipboard denied — download instead */ }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
