// ─── ProtocolBadges.jsx ───────────────────────────────────────
// Ligne de 5 badges affichant les protocoles actifs dans la session

export function ProtocolBadges({ otpkCount }) {
  const protocols = [
    { icon: '🔒', title: 'E2EE',          sub: 'RSA-OAEP + AES-256-GCM',  color: 'blue'   },
    { icon: '🔄', title: 'Double Ratchet', sub: 'Clé unique par message',  color: 'purple' },
    { icon: '👤', title: 'Sealed Sender',  sub: 'Expéditeur masqué',       color: 'green'  },
    { icon: '🗝️', title: 'X3DH',           sub: `${otpkCount} PreKeys`,    color: 'yellow' },
    { icon: '👥', title: 'Sender Key',     sub: 'Groupes — O(1)',          color: 'teal'   },
  ];

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      {protocols.map(p => (
        <div
          key={p.title}
          className={`bg-${p.color}-900/30 border-2 border-${p.color}-500/50 rounded-xl p-3 flex items-center gap-3`}
        >
          <span className="text-2xl">{p.icon}</span>
          <div>
            <p className={`font-bold text-${p.color}-400 text-sm`}>{p.title}</p>
            <p className="text-[10px] text-gray-400">{p.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
