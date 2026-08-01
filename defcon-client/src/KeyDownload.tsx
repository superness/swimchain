import { useStoredIdentity } from '@swimchain/react';

function downloadStoredKey(): void {
  const raw = localStorage.getItem('swimchain-identity');
  if (!raw) return;
  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'swimchain-identity.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Lives at the App level (not inside BrowserJoin) so it stays visible AFTER a
 * successful join too — BrowserJoin itself unmounts once `<Wall/>` replaces
 * it, and saving your key is arguably most useful right after you get it.
 */
export function KeyDownload() {
  const { hasIdentity } = useStoredIdentity();
  if (!hasIdentity) return null;
  return (
    <p className="fine-print key-download">
      <button className="link-btn" type="button" onClick={downloadStoredKey}>
        Download your key
      </button>{' '}
      — your key, your identity — browser storage is not a vault.
    </p>
  );
}
