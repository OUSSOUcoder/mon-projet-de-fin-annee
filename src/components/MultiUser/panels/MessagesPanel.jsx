// ─── MessagesPanel.jsx ────────────────────────────────────────
// Colonne centrale : liste des messages chiffrés + zone de saisie

import { TypingIndicator } from '../ui/TypingIndicator';
import { MessageKeyBadge } from '../Messages/MessageKeyBadge';
import { ReadReceipt } from '../Messages/ReadReceipt';

export function MessagesPanel({
  messages, username, decryptedMessages, messageKeys,
  readReceipts, currentDecrypting,
  hasMoreMessages, loadMoreMessages,
  typingUsers, selectedUser, messageText,
  getUserSessionStatus, showDecryptPanel,
  messagesContainerRef, messagesEndRef,
  handleTyping, sendMessage, handleDecrypt,
  setShowDecryptPanel,
}) {
  return (
    <div className={`bg-gray-800 rounded-xl p-6 border border-gray-700 ${showDecryptPanel ? 'lg:col-span-1' : 'lg:col-span-2'}`}>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">💬 Messages chiffrés ({messages.length})</h2>
        {Object.keys(decryptedMessages).length > 0 && (
          <button
            onClick={() => setShowDecryptPanel(!showDecryptPanel)}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm"
          >
            {showDecryptPanel ? '👁 Masquer' : '🔓 Déchiffrés'}
          </button>
        )}
      </div>

      {/* Message list */}
      <div
        ref={messagesContainerRef}
        className="h-96 overflow-y-auto bg-gray-900 rounded-lg p-4 mb-4 space-y-3"
      >
        {hasMoreMessages && (
          <button onClick={loadMoreMessages} className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
            ⬆ Charger plus
          </button>
        )}

        {messages.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Aucun message…</p>
        ) : (
          messages.map(msg => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              username={username}
              isDecrypted={!!decryptedMessages[msg.id]}
              decryptedData={decryptedMessages[msg.id]}
              msgKey={messageKeys[msg.id]}
              readReceipt={readReceipts[msg.id] || 'sent'}
              isDecrypting={currentDecrypting === msg.id}
              onDecrypt={() => handleDecrypt(msg)}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="mb-2">
          <TypingIndicator users={typingUsers} />
        </div>
      )}

      {/* Input zone */}
      <InputZone
        selectedUser={selectedUser}
        username={username}
        messageText={messageText}
        sessionStatus={selectedUser ? getUserSessionStatus(selectedUser) : 'none'}
        handleTyping={handleTyping}
        sendMessage={sendMessage}
      />
    </div>
  );
}

// ── Single message bubble ─────────────────────────────────────
function MessageBubble({ msg, username, isDecrypted, decryptedData, msgKey, readReceipt, isDecrypting, onDecrypt }) {
  const isFromMe = msg.from === username;
  const isToMe   = msg.to   === username;

  return (
    <div className={`p-3 rounded-lg transition-all ${
      isFromMe ? 'bg-blue-600 ml-auto max-w-md'
      : isToMe ? 'bg-green-600 mr-auto max-w-md'
      :           'bg-gray-700'
    } ${isDecrypted ? 'ring-2 ring-purple-400' : ''}`}>

      {/* Row: sender info + timestamp */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold flex items-center gap-2 flex-wrap">
          {msg.from} → {msg.to}
          {isDecrypted && (
            <span className="bg-purple-500/30 border border-purple-400/50 text-purple-200 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              ✓ déchiffré
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-300">{new Date(msg.timestamp).toLocaleTimeString()}</span>
          {isFromMe && <ReadReceipt status={readReceipt} />}
        </div>
      </div>

      {/* Ciphertext preview */}
      <div className="bg-black/30 p-2 rounded font-mono text-xs mb-2 overflow-x-auto">
        {msg.sealed ? (
          <div className="space-y-1">
            <p className="text-purple-400 font-bold">🔐 [SEALED SENDER]</p>
            <p className="text-gray-500">Expéditeur : <span className="text-red-400">??? (masqué)</span></p>
            <p className="text-[9px] text-purple-300">ℹ️ Le serveur ne voit pas l'expéditeur</p>
          </div>
        ) : (
          msg.encryptedData?.ciphertext
            ? `${msg.encryptedData.ciphertext.substring(0, 60)}…`
            : '[message]'
        )}
      </div>

      {/* Key badge + plaintext */}
      {isDecrypted && msgKey    && <div className="mb-2"><MessageKeyBadge keyInfo={msgKey} /></div>}
      {isDecrypted && decryptedData && (
        <div className="mb-2 bg-white/10 px-2 py-1 rounded text-xs text-green-200 border-l-2 border-green-400">
          💬 <span className="italic">{decryptedData.plaintext}</span>
        </div>
      )}

      {/* Decrypt button (only for received messages) */}
      {isToMe && (
        <button
          onClick={onDecrypt}
          disabled={isDecrypting}
          className={`text-xs px-3 py-1 rounded disabled:opacity-50 flex items-center gap-1 transition-all ${
            isDecrypted
              ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/30'
              : 'bg-white/20 hover:bg-white/30'
          }`}
        >
          {isDecrypting ? '⏳ Déchiffrement…' : isDecrypted ? '🔄 Re-déchiffrer' : '🔓 Déchiffrer'}
        </button>
      )}
    </div>
  );
}

// ── Message input zone ────────────────────────────────────────
function InputZone({ selectedUser, username, messageText, sessionStatus, handleTyping, sendMessage }) {
  if (!selectedUser) {
    return (
      <div className="p-4 bg-gray-700 border border-gray-600 rounded-lg text-center">
        <p className="text-gray-400">👈 Sélectionnez un participant pour commencer</p>
      </div>
    );
  }

  if (selectedUser.username === username) {
    return (
      <div className="p-4 bg-yellow-900/30 border border-yellow-600/50 rounded-lg">
        <p className="text-yellow-300 text-sm">⚠ Sélectionnez un autre participant.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          placeholder={`Message pour ${selectedUser.username}…`}
          value={messageText}
          onChange={handleTyping}
          onKeyPress={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          className="flex-1 px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={sendMessage}
          disabled={!messageText.trim()}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <span>🔒</span><span>Envoyer</span>
        </button>
      </div>

      <p className="text-xs text-gray-400">
        Destinataire : <strong className="text-blue-400">{selectedUser.username}</strong>
        {' · '}
        {sessionStatus === 'established' ? <span className="text-green-400">🔒 Session établie — E2EE actif</span>
          : sessionStatus === 'pending'  ? <span className="text-yellow-400">⏳ Session en cours…</span>
          :                                <span className="text-gray-500">⚪ Session sera créée au 1er message</span>}
      </p>
    </div>
  );
}
