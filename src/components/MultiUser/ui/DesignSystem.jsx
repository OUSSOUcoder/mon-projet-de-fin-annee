// ─── DesignSystem.jsx ─────────────────────────────────────────
// Composants visuels partagés : icônes SVG, grille hex, badges, inputs

// ── Hex grid background ───────────────────────────────────────
export const HexGrid = () => (
  <svg
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.04 }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <pattern id="hexlogin" x="0" y="0" width="50" height="88" patternUnits="userSpaceOnUse">
        <polygon points="25,2 48,14 48,38 25,50 2,38 2,14" fill="none" stroke="white" strokeWidth="0.7"/>
        <polygon points="25,46 48,58 48,82 25,94 2,82 2,58"  fill="none" stroke="white" strokeWidth="0.7"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#hexlogin)"/>
  </svg>
);

// ── Protocol badge pill ───────────────────────────────────────
export const ProtoBadge = ({ icon, label, color }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', borderRadius: 20,
    background: `${color}12`, border: `1px solid ${color}35`,
    fontSize: 11, fontWeight: 600, color,
    fontFamily: "'Space Mono', monospace",
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  }}>
    <span style={{ fontSize: 13 }}>{icon}</span>
    {label}
  </div>
);

// ── Cyber text input ──────────────────────────────────────────
export const CyberInput = ({
  label, hint, type = 'text',
  placeholder, value, onChange, onKeyPress, icon,
}) => (
  <div style={{ marginBottom: 20 }}>
    <label style={{
      display: 'block', marginBottom: 7,
      fontSize: '0.78rem', fontWeight: 600,
      color: '#94a3b8', letterSpacing: '0.06em',
      textTransform: 'uppercase',
      fontFamily: "'Space Mono', monospace",
    }}>
      {icon && <span style={{ marginRight: 6 }}>{icon}</span>}
      {label}
    </label>
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onKeyPress={onKeyPress}
      style={{
        width: '100%', padding: '13px 16px',
        background: 'rgba(15,23,42,0.8)',
        border: '1px solid rgba(148,163,184,0.15)',
        borderRadius: 10,
        color: '#f1f5f9',
        fontSize: '0.9rem',
        fontFamily: "'Sora', system-ui, sans-serif",
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
      onFocus={e => {
        e.target.style.borderColor = 'rgba(59,130,246,0.6)';
        e.target.style.boxShadow   = '0 0 0 3px rgba(59,130,246,0.1)';
      }}
      onBlur={e => {
        e.target.style.borderColor = 'rgba(148,163,184,0.15)';
        e.target.style.boxShadow   = 'none';
      }}
    />
    {hint && (
      <p style={{
        marginTop: 5, fontSize: '0.7rem', color: '#334155',
        fontFamily: "'Space Mono', monospace", letterSpacing: '0.03em',
      }}>
        {hint}
      </p>
    )}
  </div>
);

// ── Sound toggle switch ───────────────────────────────────────
export const SoundToggle = ({ soundEnabled, setSoundEnabled }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', borderRadius: 10,
    background: 'rgba(148,163,184,0.04)',
    border: '1px solid rgba(148,163,184,0.1)',
    marginBottom: 24,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: '1rem' }}>{soundEnabled ? '🔊' : '🔇'}</span>
      <span style={{
        fontSize: '0.7rem', color: '#64748b', letterSpacing: '.06em',
        fontFamily: "'Space Mono', monospace",
      }}>
        SONS {soundEnabled ? 'ACTIVÉS' : 'DÉSACTIVÉS'}
      </span>
    </div>
    <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={soundEnabled}
        onChange={e => setSoundEnabled(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0 }}
      />
      <span style={{
        position: 'absolute', inset: 0,
        background: soundEnabled ? 'rgba(59,130,246,0.8)' : 'rgba(51,65,85,0.8)',
        borderRadius: 11,
        border: `1px solid ${soundEnabled ? 'rgba(59,130,246,0.5)' : 'rgba(148,163,184,0.15)'}`,
        transition: 'all .3s',
      }}>
        <span style={{
          position: 'absolute',
          top: 2, left: soundEnabled ? 20 : 2,
          width: 16, height: 16, borderRadius: '50%',
          background: soundEnabled ? '#fff' : '#64748b',
          transition: 'left .3s',
          boxShadow: soundEnabled ? '0 0 8px rgba(59,130,246,0.6)' : 'none',
        }}/>
      </span>
    </label>
  </div>
);

// ── Global CSS injected once ──────────────────────────────────
export const LoginStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=Space+Mono:wght@400;700&display=swap');
    * { box-sizing: border-box; }
    .mono { font-family: 'Space Mono', monospace !important; }

    @keyframes breathe      { 0%,100%{opacity:.07;transform:scale(1)}   50%{opacity:.16;transform:scale(1.12)} }
    @keyframes fadeUp       { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)}  }
    @keyframes scan         { from{transform:translateY(-100%)}          to{transform:translateY(100vh)}         }
    @keyframes rotateSlow   { from{transform:rotate(0deg)}               to{transform:rotate(360deg)}            }
    @keyframes glow         { 0%,100%{box-shadow:0 0 20px rgba(59,130,246,0.2)} 50%{box-shadow:0 0 40px rgba(59,130,246,0.45)} }
    @keyframes connectPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

    .login-card    { animation: fadeUp .8s ease-out .10s both; }
    .login-proto   { animation: fadeUp .6s ease-out .60s both; }
    .login-field-1 { animation: fadeUp .6s ease-out .20s both; }
    .login-field-2 { animation: fadeUp .6s ease-out .32s both; }
    .login-btn     { animation: fadeUp .6s ease-out .44s both; }

    .scan-line-login {
      position: fixed; top: 0; left: 0; right: 0; height: 1px;
      background: linear-gradient(90deg, transparent, rgba(59,130,246,.5), transparent);
      animation: scan 7s linear infinite;
      pointer-events: none; z-index: 99;
    }

    .join-btn { transition: all .3s cubic-bezier(.34,1.56,.64,1); }
    .join-btn:hover:not(:disabled) {
      transform: translateY(-2px) scale(1.02);
      box-shadow: 0 0 40px rgba(59,130,246,0.45), 0 12px 30px rgba(0,0,0,0.4);
    }
    .join-btn:disabled { opacity: 0.45; cursor: not-allowed; }

    ::placeholder { color: #334155 !important; }
    input:-webkit-autofill {
      -webkit-box-shadow: 0 0 0 30px #0f172a inset !important;
      -webkit-text-fill-color: #f1f5f9 !important;
    }
  `}</style>
);
