// ─────────────────────────────────────────────
// SessionBadge — statut de la session E2EE
// ─────────────────────────────────────────────
export function SessionBadge({ status }) {
  if (status === 'established') return (
    <span className="inline-flex items-center gap-1 text-xs bg-green-900/60 border border-green-500/50 text-green-300 px-2 py-0.5 rounded-full font-semibold">
      <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block animate-pulse" />
      Session établie
    </span>
  );
  
  if (status === 'pending') return (
    <span className="inline-flex items-center gap-1 text-xs bg-yellow-900/60 border border-yellow-500/50 text-yellow-300 px-2 py-0.5 rounded-full font-semibold">
      <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full inline-block" />
      Session en cours…
    </span>
  );
  
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-gray-700/60 border border-gray-500/50 text-gray-400 px-2 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full inline-block" />
      Pas de session
    </span>
  );
}

// Export par défaut
export default SessionBadge;