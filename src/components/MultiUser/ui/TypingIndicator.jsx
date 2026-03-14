export function TypingIndicator({ users }) {
  if (users.length === 0) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-700/50 rounded-lg text-sm text-gray-300">
      <div className="flex gap-1">
        {[0, 150, 300].map(d => (
          <span key={d} className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
      <span>
        {users.length === 1
          ? `${users[0]} est en train d'écrire...`
          : `${users.length} personnes écrivent...`}
      </span>
    </div>
  );
}