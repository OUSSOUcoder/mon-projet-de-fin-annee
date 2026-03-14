// ─── LoginScreen.jsx ──────────────────────────────────────────
// Écran de connexion : saisie Room ID + Pseudo, statut serveur,
// toggle son et badges protocoles.

import { ToastContainer } from './ToastContainer';
import { HexGrid, ProtoBadge, CyberInput, SoundToggle, LoginStyles } from './DesignSystem';

const PROTOCOLS = [
  { icon: '🔒', label: 'E2EE',          color: '#3b82f6' },
  { icon: '🔄', label: 'Double Ratchet', color: '#8b5cf6' },
  { icon: '📨', label: 'Sealed Sender',  color: '#06b6d4' },
  { icon: '🗝️', label: 'X3DH',           color: '#f59e0b' },
  { icon: '👥', label: 'Sender Key',     color: '#10b981' },
];

export function LoginScreen({
  // socket state
  connected,
  // form state
  roomId, setRoomId,
  username, setUsername,
  password, setPassword,
  soundEnabled, setSoundEnabled,
  // action
  joinRoom,
  // toasts
  toasts, removeToast,
}) {
  const canJoin = connected && roomId.trim() && username.trim() && password.trim();

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <LoginStyles />
      <div className="scan-line-login" />

      {/* ── Full-page container ── */}
      <div style={{
        minHeight: '100vh',
        background: '#080c14',
        fontFamily: "'Sora', system-ui, sans-serif",
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, position: 'relative', overflow: 'hidden',
      }}>
        <HexGrid />

        {/* Ambient orbs */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {[
            { top: '10%', left: '15%', w: 500, color: 'rgba(59,130,246,.14)',  delay: '0s'  },
            { bottom: '10%', right: '10%', w: 420, color: 'rgba(139,92,246,.1)', delay: '3s'  },
            { top: '50%',  left: '50%',  w: 300, color: 'rgba(6,182,212,.05)',  delay: '6s', center: true },
          ].map((o, i) => (
            <div key={i} style={{
              position: 'absolute',
              ...(o.center
                ? { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
                : { top: o.top, left: o.left, bottom: o.bottom, right: o.right }),
              width: o.w, height: o.w, borderRadius: '50%',
              background: `radial-gradient(circle, ${o.color} 0%, transparent 70%)`,
              animation: `breathe ${8 + i * 2}s ease-in-out ${o.delay} infinite`,
            }}/>
          ))}
        </div>

        {/* ── Card wrapper ── */}
        <div className="login-card" style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 10 }}>

          {/* Outer glow border */}
          <div style={{
            position: 'absolute', inset: -1, borderRadius: 24,
            background: 'linear-gradient(135deg, rgba(59,130,246,0.4) 0%, rgba(139,92,246,0.2) 50%, rgba(6,182,212,0.3) 100%)',
            filter: 'blur(1px)', zIndex: -1,
          }}/>

          {/* Card body */}
          <div style={{
            background: 'rgba(10,16,28,0.95)',
            borderRadius: 22, padding: '36px 36px 28px',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(59,130,246,0.2)',
            boxShadow: '0 40px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
            animation: 'glow 4s ease-in-out infinite',
          }}>

            {/* ── Card header ── */}
            <CardHeader />

            {/* ── Server status ── */}
            <ServerStatus connected={connected} />

            {/* ══ BLOC 1 : ID + Pseudo côte à côte ══ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 }}>
              <div className="login-field-1">
                <CyberInput
                  label="ID de la Room" icon="🏠"
                  placeholder="room-demo-2025"
                  value={roomId}
                  onChange={e => setRoomId(e.target.value)}
                />
              </div>
              <div className="login-field-2">
                <CyberInput
                  label="Pseudo" icon="👤"
                  placeholder="Alice, Bob…"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                />
              </div>
            </div>

            {/* ══ BLOC 1b : Mot de passe pleine largeur ══ */}
            <div className="login-field-3">
              <CyberInput
                label="Mot de passe" icon="🔑"
                type="password"
                placeholder="Mot de passe sécurisé"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && canJoin && joinRoom()}
                hint="🔐 AES-256 · PBKDF2 · 310 000 itérations"
              />
            </div>

            {/* ══ BLOC 2 : Bouton rejoindre + toggle son côte à côte ══ */}
            <div className="login-btn" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginBottom: 20, alignItems: 'stretch' }}>
              {/* Bouton rejoindre */}
              <button
                onClick={joinRoom}
                disabled={!canJoin}
                className="join-btn"
                style={{
                  padding: '14px',
                  background: canJoin
                    ? 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 50%, #1d4ed8 100%)'
                    : 'rgba(59,130,246,0.2)',
                  border: '1px solid rgba(59,130,246,0.5)',
                  borderRadius: 12, color: '#fff',
                  fontSize: '0.9rem', fontWeight: 700,
                  fontFamily: "'Sora', system-ui, sans-serif",
                  letterSpacing: '.03em',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  whiteSpace: 'nowrap',
                }}
              >
                <span>🔒</span>
                Rejoindre
                <span style={{ opacity: 0.7 }}>→</span>
              </button>

              {/* Toggle son compact */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0 14px',
                borderRadius: 12,
                background: 'rgba(148,163,184,0.04)',
                border: '1px solid rgba(148,163,184,0.1)',
                whiteSpace: 'nowrap',
              }}>
                <span style={{ fontSize: '1rem' }}>{soundEnabled ? '🔊' : '🔇'}</span>
                <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, cursor: 'pointer', flexShrink: 0 }}>
                  <input type="checkbox" checked={soundEnabled} onChange={e => setSoundEnabled(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }}/>
                  <span style={{
                    position: 'absolute', inset: 0,
                    background: soundEnabled ? 'rgba(59,130,246,0.8)' : 'rgba(51,65,85,0.8)',
                    borderRadius: 10,
                    border: `1px solid ${soundEnabled ? 'rgba(59,130,246,0.5)' : 'rgba(148,163,184,0.15)'}`,
                    transition: 'all .3s',
                  }}>
                    <span style={{
                      position: 'absolute',
                      top: 2, left: soundEnabled ? 18 : 2,
                      width: 14, height: 14, borderRadius: '50%',
                      background: soundEnabled ? '#fff' : '#64748b',
                      transition: 'left .3s',
                      boxShadow: soundEnabled ? '0 0 6px rgba(59,130,246,0.6)' : 'none',
                    }}/>
                  </span>
                </label>
              </div>
            </div>

            {/* ══ BLOC 3 : 5 badges protocoles sur une seule ligne ══ */}
            <div className="login-proto">
              <div className="mono" style={{
                fontSize: '0.62rem', color: '#1e293b',
                letterSpacing: '.14em', textTransform: 'uppercase',
                marginBottom: 10, textAlign: 'center',
              }}>
                Protocoles actifs
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {PROTOCOLS.map(p => (
                  <div key={p.label} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '7px 4px', borderRadius: 10,
                    background: `${p.color}10`, border: `1px solid ${p.color}30`,
                    textAlign: 'center',
                  }}>
                    <span style={{ fontSize: 16 }}>{p.icon}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: p.color,
                      fontFamily: "'Space Mono', monospace",
                      letterSpacing: '.03em', lineHeight: 1.2,
                    }}>
                      {p.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom credit */}
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <span className="mono" style={{ fontSize: '0.62rem', color: '#0f172a', letterSpacing: '.1em' }}>
              DIYE OUSMANE · UNIVERSITÉ NORBERT ZONGO · 2024-2025
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function CardHeader() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      {/* Rotating rings + globe icon */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, position: 'relative' }}>
        <svg width="90" height="90" viewBox="0 0 90 90" style={{ position: 'absolute' }}>
          <circle cx="45" cy="45" r="40" fill="none" stroke="rgba(59,130,246,0.12)" strokeWidth="1"/>
          <circle cx="45" cy="45" r="40" fill="none" stroke="rgba(59,130,246,0.5)" strokeWidth="1.5"
            strokeDasharray="40 212" strokeLinecap="round"
            style={{ transformOrigin: 'center', animation: 'rotateSlow 8s linear infinite' }}/>
          <circle cx="45" cy="45" r="32" fill="none" stroke="rgba(139,92,246,0.25)" strokeWidth="1"
            strokeDasharray="20 181" strokeLinecap="round"
            style={{ transformOrigin: 'center', animation: 'rotateSlow 12s linear infinite reverse' }}/>
        </svg>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'rgba(59,130,246,0.1)',
          border: '1px solid rgba(59,130,246,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.8rem', position: 'relative', zIndex: 2,
        }}>
          🌐
        </div>
      </div>

      {/* Academic tag */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14,
        padding: '5px 14px', borderRadius: 100,
        border: '1px solid rgba(59,130,246,0.3)',
        background: 'rgba(59,130,246,0.07)',
      }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '.12em', color: '#60a5fa', textTransform: 'uppercase' }}>
          Projet Tutoré · L3 Info · UNZ
        </span>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#22c55e', boxShadow: '0 0 7px #22c55e',
          animation: 'connectPulse 2s infinite',
        }}/>
      </div>

      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f1f5f9', margin: '0 0 6px', letterSpacing: '-.02em', lineHeight: 1.2 }}>
        Simulation Multi-Utilisateurs
      </h1>
      <p className="mono" style={{ fontSize: '0.65rem', color: '#334155', letterSpacing: '.1em', margin: 0 }}>
        E2EE · DOUBLE RATCHET · SEALED SENDER · X3DH
      </p>
    </div>
  );
}

function ServerStatus({ connected }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderRadius: 10,
      background:  connected ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
      border: `1px solid ${connected ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
      marginBottom: 24,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background:  connected ? '#22c55e' : '#ef4444',
        boxShadow: `0 0 8px ${connected ? '#22c55e' : '#ef4444'}`,
        animation: connected ? 'connectPulse 2s infinite' : 'none',
      }}/>
      <span className="mono" style={{ fontSize: '0.7rem', color: connected ? '#4ade80' : '#f87171', letterSpacing: '.06em' }}>
        {connected ? 'SERVEUR CONNECTÉ' : 'SERVEUR DÉCONNECTÉ'}
      </span>
      {connected && (
        <span className="mono" style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#1e293b' }}>
          WebSocket · TLS
        </span>
      )}
    </div>
  );
}