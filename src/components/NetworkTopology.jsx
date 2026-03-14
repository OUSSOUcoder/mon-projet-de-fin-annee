import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Globe, Lock, Unlock, Server, Smartphone, Laptop, Tablet, Monitor, Wifi, Key, Shield, Play, Pause, RotateCcw, CheckCircle, Info, AlertTriangle, Zap, Eye, EyeOff } from 'lucide-react';

const NetworkSecurityVisualization = () => {
  const [selectedSender, setSelectedSender] = useState(null);
  const [selectedReceiver, setSelectedReceiver] = useState(null);
  const [message, setMessage] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(-1);
  const [autoPlay, setAutoPlay] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [speed, setSpeed] = useState(3000);
  const [mitmMode, setMitmMode] = useState(false);
  const [mitmDetected, setMitmDetected] = useState(false);
  const [history, setHistory] = useState([]);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const containerRef = useRef(null);

  // ── Mesure du conteneur pour SVG absolu ──
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setContainerSize({
          w: containerRef.current.offsetWidth,
          h: containerRef.current.offsetHeight,
        });
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const devices = [
    { id: 1, name: 'Ousmane',  type: 'smartphone', icon: Smartphone, posRatio: { x: -0.35, y: -0.28 }, color: 'blue'   },
    { id: 2, name: 'Evariste', type: 'laptop',      icon: Laptop,     posRatio: { x:  0.35, y: -0.28 }, color: 'green'  },
    { id: 3, name: 'Douda',    type: 'tablet',      icon: Tablet,     posRatio: { x: -0.35, y:  0.28 }, color: 'purple' },
    { id: 4, name: 'Alssane',  type: 'desktop',     icon: Monitor,    posRatio: { x:  0.35, y:  0.28 }, color: 'orange' },
  ];

  // Calcule position absolue à partir du ratio
  const devicePos = (d) => ({
    x: containerSize.w / 2 + d.posRatio.x * containerSize.w,
    y: containerSize.h / 2 + d.posRatio.y * containerSize.h,
  });

  const serverPos = { x: containerSize.w / 2, y: containerSize.h * 0.12 };
  const mitmPos   = { x: containerSize.w / 2, y: containerSize.h * 0.30 };

  const normalPhases = [
    { id: 'device-send',      label: 'Chiffrement E2EE sur l\'appareil',       encryption: ['E2EE'],        explanation: 'Le message est chiffré avec la clé publique du destinataire. Personne d\'autre ne peut le lire.', details: ['🔐 Clé publique du destinataire utilisée', '🔒 Message illisible pour tous sauf le destinataire', '✅ Le serveur ne peut pas déchiffrer'], icon: Lock,   color: 'yellow' },
    { id: 'wifi-send',        label: 'Transmission WiFi (WPA3)',                encryption: ['E2EE','WiFi'], explanation: 'Deux couches de protection : E2EE + WiFi WPA3.', details: ['📡 WPA3 protège le réseau local', '🔐 E2EE protège le contenu', '⚠️ Piratage WiFi = message E2EE toujours illisible'], icon: Wifi,   color: 'green'  },
    { id: 'router-send',      label: 'Passage par le routeur',                  encryption: ['E2EE','WiFi'], explanation: 'Le routeur route les paquets mais ne voit que des données chiffrées.', details: ['🌐 Routeur voit des données chiffrées', '❌ Ne peut pas lire le contenu', '➡️ Simple relais de paquets'], icon: Wifi,   color: 'green'  },
    { id: 'internet-send',    label: 'Transit Internet (HTTPS)',                 encryption: ['E2EE','HTTPS'],explanation: 'HTTPS + E2EE = double protection sur Internet.', details: ['🌍 HTTPS contre l\'interception', '🔐 E2EE empêche la lecture', '🛡️ Protection MITM active'], icon: Globe,  color: 'blue'   },
    { id: 'server',           label: 'Serveur (NE PEUT PAS DÉCHIFFRER)',         encryption: ['E2EE','HTTPS'],explanation: 'POINT CLÉ : Le serveur ne peut PAS lire le message.', details: ['❌ Pas de clé de déchiffrement', '📦 Bloc opaque incompréhensible', '✅ Simple relais', '🔒 Vie privée protégée même du fournisseur'], isServerPhase: true, icon: Server, color: 'red'    },
    { id: 'internet-receive', label: 'Retour via Internet (HTTPS)',              encryption: ['E2EE','HTTPS'],explanation: 'Le message chiffré retourne vers le destinataire.', details: ['🔄 Transmission sécurisée', '🔐 Toujours chiffré E2EE', '🌐 HTTPS actif'], icon: Globe,  color: 'blue'   },
    { id: 'router-receive',   label: 'Routeur du destinataire',                  encryption: ['E2EE','WiFi'], explanation: 'Le routeur destinataire reçoit le message chiffré.', details: ['📨 Arrivée au réseau destinataire', '❌ Routeur ne peut pas déchiffrer', '➡️ Transmission vers l\'appareil'], icon: Wifi,   color: 'green'  },
    { id: 'wifi-receive',     label: 'WiFi du destinataire (WPA3)',              encryption: ['E2EE','WiFi'], explanation: 'Dernier tronçon WiFi, toujours chiffré.', details: ['📡 Transit WiFi local', '🔐 Toujours E2EE', '🏁 Presque arrivé'], icon: Wifi,   color: 'green'  },
    { id: 'device-receive',   label: 'Déchiffrement sur l\'appareil destinataire',encryption: ['E2EE'],       explanation: 'SEUL le destinataire peut déchiffrer avec sa clé privée !', details: ['🔓 Clé privée du destinataire', '✅ Message lisible', '🎯 Seul le destinataire peut lire', '🏆 Communication privée réussie !'], isDecryption: true, icon: Key, color: 'green' },
  ];

  const mitmPhases = [
    { id: 'device-send',   label: 'Chiffrement… mais vers qui ?',             encryption: ['E2EE'],        explanation: 'L\'expéditeur chiffre le message mais avec la clé de l\'attaquant MITM (pas du vrai destinataire) !', details: ['⚠️ Clé publique substituée par MITM', '🔐 Message chiffré pour l\'attaquant', '❌ Pas de Safety Number vérifié !'], icon: AlertTriangle, color: 'red'    },
    { id: 'wifi-send',     label: 'Transit WiFi — MITM en position',           encryption: ['E2EE','WiFi'], explanation: 'L\'attaquant est positionné entre l\'expéditeur et le serveur.', details: ['🕵️ Attaquant intercepte le trafic', '📡 WiFi visible mais chiffré', '⚠️ Substitution de clé possible'], icon: AlertTriangle, color: 'red'    },
    { id: 'mitm-intercept',label: '🚨 INTERCEPTION MITM !',                    encryption: [],              explanation: 'L\'attaquant déchiffre le message avec SA clé privée, le lit, puis le re-chiffre pour le destinataire.', details: ['🔓 Attaquant déchiffre avec sa clé privée', '👁️ Message en clair visible par l\'attaquant', '🔐 Re-chiffrement pour le vrai destinataire', '❌ Communication compromise !'], isMITM: true, icon: Eye, color: 'red' },
    { id: 'server',        label: 'Serveur — ne détecte pas l\'attaque',        encryption: ['E2EE','HTTPS'],explanation: 'Sans Safety Number, le serveur et le destinataire ne savent pas que MITM a eu lieu.', details: ['❌ Serveur ne peut pas détecter MITM', '📦 Reçoit des données chiffrées normalement', '⚠️ Attaque invisible sans vérification'], isServerPhase: true, icon: Server, color: 'orange' },
    { id: 'device-receive',label: 'Destinataire reçoit le message compromis',  encryption: ['E2EE'],        explanation: 'Le destinataire déchiffre mais ne sait pas que MITM a lu le message en transit.', details: ['🔓 Déchiffrement normal', '⚠️ Message a été lu par MITM', '🔏 Solution : vérifier le Safety Number !'], isDecryption: true, icon: AlertTriangle, color: 'orange' },
  ];

  const phases = mitmMode ? mitmPhases : normalPhases;

  // ── Texte chiffré stable ──
  const encryptedText = useMemo(() => {
    if (!message) return '';
    return message.split('').map(() =>
      String.fromCharCode(0x2588 + Math.floor(Math.random() * 5))
    ).join('');
  }, [message, isActive]);

  // ── Auto-play ──
  useEffect(() => {
    if (!isActive || isPaused || !autoPlay) return;
    const timer = setTimeout(() => {
      if (currentPhaseIndex < phases.length - 1) {
        setCurrentPhaseIndex(prev => prev + 1);
      } else {
        setTimeout(resetTransmission, 2000);
      }
    }, speed);
    return () => clearTimeout(timer);
  }, [isActive, isPaused, currentPhaseIndex, autoPlay, speed, phases.length]);

  // ── Détection MITM ──
  useEffect(() => {
    if (currentPhaseIndex >= 0 && phases[currentPhaseIndex]?.isMITM) {
      setMitmDetected(true);
    }
  }, [currentPhaseIndex]);

  const handleStart = () => {
    if (!selectedSender || !selectedReceiver || !message.trim() || selectedSender === selectedReceiver) return;
    setIsActive(true);
    setCurrentPhaseIndex(0);
    setIsPaused(false);
    setMitmDetected(false);
  };

  const resetTransmission = () => {
    if (isActive && currentPhaseIndex >= 0) {
      setHistory(prev => [{
        sender: devices.find(d => d.id === selectedSender)?.name,
        receiver: devices.find(d => d.id === selectedReceiver)?.name,
        message,
        mitm: mitmMode,
        phases: phases.length,
        time: new Date().toLocaleTimeString()
      }, ...prev].slice(0, 5));
    }
    setIsActive(false);
    setIsPaused(false);
    setCurrentPhaseIndex(-1);
    setMitmDetected(false);
  };

  // ── Position du message selon la phase ──
  const getMessagePosition = useCallback(() => {
    if (currentPhaseIndex === -1 || !selectedSender || !selectedReceiver) return null;
    const sender   = devices.find(d => d.id === selectedSender);
    const receiver = devices.find(d => d.id === selectedReceiver);
    if (!sender || !receiver) return null;
    const sp = devicePos(sender);
    const rp = devicePos(receiver);
    const cx = containerSize.w / 2;
    const cy = containerSize.h / 2;
    const phase = phases[currentPhaseIndex];

    const lerp = (a, b, t) => a + (b - a) * t;

    switch (phase?.id) {
      case 'device-send':     return { x: sp.x, y: sp.y };
      case 'wifi-send':       return { x: lerp(sp.x, cx, 0.4), y: lerp(sp.y, cy, 0.4) };
      case 'router-send':     return { x: lerp(sp.x, cx, 0.65), y: lerp(sp.y, cy, 0.65) };
      case 'internet-send':   return { x: cx, y: cy - 80 };
      case 'mitm-intercept':  return { x: mitmPos.x, y: mitmPos.y };
      case 'server':          return { x: serverPos.x, y: serverPos.y + 40 };
      case 'internet-receive':return { x: cx, y: cy - 80 };
      case 'router-receive':  return { x: lerp(rp.x, cx, 0.65), y: lerp(rp.y, cy, 0.65) };
      case 'wifi-receive':    return { x: lerp(rp.x, cx, 0.4), y: lerp(rp.y, cy, 0.4) };
      case 'device-receive':  return { x: rp.x, y: rp.y };
      default: return { x: cx, y: cy };
    }
  }, [currentPhaseIndex, selectedSender, selectedReceiver, containerSize, mitmMode]);

  const currentPhase  = phases[currentPhaseIndex];
  const msgPos        = getMessagePosition();
  const isE2EEEncrypted = currentPhase && currentPhase.encryption.includes('E2EE') && currentPhase.id !== 'device-receive';
  const isComplete    = currentPhase?.id === 'device-receive';
  const isMITMPhase   = currentPhase?.isMITM;
  const canStart      = selectedSender && selectedReceiver && message.trim() && selectedSender !== selectedReceiver;

  const colorMap = {
    blue:   { bg: 'bg-blue-600',   border: 'border-blue-400',   text: 'text-blue-400',   shadow: 'shadow-blue-500/50',   from: 'from-blue-600',   to: 'to-blue-500'   },
    green:  { bg: 'bg-green-600',  border: 'border-green-400',  text: 'text-green-400',  shadow: 'shadow-green-500/50',  from: 'from-green-600',  to: 'to-green-500'  },
    purple: { bg: 'bg-purple-600', border: 'border-purple-400', text: 'text-purple-400', shadow: 'shadow-purple-500/50', from: 'from-purple-600', to: 'to-purple-500' },
    orange: { bg: 'bg-orange-600', border: 'border-orange-400', text: 'text-orange-400', shadow: 'shadow-orange-500/50', from: 'from-orange-600', to: 'to-orange-500' },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white p-4 relative overflow-hidden">
      {/* Fond animé */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
            🕸️ Topologie Réseau E2EE
          </h1>
          <p className="text-slate-300 mb-3">Visualisation étape par étape d'un message chiffré</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button onClick={() => setShowHelp(!showHelp)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/50 rounded-lg transition-all text-sm">
              <Info className="w-4 h-4" /> Comment utiliser ?
            </button>
            {/* Toggle MITM */}
            <button onClick={() => { setMitmMode(!mitmMode); resetTransmission(); }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-sm font-bold ${
                mitmMode
                  ? 'bg-red-600/40 border-red-500 text-red-300 animate-pulse'
                  : 'bg-slate-700/50 border-slate-600 text-slate-300 hover:border-red-500/50'
              }`}>
              {mitmMode ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {mitmMode ? '🚨 Mode MITM ACTIF' : '🕵️ Activer mode MITM'}
            </button>
          </div>

          {showHelp && (
            <div className="mt-4 mx-auto max-w-2xl bg-blue-900/30 border border-blue-500/30 rounded-xl p-5 text-left">
              <ol className="space-y-2 text-sm text-slate-300">
                <li><span className="text-blue-400 font-bold">1.</span> Sélectionnez un <strong>expéditeur</strong></li>
                <li><span className="text-blue-400 font-bold">2.</span> Sélectionnez un <strong>destinataire</strong> différent</li>
                <li><span className="text-blue-400 font-bold">3.</span> Écrivez votre <strong>message</strong></li>
                <li><span className="text-blue-400 font-bold">4.</span> Cliquez <strong>"Démarrer"</strong> et observez le parcours</li>
                <li><span className="text-blue-400 font-bold">5.</span> Activez <strong>Mode MITM</strong> pour voir une attaque Man-in-the-Middle</li>
              </ol>
            </div>
          )}
        </div>

        {/* Alerte MITM détecté */}
        {mitmDetected && (
          <div className="mb-4 p-4 bg-red-900/50 border-2 border-red-500 rounded-xl flex items-center gap-3 animate-pulse">
            <AlertTriangle className="w-8 h-8 text-red-400 flex-shrink-0" />
            <div>
              <p className="font-bold text-red-300 text-lg">🚨 ATTAQUE MITM DÉTECTÉE !</p>
              <p className="text-red-400 text-sm">L'attaquant a intercepté et lu le message en clair. Solution : vérifier le Safety Number avant d'envoyer !</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ── Panneau gauche ── */}
          <div className="lg:col-span-1 space-y-4">
            {/* Config */}
            <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 shadow-xl">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-400" /> Configuration
              </h3>

              {/* Expéditeur */}
              <div className="mb-4">
                <label className="block text-xs font-semibold mb-2 text-slate-400 uppercase tracking-wider">1️⃣ Expéditeur</label>
                <div className="grid grid-cols-2 gap-2">
                  {devices.map(device => {
                    const Icon = device.icon;
                    const c = colorMap[device.color];
                    const isSelected = selectedSender === device.id;
                    return (
                      <button key={`s-${device.id}`}
                        onClick={() => setSelectedSender(device.id)}
                        disabled={selectedReceiver === device.id || isActive}
                        className={`p-3 rounded-xl border-2 transition-all text-center ${
                          isSelected ? `${c.bg} ${c.border} scale-105 shadow-lg`
                          : selectedReceiver === device.id ? 'bg-slate-700/30 border-slate-600/30 opacity-40 cursor-not-allowed'
                          : 'bg-slate-700/50 border-slate-600 hover:border-slate-400 hover:scale-105'
                        }`}>
                        <Icon className={`w-7 h-7 mx-auto mb-1 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                        <div className="text-xs font-semibold">{device.name}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Destinataire */}
              <div className="mb-4">
                <label className="block text-xs font-semibold mb-2 text-slate-400 uppercase tracking-wider">2️⃣ Destinataire</label>
                <div className="grid grid-cols-2 gap-2">
                  {devices.map(device => {
                    const Icon = device.icon;
                    const c = colorMap[device.color];
                    const isSelected = selectedReceiver === device.id;
                    return (
                      <button key={`r-${device.id}`}
                        onClick={() => setSelectedReceiver(device.id)}
                        disabled={selectedSender === device.id || isActive}
                        className={`p-3 rounded-xl border-2 transition-all text-center ${
                          isSelected ? `${c.bg} ${c.border} scale-105 shadow-lg`
                          : selectedSender === device.id ? 'bg-slate-700/30 border-slate-600/30 opacity-40 cursor-not-allowed'
                          : 'bg-slate-700/50 border-slate-600 hover:border-slate-400 hover:scale-105'
                        }`}>
                        <Icon className={`w-7 h-7 mx-auto mb-1 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                        <div className="text-xs font-semibold">{device.name}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message */}
              <div className="mb-4">
                <label className="block text-xs font-semibold mb-2 text-slate-400 uppercase tracking-wider">3️⃣ Message</label>
                <textarea value={message} onChange={e => setMessage(e.target.value.slice(0, 200))}
                  disabled={isActive} placeholder="Écrivez votre message secret..."
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 text-sm resize-none"
                  rows="3" />
                <div className="text-right text-xs text-slate-500 mt-1">{message.length}/200</div>
              </div>

              {/* Vitesse */}
              <div className="mb-4">
                <label className="block text-xs font-semibold mb-2 text-slate-400 uppercase tracking-wider flex justify-between">
                  <span>⚡ Vitesse auto-play</span>
                  <span className="text-blue-400">{speed / 1000}s/étape</span>
                </label>
                <input type="range" min="500" max="5000" step="500" value={speed}
                  onChange={e => setSpeed(Number(e.target.value))}
                  className="w-full accent-blue-500" />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>Rapide (0.5s)</span><span>Lent (5s)</span>
                </div>
              </div>

              {/* Contrôles */}
              <div className="space-y-2">
                {!isActive ? (
                  <button onClick={handleStart} disabled={!canStart}
                    className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                      canStart ? 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 shadow-lg hover:scale-105'
                      : 'bg-slate-700 cursor-not-allowed opacity-50'
                    }`}>
                    <Play className="w-5 h-5" /> Démarrer la transmission
                  </button>
                ) : (
                  <>
                    <button onClick={() => setIsPaused(!isPaused)}
                      className="w-full py-3 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-700 hover:to-yellow-600 rounded-xl font-bold flex items-center justify-center gap-2 transition-all">
                      {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                      {isPaused ? 'Reprendre' : 'Pause'}
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setCurrentPhaseIndex(p => Math.max(0, p - 1))}
                        disabled={currentPhaseIndex === 0}
                        className="py-2 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-sm transition-all disabled:opacity-50">
                        ← Précédent
                      </button>
                      <button onClick={() => setCurrentPhaseIndex(p => Math.min(phases.length - 1, p + 1))}
                        disabled={currentPhaseIndex === phases.length - 1}
                        className="py-2 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-sm transition-all disabled:opacity-50">
                        Suivant →
                      </button>
                    </div>
                    <button onClick={resetTransmission}
                      className="w-full py-2 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 rounded-xl font-bold flex items-center justify-center gap-2 transition-all">
                      <RotateCcw className="w-4 h-4" /> Réinitialiser
                    </button>
                  </>
                )}
                <label className="flex items-center gap-2 px-3 py-2 bg-slate-700/30 rounded-xl cursor-pointer hover:bg-slate-700/50 transition-all">
                  <input type="checkbox" checked={autoPlay} onChange={e => setAutoPlay(e.target.checked)} className="w-4 h-4 accent-blue-500" />
                  <span className="text-sm">Mode automatique</span>
                </label>
              </div>
            </div>

            {/* Phase actuelle */}
            {currentPhase && (
              <div className={`backdrop-blur-sm rounded-2xl p-5 border shadow-xl ${
                currentPhase.isMITM ? 'bg-red-900/30 border-red-500/50' : 'bg-purple-900/20 border-purple-500/30'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  {currentPhase.icon && <currentPhase.icon className={`w-6 h-6 text-${currentPhase.color}-400`} />}
                  <span className="text-sm font-bold text-purple-300">Étape {currentPhaseIndex + 1}/{phases.length}</span>
                </div>
                <h4 className="text-base font-bold mb-2">{currentPhase.label}</h4>
                <p className="text-xs text-slate-300 mb-3 leading-relaxed">{currentPhase.explanation}</p>
                <div className="space-y-1.5">
                  {currentPhase.details.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-300 bg-slate-800/50 p-2 rounded-lg">
                      <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>{d}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Progression</span>
                    <span className="text-purple-400 font-bold">{Math.round(((currentPhaseIndex + 1) / phases.length) * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${
                      mitmMode ? 'bg-gradient-to-r from-red-500 to-orange-500' : 'bg-gradient-to-r from-purple-500 to-pink-500'
                    }`} style={{ width: `${((currentPhaseIndex + 1) / phases.length) * 100}%` }} />
                  </div>
                </div>
              </div>
            )}

            {/* Historique */}
            {history.length > 0 && (
              <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
                <h3 className="text-sm font-bold mb-3 text-slate-300">📋 Historique</h3>
                <div className="space-y-2">
                  {history.map((h, i) => (
                    <div key={i} className={`p-2 rounded-lg text-xs border ${
                      h.mitm ? 'bg-red-900/20 border-red-500/30' : 'bg-green-900/20 border-green-500/30'
                    }`}>
                      <div className="flex justify-between mb-1">
                        <span className="font-bold">{h.sender} → {h.receiver}</span>
                        <span className="text-slate-400">{h.time}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${h.mitm ? 'bg-red-500/30 text-red-300' : 'bg-green-500/30 text-green-300'}`}>
                          {h.mitm ? '🚨 MITM' : '✅ Sécurisé'}
                        </span>
                        <span className="text-slate-400 truncate max-w-[100px]">{h.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Zone de visualisation ── */}
          <div className="lg:col-span-2">
            <div ref={containerRef}
              className={`rounded-2xl border shadow-2xl relative overflow-hidden`}
              style={{ minHeight: 600, background: mitmMode ? 'rgba(127,29,29,0.15)' : 'rgba(30,41,59,0.5)', borderColor: mitmMode ? 'rgba(239,68,68,0.4)' : 'rgba(51,65,85,0.5)', backdropFilter: 'blur(8px)' }}>

              {/* SVG lignes — coordonnées absolues */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
                {/* Lignes device → centre */}
                {devices.map(device => {
                  const dp = devicePos(device);
                  const isSelected = selectedSender === device.id || selectedReceiver === device.id;
                  return (
                    <line key={`line-${device.id}`}
                      x1={dp.x} y1={dp.y}
                      x2={containerSize.w / 2} y2={containerSize.h / 2}
                      stroke={isSelected ? 'rgb(59,130,246)' : 'rgba(100,116,139,0.25)'}
                      strokeWidth={isSelected ? 2 : 1}
                      strokeDasharray={isSelected ? '0' : '6,4'}
                      className="transition-all duration-300"
                    />
                  );
                })}

                {/* Ligne centre → serveur */}
                <line x1={containerSize.w / 2} y1={containerSize.h / 2}
                  x2={serverPos.x} y2={serverPos.y}
                  stroke={isActive ? 'rgba(139,92,246,0.6)' : 'rgba(100,116,139,0.2)'}
                  strokeWidth={isActive ? 2 : 1} strokeDasharray="6,3" />

                {/* Ligne MITM (rouge) */}
                {mitmMode && (
                  <line x1={containerSize.w / 2} y1={containerSize.h / 2}
                    x2={mitmPos.x} y2={mitmPos.y}
                    stroke="rgba(239,68,68,0.7)" strokeWidth={2} strokeDasharray="4,3" />
                )}

                {/* Routeurs */}
                {[-1, 1].map(dir => {
                  const rx = containerSize.w / 2 + dir * containerSize.w * 0.15;
                  const ry = containerSize.h / 2 - containerSize.h * 0.12;
                  return (
                    <g key={`router-${dir}`}>
                      <circle cx={rx} cy={ry} r={22}
                        fill="rgba(34,197,94,0.08)"
                        stroke={isActive ? 'rgba(34,197,94,0.8)' : 'rgba(34,197,94,0.3)'}
                        strokeWidth={isActive ? 2 : 1} />
                      <text x={rx} y={ry + 36} textAnchor="middle"
                        fill={isActive ? 'rgba(34,197,94,0.9)' : 'rgba(34,197,94,0.5)'}
                        fontSize="9" fontWeight="bold">Routeur</text>
                    </g>
                  );
                })}
              </svg>

              {/* Serveur */}
              <div className="absolute z-20 transition-all duration-500"
                style={{ left: serverPos.x, top: serverPos.y, transform: 'translate(-50%, -50%)' }}>
                <div className={`p-4 rounded-2xl border-4 transition-all ${
                  currentPhase?.isServerPhase
                    ? mitmMode
                      ? 'bg-gradient-to-br from-orange-600 to-orange-500 border-orange-400 scale-110 shadow-2xl shadow-orange-500/50'
                      : 'bg-gradient-to-br from-red-600 to-red-500 border-red-400 scale-110 shadow-2xl shadow-red-500/50 animate-pulse'
                    : 'bg-gradient-to-br from-purple-900/50 to-purple-800/50 border-purple-700/50'
                }`}>
                  <Server className="w-10 h-10 text-white" />
                </div>
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                    currentPhase?.isServerPhase
                      ? 'text-red-300 bg-red-900/80 border-red-500'
                      : 'text-purple-400 bg-slate-900/80 border-purple-500/30'
                  }`}>Serveur E2EE</span>
                  {currentPhase?.isServerPhase && (
                    <div className="mt-1">
                      <span className="text-[10px] font-bold text-red-400 bg-red-900/80 px-2 py-0.5 rounded-full border border-red-500 animate-pulse">
                        ❌ NE PEUT PAS DÉCHIFFRER
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Attaquant MITM */}
              {mitmMode && (
                <div className="absolute z-20 transition-all duration-500"
                  style={{ left: mitmPos.x, top: mitmPos.y, transform: 'translate(-50%, -50%)' }}>
                  <div className={`p-4 rounded-2xl border-4 transition-all ${
                    currentPhase?.isMITM
                      ? 'bg-gradient-to-br from-red-700 to-red-600 border-red-400 scale-125 shadow-2xl shadow-red-500/70 animate-pulse'
                      : 'bg-gradient-to-br from-red-900/40 to-red-800/40 border-red-700/50'
                  }`}>
                    <AlertTriangle className="w-10 h-10 text-red-300" />
                  </div>
                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full border text-red-300 bg-red-900/80 border-red-500">
                      🕵️ Attaquant MITM
                    </span>
                    {currentPhase?.isMITM && (
                      <div className="mt-1">
                        <span className="text-[10px] font-bold text-white bg-red-600 px-2 py-0.5 rounded-full animate-pulse">
                          👁️ LIT LE MESSAGE !
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Appareils */}
              {devices.map(device => {
                const Icon = device.icon;
                const dp = devicePos(device);
                const c = colorMap[device.color];
                const isSending   = selectedSender === device.id && currentPhase?.id === 'device-send';
                const isReceiving = selectedReceiver === device.id && currentPhase?.id === 'device-receive';
                const isSelected  = selectedSender === device.id || selectedReceiver === device.id;
                return (
                  <div key={device.id} className="absolute z-30 transition-all duration-500"
                    style={{ left: dp.x, top: dp.y, transform: 'translate(-50%, -50%)' }}>
                    <div className={`relative p-5 rounded-2xl border-4 transition-all ${
                      isSending || isReceiving
                        ? `bg-gradient-to-br ${c.from} ${c.to} ${c.border} scale-125 shadow-2xl ${c.shadow}`
                        : isSelected
                        ? `bg-gradient-to-br ${c.from}/30 ${c.to}/30 ${c.border}/60`
                        : 'bg-slate-800/60 border-slate-700'
                    }`}>
                      <Icon className={`w-10 h-10 ${isSending || isReceiving ? 'text-white animate-pulse' : isSelected ? c.text : 'text-slate-500'}`} />
                      {isSending   && <div className="absolute -top-2 -right-2 bg-yellow-500 rounded-full p-1.5 animate-pulse"><Lock className="w-4 h-4 text-white" /></div>}
                      {isReceiving && <div className="absolute -top-2 -right-2 bg-green-500 rounded-full p-1.5 animate-pulse"><Key className="w-4 h-4 text-white" /></div>}
                    </div>
                    <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
                      <div className={`text-sm font-bold ${isSelected ? c.text : 'text-slate-300'}`}>{device.name}</div>
                      <div className="text-xs text-slate-500">{device.type}</div>
                    </div>
                  </div>
                );
              })}

              {/* Message en transit */}
              {isActive && message && msgPos && (
                <div className="absolute z-40 transition-all duration-1000 ease-in-out pointer-events-none"
                  style={{ left: msgPos.x, top: msgPos.y, transform: 'translate(-50%, -50%)' }}>
                  <div className={`px-4 py-3 rounded-xl border-4 shadow-2xl min-w-[180px] max-w-[240px] backdrop-blur-sm ${
                    isMITMPhase    ? 'bg-red-500/40 border-red-400 shadow-red-500/50'
                    : isE2EEEncrypted ? 'bg-purple-500/30 border-purple-500 shadow-purple-500/50'
                    : isComplete   ? 'bg-green-500/30 border-green-500 shadow-green-500/50'
                    : 'bg-yellow-500/30 border-yellow-500 shadow-yellow-500/50'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      {isMITMPhase    && <Eye className="w-5 h-5 text-red-400 animate-pulse flex-shrink-0" />}
                      {isE2EEEncrypted && !isMITMPhase && <Lock className="w-5 h-5 text-purple-400 animate-pulse flex-shrink-0" />}
                      {!isE2EEEncrypted && !isComplete && !isMITMPhase && <Unlock className="w-5 h-5 text-yellow-400 flex-shrink-0" />}
                      {isComplete && <Key className="w-5 h-5 text-green-400 animate-pulse flex-shrink-0" />}
                      <div className="text-sm font-mono text-white font-bold break-all leading-tight">
                        {isMITMPhase ? message : isE2EEEncrypted ? encryptedText : message}
                      </div>
                    </div>
                    <div className="text-xs text-center font-bold uppercase tracking-wider py-1 rounded bg-black/20">
                      {isMITMPhase    && <span className="text-red-300">👁️ INTERCEPTÉ</span>}
                      {isE2EEEncrypted && !isMITMPhase && <span className="text-purple-300">🔒 Chiffré E2EE</span>}
                      {isComplete     && <span className="text-green-300">✅ Déchiffré !</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Message d'état central */}
              {!isActive && (
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <div className="text-center text-slate-600">
                    <Shield className="w-16 h-16 mx-auto mb-3 opacity-20" />
                    <p className="text-sm opacity-40">Configurez et démarrez une transmission</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Légende */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
          {[
            { icon: Shield, color: 'purple', title: 'E2EE (End-to-End)', desc: 'Seuls expéditeur et destinataire peuvent lire. Personne d\'autre !' },
            { icon: Globe,  color: 'blue',   title: 'HTTPS/TLS',         desc: 'Protection du transit sur Internet contre les interceptions.' },
            { icon: Wifi,   color: 'green',  title: 'WiFi (WPA3)',        desc: 'Chiffrement du réseau local pour protéger vos données.' },
          ].map(item => (
            <div key={item.title} className={`bg-${item.color}-500/10 p-5 rounded-xl border-l-4 border-${item.color}-500 hover:scale-105 transition-all`}>
              <div className="flex items-center gap-3 mb-2">
                <item.icon className={`w-7 h-7 text-${item.color}-400`} />
                <h4 className={`text-${item.color}-400 font-bold`}>{item.title}</h4>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NetworkSecurityVisualization;