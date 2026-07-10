import React, { useState, useRef, useEffect } from 'react';
import { Share2, Check } from 'lucide-react';
import { sharePageCapture } from '../lib/shareCard';

const STATUS_TEXT = {
  shared: 'Shared!',
  copied: 'Image copied — paste it anywhere',
  downloaded: 'Image saved',
};

// "Share this analysis" button: screenshots the given analysis element
// (charts included), frames it with the Alpha Nova brand header/footer, and
// hands the PNG to the native share sheet (mobile), clipboard, or a download.
// `capture` is called at click time and returns the DOM node to snapshot.
// The button marks itself data-noshare so it never appears in the image.
const ShareButton = ({ capture, shareText, filename, label = 'Share this analysis', style, compact = false }) => {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const onClick = async () => {
    const node = capture && capture();
    if (!node) return;
    setBusy(true);
    setStatus(null);
    try {
      const outcome = await sharePageCapture(node, { shareText, filename });
      if (outcome !== 'cancelled') {
        setStatus(STATUS_TEXT[outcome] || null);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setStatus(null), 3500);
      }
    } catch {
      setStatus('Could not create the image');
      timerRef.current = setTimeout(() => setStatus(null), 3500);
    }
    setBusy(false);
  };

  return (
    <span data-noshare="" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', ...style }}>
      <button
        onClick={onClick}
        disabled={busy}
        title="Share this analysis as an image"
        aria-label="Share this analysis as an image"
        style={{
          width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: compact ? '6px 8px' : '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          borderRadius: compact ? '8px' : '10px', border: '1px solid rgba(245, 220, 140, 0.35)',
          background: 'rgba(245, 220, 140, 0.08)', color: 'var(--primary-gold, #F5DC8C)',
        }}
      >
        {status ? <Check size={compact ? 14 : 15} aria-hidden="true" /> : <Share2 size={compact ? 14 : 15} aria-hidden="true" />}
        {!compact && (busy ? 'Preparing…' : label)}
      </button>
      {status && !compact && <span style={{ fontSize: '12px', color: 'var(--text-secondary, #A1A1AA)' }}>{status}</span>}
    </span>
  );
};

export default ShareButton;
