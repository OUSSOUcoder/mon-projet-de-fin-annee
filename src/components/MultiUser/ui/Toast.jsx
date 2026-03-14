import { useEffect } from 'react';

export function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    info:    'bg-blue-600 border-blue-500',
    success: 'bg-green-600 border-green-500',
    warning: 'bg-yellow-600 border-yellow-500',
    error:   'bg-red-600 border-red-500'
  };
  const icons = { info: 'ℹ', success: '✓', warning: '⚠', error: '✕' };

  return (
    <div className={`${colors[type]} border-l-4 p-4 rounded-lg shadow-xl backdrop-blur-sm animate-slide-in`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold">{icons[type]}</span>
          <p className="text-white font-medium text-sm">{message}</p>
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white text-lg leading-none font-bold">×</button>
      </div>
    </div>
  );
}