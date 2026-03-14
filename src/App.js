import React, { useState, useEffect } from 'react';
import MultiUserSimulation from './components/MultiUserSimulation';
import NetworkTopology from './components/NetworkTopology';

// ─── SVG Icons ────────────────────────────────────────────────
const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{width:'100%',height:'100%'}}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{width:'100%',height:'100%'}}>
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

const SignalIcon = () => (
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.2" style={{width:'100%',height:'100%'}}>
    <circle cx="16" cy="16" r="13"/>
    <circle cx="16" cy="16" r="7"/>
    <circle cx="16" cy="16" r="2.4" fill="currentColor" stroke="none"/>
  </svg>
);

const HexGrid = () => (
  <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0.035}} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="hex" x="0" y="0" width="56" height="100" patternUnits="userSpaceOnUse">
        <polygon points="28,2 54,16 54,44 28,58 2,44 2,16" fill="none" stroke="white" strokeWidth="0.8"/>
        <polygon points="28,52 54,66 54,94 28,108 2,94 2,66" fill="none" stroke="white" strokeWidth="0.8"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#hex)"/>
  </svg>
);

function App() {
  const [currentSimulation, setCurrentSimulation] = useState(null);
  const [isLoading, setIsLoading]   = useState(true);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [mounted, setMounted]       = useState(false);

  useEffect(() => {
    setTimeout(() => { setIsLoading(false); setMounted(true); }, 900);
  }, []);

  const simulations = [
    {
      id: 'multi-user',
      title: 'Mode Multi-Utilisateurs',
      description: 'Communication E2EE temps réel. Double Ratchet, Sealed Sender et X3DH entre participants simultanés.',
      icon: '🌐',
      component: MultiUserSimulation,
      badge: 'Complet',
      stats: '∞ utilisateurs',
      tags: ['E2EE', 'Double Ratchet', 'Sealed Sender'],
      accent: '#3b82f6',
    },
    {
      id: 'network',
      title: 'Topologie Réseau',
      description: 'Visualisation étape par étape du chemin réseau d\'un message chiffré à travers l\'infrastructure.',
      icon: '🕸️',
      component: NetworkTopology,
      stats: 'Infrastructure',
      tags: ['Réseau', 'Visualisation', 'Routage'],
      accent: '#a855f7',
    },
  ];

  const handleSimulationClick = (simId) => {
    setIsLoading(true);
    setTimeout(() => { setCurrentSimulation(simId); setIsLoading(false); }, 400);
  };

  if (currentSimulation) {
    const sim = simulations.find(s => s.id === currentSimulation);
    return (
      <div style={{ minHeight:'100vh', background:'#080c14', position:'relative' }}>
        <button
          onClick={() => { setIsLoading(true); setTimeout(() => { setCurrentSimulation(null); setIsLoading(false); }, 300); }}
          style={{ position:'fixed', top:20, left:20, zIndex:50, display:'flex', alignItems:'center', gap:10, padding:'12px 22px', background:'rgba(15,23,42,0.95)', border:'1px solid rgba(148,163,184,0.2)', borderRadius:12, color:'#e2e8f0', fontFamily:"'Sora',system-ui,sans-serif", fontWeight:600, fontSize:'0.9rem', backdropFilter:'blur(12px)', boxShadow:'0 0 20px rgba(59,130,246,0.12)', cursor:'pointer' }}
        >
          <span>←</span><span>Menu Principal</span>
        </button>
        <div style={{ opacity: isLoading ? 0 : 1, transition:'opacity 0.4s' }}>
          {sim && React.createElement(sim.component)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', background:'#080c14', fontFamily:"'Sora','DM Sans',system-ui,sans-serif", position:'relative', overflow:'hidden', color:'#f1f5f9' }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=Space+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box}
        .mono{font-family:'Space Mono',monospace!important}
        @keyframes breathe{0%,100%{opacity:.07;transform:scale(1)}50%{opacity:.15;transform:scale(1.1)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        @keyframes scan{from{transform:translateY(-100%)}to{transform:translateY(100vh)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes flicker{0%,89%,91%,95%,100%{opacity:1}90%{opacity:.5}93%{opacity:.7}}

        .fu1{animation:fadeUp .7s ease-out .1s both}
        .fu2{animation:fadeUp .7s ease-out .25s both}
        .fu3{animation:fadeUp .7s ease-out .4s both}
        .fu4{animation:fadeUp .7s ease-out .55s both}
        .fu5{animation:fadeUp .7s ease-out .7s both}
        .fu6{animation:fadeUp .7s ease-out .85s both}

        /* ── Compact card ── */
        .sim-card {
          transition: all .35s cubic-bezier(.34,1.56,.64,1);
          cursor: pointer;
        }
        .sim-card:hover {
          transform: translateY(-5px) scale(1.03);
        }

        .scan-line{position:fixed;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(59,130,246,.5),transparent);animation:scan 7s linear infinite;pointer-events:none;z-index:99}
        .app-glow{animation:flicker 10s infinite}
      `}</style>

      <div className="scan-line"/>
      <HexGrid/>

      {/* Ambient orbs */}
      <div style={{position:'absolute',inset:0,pointerEvents:'none',overflow:'hidden'}}>
        <div style={{position:'absolute',top:'5%',left:'8%',width:560,height:560,borderRadius:'50%',background:'radial-gradient(circle,rgba(59,130,246,.13) 0%,transparent 70%)',animation:'breathe 8s ease-in-out infinite'}}/>
        <div style={{position:'absolute',bottom:'8%',right:'5%',width:480,height:480,borderRadius:'50%',background:'radial-gradient(circle,rgba(168,85,247,.1) 0%,transparent 70%)',animation:'breathe 10s ease-in-out 3s infinite'}}/>
      </div>

      <div style={{maxWidth:900,margin:'0 auto',padding:'0 24px 80px',position:'relative',zIndex:10}}>

        {/* ═══ HERO ═══ */}
        <header style={{paddingTop:60,paddingBottom:52,textAlign:'center'}}>

          

          <div className="fu2" style={{marginBottom:18}}>
            <h1 className="app-glow" style={{fontSize:'clamp(1.8rem,4.5vw,3rem)',fontWeight:800,lineHeight:1.2,letterSpacing:'-.025em',color:'#f1f5f9',margin:'0 0 6px'}}>
              Analyse Comparative des Solutions de
            </h1>
            <h1 style={{fontSize:'clamp(1.8rem,4.5vw,3rem)',fontWeight:800,lineHeight:1.2,letterSpacing:'-.025em',background:'linear-gradient(130deg,#3b82f6 0%,#8b5cf6 50%,#06b6d4 100%)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text',margin:0}}>
              Sécurisation des Messageries
            </h1>
          </div>

          <p className="fu3" style={{fontSize:'1rem',color:'#64748b',fontWeight:300,marginBottom:44,letterSpacing:'.015em'}}>
            Plateforme interactive d'exploration cryptographique
          </p>

          {/* App trio */}
          <div className="fu4" style={{display:'flex',justifyContent:'center',marginBottom:48,flexWrap:'wrap'}}>
            {[
              {label:'WhatsApp',sub:'Meta · 2009',   color:'#25d366',tags:['E2EE','Backup','Meta'],  Icon:WhatsAppIcon, radius:'16px 0 0 16px', brRight:'none'},
              {label:'Telegram', sub:'Telegram · 2013',color:'#24a1de',tags:['MTProto','Cloud','Opt'],Icon:TelegramIcon,  radius:'0',            brRight:'none'},
              {label:'Signal',   sub:'Signal · 2014', color:'#3b82f6',tags:['E2EE','Open','PFS'],    Icon:SignalIcon,    radius:'0 16px 16px 0', brRight:null},
            ].map((app,i) => (
              <React.Fragment key={app.label}>
                {i > 0 && (
                  <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'0 13px',background:'rgba(15,23,42,.9)',border:'1px solid rgba(148,163,184,.1)',borderLeft:'none',borderRight:'none',zIndex:2}}>
                    <span className="mono" style={{fontSize:9,color:'#334155',fontWeight:700}}>VS</span>
                  </div>
                )}
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10,padding:'18px 26px',background:`${app.color}0d`,border:`1px solid ${app.color}35`,borderRight:app.brRight||`1px solid ${app.color}35`,borderRadius:app.radius,backdropFilter:'blur(8px)'}}>
                  <div style={{width:34,height:34,color:app.color}}><app.Icon/></div>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontWeight:700,fontSize:'.82rem',color:'#f1f5f9'}}>{app.label}</div>
                    <div className="mono" style={{fontSize:'.6rem',color:app.color,letterSpacing:'.08em'}}>{app.sub}</div>
                  </div>
                  <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'center'}}>
                    {app.tags.map(t=>(
                      <span key={t} style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:`${app.color}18`,color:app.color,border:`1px solid ${app.color}35`}}>{t}</span>
                    ))}
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* Key stats */}
          <div className="fu5" style={{display:'flex',justifyContent:'center',gap:36,flexWrap:'wrap'}}>
            {[
              {label:'Simulations',   value:'2',       color:'#3b82f6'},
              {label:'Apps analysées',value:'3',       color:'#8b5cf6'},
              {label:'Chiffrement',   value:'AES-256', color:'#10b981'},
              {label:'Open Source',   value:'100%',    color:'#f59e0b'},
            ].map(s=>(
              <div key={s.label} style={{textAlign:'center'}}>
                <div style={{fontSize:'1.6rem',fontWeight:800,color:s.color,lineHeight:1}}>{s.value}</div>
                <div className="mono" style={{fontSize:'.65rem',color:'#334155',marginTop:5,letterSpacing:'.07em',textTransform:'uppercase'}}>{s.label}</div>
              </div>
            ))}
          </div>
        </header>

        {/* Divider */}
        <div style={{height:1,background:'linear-gradient(90deg,transparent,rgba(59,130,246,.4),rgba(139,92,246,.4),transparent)',marginBottom:52}}/>

        {/* ═══ SECTION HEADER ═══ */}
        <div className="fu6" style={{display:'flex',alignItems:'center',gap:14,marginBottom:28}}>
          <div style={{width:44,height:44,borderRadius:12,background:'rgba(59,130,246,.12)',border:'1px solid rgba(59,130,246,.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.3rem',flexShrink:0}}>🚀</div>
          <div>
            <h2 style={{margin:0,fontSize:'1.2rem',fontWeight:700,color:'#f1f5f9',letterSpacing:'-.01em'}}>Choisissez votre simulation</h2>
            <p className="mono" style={{margin:'3px 0 0',fontSize:'.68rem',color:'#3b82f6',letterSpacing:'.1em'}}>EXPLOREZ LES PROTOCOLES DE SÉCURITÉ</p>
          </div>
          <div style={{flex:1,height:1,background:'linear-gradient(90deg,rgba(59,130,246,.25),transparent)',marginLeft:8}}/>
          <span className="mono" style={{fontSize:'.68rem',color:'#1e293b',letterSpacing:'.1em'}}>02 MODULES</span>
        </div>

        {/* ═══ CARDS — GRILLE 2 COLONNES ═══ */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 16,
          marginBottom: 64,
        }}>
          {simulations.map((sim, idx) => (
            <button
              key={sim.id}
              onClick={() => handleSimulationClick(sim.id)}
              onMouseEnter={() => setHoveredCard(sim.id)}
              onMouseLeave={() => setHoveredCard(null)}
              className="sim-card"
              style={{
                textAlign:'left',
                padding:'20px 22px',
                background: hoveredCard === sim.id
                  ? `linear-gradient(135deg,${sim.accent}14 0%,rgba(15,23,42,.98) 100%)`
                  : 'rgba(15,23,42,.88)',
                border:`1px solid ${hoveredCard === sim.id ? sim.accent+'55' : 'rgba(148,163,184,.1)'}`,
                borderRadius:14,
                backdropFilter:'blur(14px)',
                boxShadow: hoveredCard === sim.id
                  ? `0 0 40px ${sim.accent}1a, 0 16px 40px rgba(0,0,0,.45), inset 0 1px 0 ${sim.accent}20`
                  : '0 4px 20px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.04)',
                position:'relative', overflow:'hidden',
                animation: mounted ? `fadeUp .6s ease-out ${idx*.12}s both` : 'none',
              }}
            >
              {/* Left accent bar */}
              <div style={{
                position:'absolute',left:0,top:0,bottom:0,
                width: hoveredCard === sim.id ? 3 : 0,
                background:`linear-gradient(to bottom,transparent,${sim.accent},transparent)`,
                borderRadius:'4px 0 0 4px',
                transition:'width .3s ease',
              }}/>

              {/* Top row: icon + arrow */}
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14}}>
                <div style={{
                  width:48, height:48,
                  borderRadius:12,
                  background:`${sim.accent}14`,
                  border:`1px solid ${sim.accent}30`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:'1.5rem',
                  transform: hoveredCard === sim.id ? 'scale(1.1) rotate(6deg)' : 'scale(1)',
                  transition:'transform .4s cubic-bezier(.34,1.56,.64,1)',
                }}>
                  {sim.icon}
                </div>

                <div style={{
                  width:32, height:32,
                  borderRadius:'50%',
                  background: hoveredCard === sim.id ? `${sim.accent}22` : 'rgba(148,163,184,.07)',
                  border:`1px solid ${hoveredCard === sim.id ? sim.accent+'50' : 'rgba(148,163,184,.14)'}`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  color: hoveredCard === sim.id ? sim.accent : '#475569',
                  fontSize:'.9rem',
                  transform: hoveredCard === sim.id ? 'translateX(3px)' : 'translateX(0)',
                  transition:'all .3s ease',
                }}>
                  →
                </div>
              </div>

              {/* Title + badge */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,flexWrap:'wrap'}}>
                <h3 style={{
                  margin:0, fontSize:'1rem', fontWeight:700,
                  color: hoveredCard === sim.id ? '#f8fafc' : '#e2e8f0',
                  letterSpacing:'-.01em', transition:'color .2s',
                }}>
                  {sim.title}
                </h3>
                {sim.badge && (
                  <span style={{
                    fontSize:'.58rem', fontWeight:700, padding:'2px 7px', borderRadius:5,
                    background:`${sim.accent}22`, color:sim.accent,
                    border:`1px solid ${sim.accent}40`,
                    textTransform:'uppercase', letterSpacing:'.06em',
                  }}>
                    {sim.badge}
                  </span>
                )}
              </div>

              {/* Description */}
              <p style={{
                margin:'0 0 14px', fontSize:'.78rem',
                color:'#64748b', lineHeight:1.6, fontWeight:300,
              }}>
                {sim.description}
              </p>

              {/* Tags + stat */}
              <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                {sim.tags.map(tag => (
                  <span key={tag} className="mono" style={{
                    fontSize:'.6rem', padding:'2px 8px', borderRadius:5,
                    background:'rgba(148,163,184,.07)', color:'#94a3b8',
                    border:'1px solid rgba(148,163,184,.12)', letterSpacing:'.04em',
                  }}>
                    {tag}
                  </span>
                ))}
                <span className="mono" style={{
                  fontSize:'.62rem', padding:'2px 8px', borderRadius:5,
                  background:`${sim.accent}12`, color:sim.accent,
                  border:`1px solid ${sim.accent}28`, letterSpacing:'.05em',
                }}>
                  ⚡ {sim.stats}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div style={{height:1,background:'linear-gradient(90deg,transparent,rgba(148,163,184,.12),transparent)',marginBottom:52}}/>

        {/* ═══ FOOTER ═══ */}
        <footer style={{textAlign:'center'}}>
          <div className="mono" style={{fontSize:'.68rem',letterSpacing:'.15em',color:'#1e293b',textTransform:'uppercase',marginBottom:10}}>À propos du projet</div>
          <h3 style={{fontSize:'1.2rem',fontWeight:700,color:'#94a3b8',margin:'0 0 6px',letterSpacing:'-.01em'}}>DIYE Ousmane</h3>
          <p style={{color:'#334155',fontSize:'.82rem',marginBottom:36}}>
            Projet Tutoré · Licence 3 Informatique · Université Norbert Zongo · 2024-2025
          </p>

          <div style={{display:'flex',flexWrap:'wrap',gap:10,justifyContent:'center',marginBottom:44}}>
            {[
              {name:'React 18',icon:'⚛️',color:'#61dafb'},
              {name:'WebCrypto API',icon:'🔐',color:'#a78bfa'},
              {name:'Signal Protocol',icon:'📱',color:'#3b82f6'},
              {name:'WebSocket',icon:'🔌',color:'#f87171'},
              {name:'Tailwind CSS',icon:'🎨',color:'#67e8f9'},
            ].map(t=>(
              <div key={t.name} style={{display:'flex',alignItems:'center',gap:7,padding:'7px 15px',borderRadius:100,background:`${t.color}0d`,border:`1px solid ${t.color}25`,fontSize:'.76rem',fontWeight:600,color:t.color,backdropFilter:'blur(8px)'}}>
                <span style={{fontSize:'.88rem'}}>{t.icon}</span>{t.name}
              </div>
            ))}
          </div>

          

          <div className="mono" style={{fontSize:'.62rem',color:'#1e293b',letterSpacing:'.12em'}}>
            © 2024-2025 DIYE OUSMANE · UNZ · TOUS DROITS RÉSERVÉS
          </div>
        </footer>
      </div>

      {/* Loader */}
      {isLoading && (
        <div style={{position:'fixed',inset:0,background:'rgba(8,12,20,.92)',backdropFilter:'blur(16px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200}}>
          <div style={{textAlign:'center'}}>
            <div style={{width:52,height:52,border:'2px solid rgba(59,130,246,.15)',borderTop:'2px solid #3b82f6',borderRadius:'50%',animation:'spin .8s linear infinite',margin:'0 auto 14px'}}/>
            <div className="mono" style={{fontSize:'.68rem',color:'#1e293b',letterSpacing:'.15em'}}>CHARGEMENT...</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;