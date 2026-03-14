// ─── DecryptedPanel.jsx ───────────────────────────────────────
// Panneau latéral : messages déchiffrés avec clés Double Ratchet
// et démonstration PFS (attaque par message)

export function DecryptedPanel({ decryptedMessages, setDecryptedMessages, showToast, setShowDecryptPanel }) {
  const entries   = Object.entries(decryptedMessages).reverse();
  const totalDec  = entries.length;
  const totalComp = Object.values(decryptedMessages).filter(m => m.compromised).length;

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-purple-500 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-purple-400">🔓 Messages Déchiffrés</h2>
        <button
          onClick={() => setShowDecryptPanel(false)}
          className="text-gray-400 hover:text-white text-xl font-bold"
        >
          ✕
        </button>
      </div>

      {/* List */}
      <div className="h-96 overflow-y-auto space-y-3">
        {totalDec === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">Aucun message déchiffré.</p>
            <p className="text-gray-600 text-xs mt-2">
              Cliquez sur "🔓 Déchiffrer" dans les messages reçus
            </p>
          </div>
        ) : (
          entries.map(([msgId, dec]) => (
            <DecryptedCard
              key={msgId}
              msgId={msgId}
              dec={dec}
              onAttack={() => {
                setDecryptedMessages(prev => ({
                  ...prev,
                  [msgId]: { ...prev[msgId], compromised: true },
                }));
                showToast('⚠️ Clé compromise ! Les autres messages restent protégés (PFS)', 'warning');
              }}
            />
          ))
        )}
      </div>

      {/* Footer stats */}
      {totalDec > 0 && (
        <div className="mt-4 p-3 bg-purple-900/30 border border-purple-600/50 rounded-lg">
          <p className="text-xs text-purple-300 text-center">
            📊 {totalDec} message(s) déchiffré(s)
            {totalComp > 0 && (
              <span className="text-red-400 ml-2">· {totalComp} compromis</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Single decrypted card ─────────────────────────────────────
function DecryptedCard({ msgId, dec, onAttack }) {
  const isComp = dec.compromised;
  const keyRows = [
    { label: 'Message #', value: `${dec.keyInfo?.messageNumber}${dec.keyInfo?.sequenceNumber && dec.keyInfo.sequenceNumber !== '—' ? ` (seq:${dec.keyInfo.sequenceNumber})` : ''}`, color: 'blue'   },
    { label: 'AES IV',    value: dec.keyInfo?.aesIV || dec.keyInfo?.aesKey,                                                                                                          color: 'green'  },
    { label: 'MAC',       value: dec.keyInfo?.mac,                                                                                                                                   color: 'yellow' },
    { label: 'Nonce',     value: dec.keyInfo?.nonce,                                                                                                                                 color: 'purple' },
  ];

  return (
    <div className={`bg-gradient-to-br ${isComp ? 'from-red-900/50 to-red-950/50' : 'from-purple-900/50 to-pink-900/50'} p-4 rounded-lg border ${isComp ? 'border-red-500/50' : 'border-purple-500/30'}`}>

      {/* Meta */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-purple-300">{dec.from} → {dec.to}</span>
        <span className="text-xs text-gray-400">{new Date(dec.timestamp).toLocaleTimeString()}</span>
      </div>

      {/* Plaintext */}
      <div className="bg-white/5 p-3 rounded-lg mb-3">
        <p className="text-sm font-semibold text-green-400 mb-1">💬 Message en clair :</p>
        <p className={`font-medium ${isComp ? 'text-red-300' : 'text-white'}`}>{dec.plaintext}</p>
      </div>

      {/* Key details */}
      {dec.keyInfo && (
        <div className={`p-3 rounded-lg mb-2 border ${isComp ? 'bg-red-950/30 border-red-500/30' : 'bg-blue-950/30 border-blue-500/30'}`}>
          <p className="text-xs font-bold text-blue-300 mb-2 flex items-center gap-1">
            {isComp ? '🔓' : '🔑'} Clés Double Ratchet
            {dec.keyInfo.isReal && (
              <span className="ml-auto text-[9px] bg-green-900/50 border border-green-500/40 text-green-400 px-1.5 py-0.5 rounded">
                ✓ vraies valeurs
              </span>
            )}
          </p>
          <div className="space-y-1.5 text-[10px] font-mono">
            {keyRows.map(row => (
              <div key={row.label} className="flex justify-between items-center">
                <span className="text-gray-400">{row.label}:</span>
                <span className={`px-1.5 py-0.5 rounded font-mono ${isComp ? 'bg-red-900/50 text-red-300' : `bg-${row.color}-900/50 text-${row.color}-300`}`}>
                  {row.value || 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PFS attack button */}
      {!isComp && (
        <button
          onClick={onAttack}
          className="w-full mt-2 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded text-red-400 text-xs font-bold transition-all flex items-center justify-center gap-1"
        >
          ⚠️ Attaquer ce message (démo PFS)
        </button>
      )}

      {isComp && (
        <div className="mt-2 bg-red-950/50 p-2 rounded border-l-2 border-red-500">
          <p className="text-[10px] text-red-300">
            <strong>🔓 Clé compromise !</strong> Avec PFS, seul CE message est exposé.
          </p>
        </div>
      )}

      {/* Raw ciphertext */}
      <details className="text-xs mt-2">
        <summary className="cursor-pointer text-gray-400 hover:text-gray-300">🔒 Voir le texte chiffré</summary>
        <div className="mt-2 bg-black/30 p-2 rounded font-mono text-[10px] break-all text-gray-500">
          {dec.ciphertext}
        </div>
      </details>
    </div>
  );
}
