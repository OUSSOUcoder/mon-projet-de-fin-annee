import React, { useState, useEffect } from 'react';
import MultiUserSimulation from './components/MultiUserSimulation';
import NetworkTopology from './components/NetworkTopology';

function App() {
  const [currentSimulation, setCurrentSimulation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredCard, setHoveredCard] = useState(null);

  useEffect(() => {
    setTimeout(() => setIsLoading(false), 800);
  }, []);

  const simulations = [
    {
      id: 'multi-user',
      title: 'Mode Multi-Utilisateurs',
      description: 'Communication temps réel avec E2EE, Double Ratchet et Sealed Sender. Testez le chiffrement entre plusieurs participants dans la même room.',
      icon: '🌐',
      gradient: 'from-blue-600 to-purple-600',
      component: <MultiUserSimulation />,
      badge: 'Complet',
      stats: '∞ utilisateurs',
      tags: ['E2EE', 'Double Ratchet', 'Sealed Sender'],
      tagColors: ['blue', 'purple', 'green']
    },
    {
      id: 'network',
      title: 'Topologie Réseau',
      description: 'Visualisation étape par étape du chemin réseau d\'un message chiffré, de l\'expéditeur jusqu\'au destinataire.',
      icon: '🕸️',
      gradient: 'from-purple-600 to-pink-600',
      component: <NetworkTopology />,
      stats: 'Vue visuelle',
      tags: ['Réseau', 'Visualisation'],
      tagColors: ['pink', 'cyan']
    }
  ];

  const handleSimulationClick = (simId) => {
    setIsLoading(true);
    setTimeout(() => {
      setCurrentSimulation(simId);
      setIsLoading(false);
    }, 500);
  };

  if (currentSimulation) {
    const sim = simulations.find(s => s.id === currentSimulation);
    return (
      <div className="relative min-h-screen">
        <button
          onClick={() => {
            setIsLoading(true);
            setTimeout(() => {
              setCurrentSimulation(null);
              setIsLoading(false);
            }, 300);
          }}
          className="fixed top-4 left-4 z-50 px-6 py-3 bg-gray-800/90 backdrop-blur-md hover:bg-gray-700 text-white rounded-xl shadow-2xl font-semibold flex items-center gap-3 transition-all hover:scale-105 border border-gray-700 group"
        >
          <span className="text-xl group-hover:-translate-x-1 transition-transform">←</span>
          <span>Retour au menu</span>
        </button>
        <div className={isLoading ? 'opacity-0' : 'opacity-100 transition-opacity duration-500'}>
          {sim?.component}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 text-white relative overflow-hidden">
      {/* Arrière-plan animé */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '4s' }} />
      </div>

      <div className="container mx-auto px-4 py-12 relative z-10 max-w-6xl">

        {/* Header */}
        <div className={`text-center mb-16 transition-all duration-1000 ${isLoading ? 'opacity-0 translate-y-10' : 'opacity-100 translate-y-0'}`}>
          <h1 className="text-6xl md:text-7xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
            🔐 SecureChat Simulator
          </h1>
          <p className="text-2xl text-gray-300 mb-2">
            Plateforme Interactive de Sécurité des Messageries
          </p>
          <p className="text-md text-gray-400 mb-8">
            Signal • Telegram • WhatsApp — Analyse Comparative
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <div className="inline-flex items-center gap-2 bg-blue-900/40 backdrop-blur-sm px-6 py-3 rounded-full border border-blue-500/50 hover:border-blue-400 transition-all hover:scale-105">
              <span className="text-2xl">🎯</span>
              <span className="text-blue-300 font-bold">{simulations.length} Simulations</span>
            </div>
            <div className="inline-flex items-center gap-2 bg-purple-900/40 backdrop-blur-sm px-6 py-3 rounded-full border border-purple-500/50 hover:border-purple-400 transition-all hover:scale-105">
              <span className="text-2xl">🔬</span>
              <span className="text-purple-300 font-bold">Temps Réel</span>
            </div>
            <div className="inline-flex items-center gap-2 bg-green-900/40 backdrop-blur-sm px-6 py-3 rounded-full border border-green-500/50 hover:border-green-400 transition-all hover:scale-105">
              <span className="text-2xl">✨</span>
              <span className="text-green-300 font-bold">100% Interactif</span>
            </div>
          </div>
        </div>

        {/* Titre section */}
        <div className={`mb-8 transition-all duration-1000 delay-200 ${isLoading ? 'opacity-0 translate-y-10' : 'opacity-100 translate-y-0'}`}>
          <div className="inline-flex items-center gap-4 px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-white/20 backdrop-blur-sm">
            <span className="text-4xl">🚀</span>
            <div>
              <h2 className="text-2xl font-bold text-white">Choisissez votre simulation</h2>
              <p className="text-sm text-gray-300 mt-1">Explorez les protocoles de sécurité des messageries modernes</p>
            </div>
          </div>
        </div>

        {/* Grille des 2 cartes — côte à côte */}
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 mb-16 transition-all duration-1000 delay-300 ${isLoading ? 'opacity-0 translate-y-10' : 'opacity-100 translate-y-0'}`}>
          {simulations.map((sim, index) => (
            <button
              key={sim.id}
              onClick={() => handleSimulationClick(sim.id)}
              onMouseEnter={() => setHoveredCard(sim.id)}
              onMouseLeave={() => setHoveredCard(null)}
              className={`group relative p-8 bg-gradient-to-br ${sim.gradient} rounded-3xl shadow-2xl hover:shadow-blue-500/30 transition-all duration-500 text-left overflow-hidden transform hover:scale-105`}
              style={{ animationDelay: `${index * 150}ms` }}
            >
              {/* Effet brillance */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 -skew-x-12 translate-x-[-100%] group-hover:translate-x-[200%]"
                style={{ transition: 'transform 0.7s ease, opacity 0.3s ease' }} />

              {/* Badge */}
              {sim.badge && (
                <div className="absolute top-5 right-5 px-3 py-1 bg-white/25 backdrop-blur-sm rounded-full text-xs font-bold border border-white/40">
                  ⭐ {sim.badge}
                </div>
              )}

              <div className="relative z-10">
                {/* Icône */}
                <div className="text-7xl mb-5 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 inline-block">
                  {sim.icon}
                </div>

                {/* Titre */}
                <h3 className="text-2xl font-bold mb-3 text-white">
                  {sim.title}
                </h3>

                {/* Description */}
                <p className="text-sm text-white/85 mb-5 leading-relaxed">
                  {sim.description}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {sim.tags.map((tag, i) => (
                    <span key={tag} className="text-xs px-2.5 py-1 bg-white/15 border border-white/25 rounded-full font-semibold text-white backdrop-blur-sm">
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-2 mb-6 text-xs bg-black/25 px-3 py-2 rounded-lg backdrop-blur-sm w-fit">
                  <span className="text-yellow-300">⚡</span>
                  <span className="text-white font-semibold">{sim.stats}</span>
                </div>

                {/* Bouton */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white group-hover:underline underline-offset-2">
                    Démarrer la simulation
                  </span>
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center group-hover:bg-white/35 transition-all group-hover:scale-110">
                    <span className="text-lg group-hover:translate-x-0.5 transition-transform">→</span>
                  </div>
                </div>
              </div>

              {/* Bordure survol */}
              {hoveredCard === sim.id && (
                <div className="absolute inset-0 border-2 border-white/60 rounded-3xl pointer-events-none" />
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className={`text-center pt-12 border-t border-gray-700/50 transition-opacity duration-1000 ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
          <h3 className="text-xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            À propos du projet
          </h3>
          <p className="text-gray-300 mb-1">Projet Tutoré — Licence 3 Informatique</p>
          <p className="text-gray-400 font-semibold mb-8">DIYE Ousmane • Université Norbert Zongo • 2024-2025</p>

          {/* Technologies */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
            {[
              { name: 'React 18', icon: '⚛️' },
              { name: 'WebCrypto API', icon: '🔐' },
              { name: 'Signal Protocol', icon: '📱' },
              { name: 'WebSocket', icon: '🔌' },
              { name: 'Tailwind CSS', icon: '🎨' }
            ].map((tech) => (
              <div key={tech.name} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/15 hover:border-white/30 rounded-full text-sm font-semibold transition-all hover:scale-105 cursor-default flex items-center gap-2">
                <span>{tech.icon}</span>
                <span className="text-gray-300">{tech.name}</span>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {[
              { icon: '🎯', value: '2', label: 'Simulations', color: 'blue' },
              { icon: '🔬', value: '∞', label: 'Possibilités', color: 'purple' },
              { icon: '🔐', value: '100%', label: 'Sécurisé', color: 'green' }
            ].map(stat => (
              <div key={stat.label} className={`bg-${stat.color}-900/20 backdrop-blur-sm p-6 rounded-2xl border border-${stat.color}-500/25 hover:border-${stat.color}-400/50 transition-all hover:scale-105`}>
                <div className="text-4xl mb-2">{stat.icon}</div>
                <div className={`text-3xl font-bold text-${stat.color}-400`}>{stat.value}</div>
                <div className="text-sm text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Loader */}
      {isLoading && (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl animate-pulse">🔐</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;