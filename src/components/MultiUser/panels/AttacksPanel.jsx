// ─── AttacksPanel.jsx ─────────────────────────────────────────
// Panneau d'attaques détectées (MITM, etc.)

export function AttacksPanel({ attacks }) {
  if (!attacks.length) return null;

  return (
    <div className="max-w-7xl mx-auto mt-6">
      <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-6">
        <h2 className="text-xl font-bold mb-4 text-red-400">
          ⚠ Attaques détectées ({attacks.length})
        </h2>
        <div className="space-y-2">
          {attacks.map(attack => (
            <div
              key={attack.id}
              className="bg-red-900/50 p-3 rounded-lg flex items-center justify-between"
            >
              <div>
                <span className="font-semibold">{attack.type}</span>
                <span className="text-gray-400 text-sm ml-2">→ Cible: {attack.target}</span>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${attack.status === 'active' ? 'bg-red-500' : 'bg-gray-500'}`}>
                {attack.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
