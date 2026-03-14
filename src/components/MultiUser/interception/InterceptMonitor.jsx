import { useState, useEffect, useRef } from 'react';


function InterceptCard({ log, index }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-gray-900 border border-red-500/30 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-red-900/10 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <span className="text-red-400 font-bold text-xs">#{index + 1}</span>
          <span className="text-orange-400 text-xs font-mono">{log.from} → {log.to}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${log.messageType === 'SEALED_SENDER' ? 'bg-purple-900/60 text-purple-300 border border-purple-500/40' : 'bg-blue-900/60 text-blue-300 border border-blue-500/40'}`}>
            {log.messageType === 'SEALED_SENDER' ? '🔐 SEALED' : '🔒 E2EE'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] bg-green-900/60 border border-green-500/40 text-green-400 px-1.5 py-0.5 rounded font-bold">✓ E2EE INTACT</span>
          <span className="text-gray-500 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-red-500/20 space-y-2 pt-2">
          <div className="bg-red-950/40 border border-red-500/30 rounded p-2">
            <p className="text-red-400 text-[10px] font-bold mb-1">❌ Tentative de déchiffrement</p>
            <p className="text-gray-400 text-[10px]"><span className="text-gray-500">Résultat :</span> <span className="text-red-300">ÉCHEC</span></p>
            <p className="text-gray-400 text-[10px] mt-1"><span className="text-gray-500">Raison :</span> {log.decryptAttempt?.reason}</p>
            <p className="text-green-400 text-[10px] mt-1 font-semibold">{log.decryptAttempt?.e2eeStatus}</p>
          </div>
          <div className="bg-yellow-950/30 border border-yellow-500/20 rounded p-2">
            <p className="text-yellow-400 text-[10px] font-bold mb-1">👁️ Ce que l'attaquant PEUT voir :</p>
            <div className="space-y-0.5">
              {log.visibleMetadata && Object.entries(log.visibleMetadata).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-500 text-[10px]">{k}:</span>
                  <span className="text-yellow-300 text-[10px] font-mono">{String(v)}</span>
                </div>
              ))}
              <div className="flex justify-between">
                <span className="text-gray-500 text-[10px]">heure:</span>
                <span className="text-yellow-300 text-[10px] font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
            <p className="text-red-400 text-[9px] mt-1 font-semibold">⚠️ Contenu : ILLISIBLE (chiffré E2EE)</p>
          </div>
          {log.networkMetadata && (
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-gray-400 text-[10px] font-bold mb-1">📡 Métadonnées réseau :</p>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div><span className="text-gray-500">Taille: </span><span className="text-gray-300">{log.networkMetadata.size} octets</span></div>
                <div><span className="text-gray-500">X3DH: </span><span className="text-gray-300">{log.networkMetadata.hasX3DHInit ? '✓ oui' : '✗ non'}</span></div>
              </div>
            </div>
          )}
          <p className="text-[9px] text-gray-600 italic">{log.decryptAttempt?.attackerNote}</p>
        </div>
      )}
    </div>
  );
}

function MITMPanel({ socket, users, username, roomId }) {
  const [mitmActive, setMitmActive]           = useState(false);
  const [targets, setTargets]                 = useState([]);
  const [interceptLogs, setInterceptLogs]     = useState([]);
  const [stats, setStats]                     = useState(null);
  const [duration, setDuration]               = useState(0);
  const [injectionTarget, setInjectionTarget] = useState('');
  const [injectionResult, setInjectionResult] = useState(null);
  const [activeTab, setActiveTab]             = useState('attack');
  const [attackerName, setAttackerName]       = useState('');
  const startTimeRef = useRef(null);
  const timerRef     = useRef(null);
  const logsEndRef   = useRef(null);

  useEffect(() => {
    if (!socket) return;
    socket.on('mitm-status', ({ active, attackerName: name, finalStats, duration: dur }) => {
      setMitmActive(active);
      if (active) {
        setAttackerName(name || 'Attaquant');
        startTimeRef.current = Date.now();
        timerRef.current = setInterval(() => setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
      } else {
        clearInterval(timerRef.current);
        setDuration(0);
        if (finalStats) setStats(finalStats);
      }
    });
    socket.on('mitm-intercept', ({ log, stats: s }) => {
      setInterceptLogs(prev => [log, ...prev].slice(0, 50));
      setStats(s);
    });
    socket.on('mitm-injection-attempt', ({ result, reason }) => {
      setInjectionResult({ success: false, reason });
    });
    return () => {
      socket.off('mitm-status');
      socket.off('mitm-intercept');
      socket.off('mitm-injection-attempt');
      clearInterval(timerRef.current);
    };
  }, [socket]);

  const startMITM  = () => socket.emit('mitm-start', { roomId, targets });
  const stopMITM   = () => socket.emit('mitm-stop',  { roomId });
  const toggleTarget = (u) => setTargets(prev => prev.includes(u) ? prev.filter(t => t !== u) : [...prev, u]);
  const injectMsg  = () => { if (injectionTarget) { socket.emit('mitm-inject', { roomId, targetUsername: injectionTarget }); setInjectionResult(null); } };
  const clearLogs  = () => { socket.emit('mitm-clear-logs'); setInterceptLogs([]); setStats(null); };

  const otherUsers = users.filter(u => u.username !== username);

  return (
    <div className="bg-gray-800 rounded-xl border border-red-500/50 overflow-hidden">
      {/* Header */}
      <div className={`p-4 ${mitmActive ? 'bg-red-900/40' : 'bg-gray-900/60'} border-b border-red-500/30`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`text-2xl ${mitmActive ? 'animate-pulse' : ''}`}>🕵️</span>
            <div>
              <h2 className="font-bold text-red-400">Attaque MITM Réelle</h2>
              <p className="text-[10px] text-gray-400">
                {mitmActive ? `⚠️ Active — ${duration}s — ${interceptLogs.length} intercepté(s)` : 'Man-in-the-Middle simulé'}
              </p>
            </div>
          </div>
          {mitmActive && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
              <span className="text-red-400 text-xs font-bold">EN COURS</span>
            </div>
          )}
        </div>
        {stats && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[
              { label: 'Interceptés', value: stats.totalIntercepted,   color: 'red' },
              { label: 'Tentatives',  value: stats.decryptionAttempts, color: 'yellow' },
              { label: 'E2EE intact', value: `${stats.decryptionFailed}/${stats.decryptionAttempts}`, color: 'green' }
            ].map(s => (
              <div key={s.label} className={`bg-${s.color}-900/30 border border-${s.color}-500/30 rounded p-2 text-center`}>
                <p className={`text-${s.color}-400 font-bold text-lg`}>{s.value}</p>
                <p className="text-gray-500 text-[9px]">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="flex border-b border-gray-700">
        {[
          { id: 'attack',  label: '⚙️ Contrôle' },
          { id: 'logs',    label: `📋 Logs (${interceptLogs.length})` },
          { id: 'explain', label: '📖 Explication' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-xs font-semibold transition-colors ${activeTab === tab.id ? 'bg-red-900/20 text-red-400 border-b-2 border-red-500' : 'text-gray-400 hover:text-gray-300'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* Contrôle */}
        {activeTab === 'attack' && (
          <div className="space-y-4">
            {!mitmActive && (
              <div>
                <p className="text-xs text-gray-400 mb-2">Cibles (vide = tout le monde) :</p>
                <div className="flex flex-wrap gap-2">
                  {otherUsers.map(u => (
                    <button key={u.id} onClick={() => toggleTarget(u.username)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${targets.includes(u.username) ? 'bg-red-600 text-white border border-red-400' : 'bg-gray-700 text-gray-300 border border-gray-600 hover:border-red-500/50'}`}>
                      {targets.includes(u.username) ? '✓ ' : ''}{u.username}
                    </button>
                  ))}
                  {otherUsers.length === 0 && <p className="text-gray-600 text-xs italic">Aucun autre participant</p>}
                </div>
              </div>
            )}
            <button onClick={mitmActive ? stopMITM : startMITM}
              className={`w-full py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${mitmActive ? 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-500' : 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/30'}`}>
              {mitmActive ? '⏹ Arrêter l\'attaque' : '▶ Lancer l\'attaque MITM'}
            </button>
            <div className="border border-orange-500/30 rounded-lg p-3 bg-orange-950/20">
              <p className="text-orange-400 text-xs font-bold mb-2">💉 Tentative d'injection de message</p>
              <p className="text-gray-500 text-[10px] mb-2">Tente d'injecter un faux message → rejeté (certificat invalide)</p>
              <div className="flex gap-2">
                <select value={injectionTarget} onChange={e => setInjectionTarget(e.target.value)}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                  <option value="">Choisir une cible...</option>
                  {otherUsers.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
                </select>
                <button onClick={injectMsg} disabled={!injectionTarget}
                  className="px-3 py-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded text-xs font-bold text-white">
                  Injecter
                </button>
              </div>
              {injectionResult && (
                <div className="mt-2 p-2 bg-green-900/20 border border-green-500/40 rounded text-xs text-green-300">
                  ✅ Injection bloquée — {injectionResult.reason}
                </div>
              )}
            </div>
            <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg p-3">
              <p className="text-blue-400 text-[10px] font-bold mb-1">ℹ️ But pédagogique</p>
              <p className="text-gray-400 text-[10px]">
                Même avec accès total au serveur, l'attaquant ne peut pas lire les messages E2EE.
                Il voit uniquement les métadonnées (qui, quand, taille) — jamais le contenu.
              </p>
            </div>
          </div>
        )}

        {/* Logs */}
        {activeTab === 'logs' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400">
                {interceptLogs.length === 0 ? 'Aucun message intercepté' : `${interceptLogs.length} intercepté(s) — contenu illisible`}
              </p>
              {interceptLogs.length > 0 && (
                <button onClick={clearLogs} className="text-[10px] text-gray-500 hover:text-gray-300">🗑 Vider</button>
              )}
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {interceptLogs.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 text-sm">{mitmActive ? '⏳ En attente de messages...' : '▶ Lancez l\'attaque pour voir les logs'}</p>
                </div>
              ) : (
                interceptLogs.map((log, i) => <InterceptCard key={log.id} log={log} index={i} />)
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* Explication */}
        {activeTab === 'explain' && (
          <div className="space-y-3 text-[11px]">
            <div className="bg-gray-900 rounded-lg p-3">
              <p className="text-white font-bold mb-2">🔍 Qu'est-ce qu'une attaque MITM ?</p>
              <p className="text-gray-400">L'attaquant se positionne entre Alice et Bob. Il intercepte tous les messages qui passent par le serveur.</p>
            </div>
            <div className="bg-green-950/30 border border-green-500/20 rounded-lg p-3">
              <p className="text-green-400 font-bold mb-2">✅ Pourquoi E2EE résiste</p>
              <div className="space-y-1 text-gray-400">
                <p>• Les clés privées ne quittent jamais les appareils clients</p>
                <p>• Le serveur ne reçoit que des données chiffrées opaques</p>
                <p>• Sealed Sender masque l'identité de l'expéditeur</p>
                <p>• Double Ratchet change les clés à chaque message</p>
              </div>
            </div>
            <div className="bg-yellow-950/30 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-yellow-400 font-bold mb-2">👁️ Ce que l'attaquant VOIT quand même</p>
              <div className="space-y-1 text-gray-400">
                <p>• Qui communique avec qui (graphe social)</p>
                <p>• Quand les messages sont envoyés (timing)</p>
                <p>• La taille approximative des messages</p>
              </div>
            </div>
            <div className="bg-red-950/30 border border-red-500/20 rounded-lg p-3">
              <p className="text-red-400 font-bold mb-2">❌ Ce que l'attaquant NE PEUT PAS</p>
              <div className="space-y-1 text-gray-400">
                <p>• Lire le contenu des messages</p>
                <p>• Injecter de faux messages (certificats requis)</p>
                <p>• Compromettre les messages passés (PFS)</p>
                <p>• Identifier l'expéditeur (Sealed Sender)</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export { InterceptCard,MITMPanel };