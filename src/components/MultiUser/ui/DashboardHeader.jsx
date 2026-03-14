// ─── DashboardHeader.jsx ──────────────────────────────────────
// Barre supérieure du tableau de bord : room info, boutons d'action

export function DashboardHeader({
  roomId, username, users, otpkCount, myFingerprint,
  soundEnabled, setSoundEnabled,
  showMITMPanel, setShowMITMPanel, mitmActive,
  showGroupPanel, setShowGroupPanel,
  unreadCount,
}) {
  return (
    <div className="max-w-7xl mx-auto mb-6">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-3">

          {/* Left: room info */}
          <div>
            <h1 className="text-2xl font-bold mb-1">
              🌐 Simulation Collaborative — Room: {roomId}
            </h1>
            <p className="text-blue-100 text-sm">
              Connecté en tant que <strong>{username}</strong> · {users.length} participant(s)
              {otpkCount > 0 && <span className="ml-2 text-blue-200">· 🔑 {otpkCount} PreKeys</span>}
              {myFingerprint && (
                <span className="ml-2 text-blue-200/70 text-xs font-mono">
                  · {myFingerprint.substring(0, 17)}…
                </span>
              )}
            </p>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold transition-all"
            >
              {soundEnabled ? '🔊 Son ON' : '🔇 Son OFF'}
            </button>

            <button
              onClick={() => setShowMITMPanel(!showMITMPanel)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                mitmActive
                  ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                  : showMITMPanel
                  ? 'bg-red-700 hover:bg-red-800'
                  : 'bg-red-900/40 hover:bg-red-900/60 border border-red-500/50'
              }`}
            >
              {mitmActive ? '🕵️ MITM ACTIF' : '🕵️ MITM'}
            </button>

            <button
              onClick={() => setShowGroupPanel(!showGroupPanel)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                showGroupPanel
                  ? 'bg-teal-700 hover:bg-teal-800'
                  : 'bg-teal-900/40 hover:bg-teal-900/60 border border-teal-500/50'
              }`}
            >
              👥 Groupes
            </button>

            {unreadCount > 0 && (
              <div className="px-4 py-2 bg-red-500 rounded-lg text-sm font-bold animate-pulse">
                {unreadCount} nouveau(x)
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
