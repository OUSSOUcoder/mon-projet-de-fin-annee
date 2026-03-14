export function MessageKeyBadge({ keyInfo }) {
  if (!keyInfo) return null;
  return (
    <div className="mt-1 flex items-center gap-1 flex-wrap">
      <span className="text-[9px] bg-purple-900/60 border border-purple-500/40 text-purple-300 px-1.5 py-0.5 rounded font-mono">
        #msg {keyInfo.messageNumber}
      </span>
      <span className="text-[9px] bg-green-900/60 border border-green-500/40 text-green-300 px-1.5 py-0.5 rounded font-mono" title="AES-GCM IV">
        IV: {keyInfo.aesIV || keyInfo.aesKey || 'N/A'}
      </span>
      <span className="text-[9px] bg-yellow-900/60 border border-yellow-500/40 text-yellow-300 px-1.5 py-0.5 rounded font-mono" title="HMAC-SHA256">
        MAC: {keyInfo.mac || 'N/A'}
      </span>
      <span className="text-[9px] bg-blue-900/60 border border-blue-500/40 text-blue-300 px-1.5 py-0.5 rounded font-mono" title="Nonce anti-replay">
        🎲 {keyInfo.nonce || 'N/A'}
      </span>
    </div>
  );
}