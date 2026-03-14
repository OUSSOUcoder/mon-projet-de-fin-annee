// ─── ParticipantsPanel.jsx ────────────────────────────────────
// Colonne gauche : liste des participants, sélection, bouton MITM

import { SessionBadge } from '../Messages/SessionBadge';
import { SafetyNumberBadge } from '../Messages/SafetyNumber';

export function ParticipantsPanel({
  users, username, selectedUser,
  getUserSessionStatus, verifiedContacts,
  handleSelectUser, launchAttack, setSafetyNumberTarget,
}) {
  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <h2 className="text-xl font-bold mb-4 flex items-center justify-between">
        <span>👥 Participants ({users.length})</span>
        {selectedUser && (
          <span className="text-xs bg-blue-600 px-2 py-1 rounded">
            {selectedUser.username}
          </span>
        )}
      </h2>

      <div className="mb-4 p-3 bg-blue-900/30 border border-blue-600/50 rounded-lg text-sm">
        <p className="text-blue-300">
          💡 <strong>Cliquez</strong> sur un participant pour lui envoyer un message
        </p>
      </div>

      <div className="space-y-2">
        {users.map(user => (
          <UserCard
            key={user.id}
            user={user}
            isMe={user.username === username}
            isSelected={selectedUser?.id === user.id}
            sessionStatus={getUserSessionStatus(user)}
            verified={verifiedContacts.has(user.id)}
            onSelect={() => handleSelectUser(user)}
            onMITM={e => { e.stopPropagation(); launchAttack('MITM', user.username); }}
            onVerify={e => { e.stopPropagation(); setSafetyNumberTarget(user); }}
          />
        ))}
      </div>

      {users.length === 1 && (
        <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-600/50 rounded-lg text-sm">
          <p className="text-yellow-300">
            ⚠ Vous êtes seul ! Ouvrez un nouvel onglet avec le même Room ID.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Single user card ──────────────────────────────────────────
function UserCard({ user, isMe, isSelected, sessionStatus, verified, onSelect, onMITM, onVerify }) {
  return (
    <div
      onClick={onSelect}
      className={`relative p-4 rounded-lg transition-all ${
        isSelected
          ? 'bg-blue-600 border-2 border-blue-400 shadow-lg scale-105 cursor-pointer'
          : isMe
          ? 'bg-green-600/20 border border-green-600/50 cursor-not-allowed'
          : 'bg-gray-700 hover:bg-gray-600 cursor-pointer'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-lg flex items-center gap-2 flex-wrap">
            {isSelected && <span>👉</span>}
            {user.username}
            {isMe && <span className="text-xs bg-green-600 px-2 py-0.5 rounded">(Vous)</span>}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">ID: {user.id.substring(0, 8)}…</p>

          {!isMe && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <SessionBadge status={sessionStatus} />
              <SafetyNumberBadge verified={verified} onClick={onVerify} />
            </div>
          )}
        </div>

        {!isMe && (
          <button
            onClick={onMITM}
            className="ml-2 flex-shrink-0 px-3 py-1 bg-red-500 hover:bg-red-600 rounded text-xs font-semibold"
          >
            ⚠ MITM
          </button>
        )}
      </div>
    </div>
  );
}
