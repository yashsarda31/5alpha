import React, { useState, useRef, useEffect } from 'react';
import { Share2, Check, Link2 } from 'lucide-react';
import { sharePageCapture } from '../lib/shareCard';
import { canonicalShareUrl, createPublicShare } from '../lib/shareLink';

const STATUS_TEXT = {
  shared: 'Shared!',
  copied: 'Image copied — paste it anywhere',
  downloaded: 'Image saved',
  linkCopied: 'Link copied',
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

  const resolveShareUrl = async () => {
    try { return await createPublicShare(window.location, shareText || 'Alpha Nova research'); }
    catch { return canonicalShareUrl(window.location); }
  };

  const onClick = async () => {
    const node = capture && capture();
    if (!node) return;
    setBusy(true);
    setStatus(null);
    try {
      const shareUrl = await resolveShareUrl();
      const outcome = await sharePageCapture(node, { shareText, filename, shareUrl });
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

  const copyLink = async () => {
    const shareUrl = await resolveShareUrl();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus('linkCopied');
    } catch {
      window.prompt('Copy this public link', shareUrl);
      setStatus(null);
    }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus(null), 3500);
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
        {status && status !== 'linkCopied' ? <Check size={compact ? 14 : 15} aria-hidden="true" /> : <Share2 size={compact ? 14 : 15} aria-hidden="true" />}
        {!compact && (busy ? 'Preparing…' : label)}
      </button>
      <button
        type="button"
        onClick={copyLink}
        title="Copy public link"
        aria-label="Copy public link"
        style={{
          width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '7px',
          padding: compact ? '6px 8px' : '9px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          borderRadius: compact ? '8px' : '10px', border: '1px solid var(--border-subtle, rgba(255,255,255,.14))',
          background: 'transparent', color: 'var(--text-secondary, #A1A1AA)',
        }}
      >
        {status === 'linkCopied' ? <Check size={14} aria-hidden="true" /> : <Link2 size={14} aria-hidden="true" />}
        {!compact && 'Copy link'}
      </button>
      {status && !compact && <span style={{ fontSize: '12px', color: 'var(--text-secondary, #A1A1AA)' }}>{STATUS_TEXT[status] || status}</span>}
    </span>
  );
};

export default ShareButton;
