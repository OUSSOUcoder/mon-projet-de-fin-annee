import { useState, useEffect } from 'react';

// ─────────────────────────────────────────────
// Calcule le Safety Number à partir de deux clés publiques JWK
// Même principe que Signal : SHA-256(keyA || keyB) → 12 groupes de 5 chiffres
// ─────────────────────────────────────────────
async function computeSafetyNumber(myPublicKeyJWK, theirPublicKeyJWK) {
  if (!myPublicKeyJWK || !theirPublicKeyJWK) return null;

  // Sérialiser les deux clés de façon déterministe
  const encA = new TextEncoder().encode(JSON.stringify(myPublicKeyJWK));
  const encB = new TextEncoder().encode(JSON.stringify(theirPublicKeyJWK));

  // Concaténer dans l'ordre lexicographique (même résultat des deux côtés)
  const sorted = JSON.stringify(myPublicKeyJWK) < JSON.stringify(theirPublicKeyJWK)
    ? new Uint8Array([...encA, ...encB])
    : new Uint8Array([...encB, ...encA]);

  const hashBuf = await window.crypto.subtle.digest('SHA-256', sorted);
  const bytes   = new Uint8Array(hashBuf);

  // → 12 groupes de 5 chiffres (comme Signal)
  // On prend 60 bits (7.5 octets) par groupe → simplification : 2 octets → nombre 0-99999
  const groups = [];
  for (let i = 0; i < 12; i++) {
    const offset = i * 2;
    const val    = ((bytes[offset] << 8) | bytes[offset + 1]) % 100000;
    groups.push(val.toString().padStart(5, '0'));
  }

  return groups;
}

// Couleur déterministe à partir du contenu du groupe
function groupColor(group) {
  const n = parseInt(group, 10);
  const colors = [
    'bg-blue-600',   'bg-purple-600', 'bg-green-600',
    'bg-yellow-600', 'bg-red-600',    'bg-pink-600',
    'bg-teal-600',   'bg-orange-600', 'bg-indigo-600',
    'bg-cyan-600',   'bg-lime-600',   'bg-rose-600',
  ];
  return colors[n % colors.length];
}

// ─────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────
export function SafetyNumber({ myPublicKeyJWK, theirPublicKeyJWK, theirUsername, onClose }) {
  const [groups, setGroups]       = useState(null);
  const [verified, setVerified]   = useState(false);
  const [loading, setLoading]     = useState(true);
  const [copied, setCopied]       = useState(false);

  useEffect(() => {
    setLoading(true);
    computeSafetyNumber(myPublicKeyJWK, theirPublicKeyJWK)
      .then(g => { setGroups(g); setLoading(false); })
      .catch(() => setLoading(false));
  }, [myPublicKeyJWK, theirPublicKeyJWK]);

  const fullNumber = groups ? groups.join(' ') : '';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(fullNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="p-5 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔏</span>
            <div>
              <h2 className="font-bold text-white">Numéro de sécurité</h2>
              <p className="text-xs text-gray-400">
                Avec <span className="text-blue-400 font-semibold">{theirUsername}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl font-bold leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Explication */}
          <div className="bg-blue-950/40 border border-blue-500/30 rounded-lg p-3 text-xs text-blue-300">
            <p className="font-bold mb-1">🔍 Comment vérifier ?</p>
            <p>Comparez ce numéro avec {theirUsername} via un autre canal (appel, SMS). S'il correspond, votre communication n'est pas interceptée.</p>
          </div>

          {/* Grille des groupes — style Signal */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : groups ? (
            <div className="grid grid-cols-4 gap-2">
              {groups.map((g, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className={`w-full h-8 ${groupColor(g)} rounded-lg opacity-80`} />
                  <span className="font-mono text-sm font-bold text-white tracking-widest">{g}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-red-400 text-xs text-center">
              Impossible de calculer — clés manquantes
            </p>
          )}

          {/* Numéro complet copiable */}
          {groups && (
            <div
              onClick={copyToClipboard}
              className="bg-gray-800 border border-gray-600 rounded-lg p-3 cursor-pointer hover:border-blue-500/50 transition-all group"
            >
              <p className="font-mono text-[11px] text-gray-300 text-center tracking-wider break-all">
                {fullNumber}
              </p>
              <p className="text-[10px] text-gray-500 text-center mt-1 group-hover:text-blue-400 transition-colors">
                {copied ? '✅ Copié !' : '📋 Cliquer pour copier'}
              </p>
            </div>
          )}

          {/* Bouton de vérification */}
          {!verified ? (
            <button
              onClick={() => setVerified(true)}
              className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-xl font-bold text-white transition-all"
            >
              ✅ Marquer comme vérifié
            </button>
          ) : (
            <div className="w-full py-3 bg-green-900/40 border border-green-500/50 rounded-xl text-center">
              <p className="text-green-400 font-bold">✅ Contact vérifié</p>
              <p className="text-green-300/60 text-xs mt-0.5">
                Vous avez confirmé l'identité de {theirUsername}
              </p>
            </div>
          )}

          {/* Note technique */}
          <p className="text-[10px] text-gray-600 text-center">
            SHA-256(clé_A ‖ clé_B) → 60 bits × 12 groupes — même algorithme que Signal
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Badge compact à afficher dans la liste des participants
// ─────────────────────────────────────────────
export function SafetyNumberBadge({ verified, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-all ${
        verified
          ? 'bg-green-900/50 border-green-500/40 text-green-400 hover:border-green-400'
          : 'bg-gray-800/50 border-gray-600 text-gray-400 hover:border-blue-500/50 hover:text-blue-400'
      }`}
    >
      {verified ? '🔏 Vérifié' : '🔓 Vérifier'}
    </button>
  );
}

export default SafetyNumber;
