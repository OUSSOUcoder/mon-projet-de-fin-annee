// ─────────────────────────────────────────────
// ReadReceipt — indicateur ✓ / ✓✓ / ✓✓ bleu
// Statuts : 'sending' | 'sent' | 'delivered' | 'read'
// ─────────────────────────────────────────────

export function ReadReceipt({ status }) {
  if (!status || status === 'sending') {
    return (
      <span className="text-[10px] text-gray-500 ml-1" title="Envoi en cours">
        ⏳
      </span>
    );
  }

  if (status === 'sent') {
    return (
      <span className="text-[10px] text-gray-400 ml-1 font-bold" title="Envoyé">
        ✓
      </span>
    );
  }

  if (status === 'delivered') {
    return (
      <span className="text-[10px] text-gray-400 ml-1 font-bold" title="Reçu">
        ✓✓
      </span>
    );
  }

  if (status === 'read') {
    return (
      <span className="text-[10px] text-blue-400 ml-1 font-bold" title="Lu">
        ✓✓
      </span>
    );
  }

  return null;
}


export default ReadReceipt;
