import React, { useState, useEffect } from 'react';

export default function AdminPanel() {
  const [secret, setSecret] = useState('');
  const [isAuth, setIsAuth] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [duration, setDuration] = useState(30);

  const HINT = "Noble Interest Keep...";

  const checkAuth = async () => {
    try {
      const res = await fetch(`/api/admin/sessions?secret=${encodeURIComponent(secret)}`);
      if (res.ok) {
        setIsAuth(true);
        const data = await res.json();
        setSessions(data);
        setError('');
      } else {
        setError('Invalid Secret Key');
      }
    } catch (e) {
      setError('Server Error');
    }
  };

  const generateLink = async () => {
    try {
      const res = await fetch('/api/admin/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, durationMinutes: duration })
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Access Link Generated!\n\n${data.link}`);
        const sRes = await fetch(`/api/admin/sessions?secret=${encodeURIComponent(secret)}`);
        setSessions(await sRes.json());
      }
    } catch (e) {
      alert('Failed to generate link');
    }
  };

  const killSession = async (token: string) => {
    try {
      await fetch(`/api/admin/session/${token}?secret=${encodeURIComponent(secret)}`, { method: 'DELETE' });
      setSessions(sessions.filter(s => s.token !== token));
    } catch (e) {
      alert('Failed to kill session');
    }
  };

  useEffect(() => {
    if (isAuth) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/admin/sessions?secret=${encodeURIComponent(secret)}`);
          if (res.ok) setSessions(await res.json());
        } catch (e) {}
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuth, secret]);

  if (!isAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-100 p-4 font-sans">
        <div className="w-full max-w-md p-8 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl">
          <h1 className="text-2xl font-bold mb-2 text-center">Sentry Admin</h1>
          <p className="text-zinc-500 text-center text-sm mb-8">Internal Access Control</p>
          <div className="space-y-6">
            <div className="relative">
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                Secret Phrase <span className="text-zinc-600 ml-2 font-normal italic">Hint: {HINT}</span>
              </label>
              <input 
                type="text" 
                className="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:ring-2 focus:ring-blue-600 outline-none transition-all placeholder-zinc-600"
                placeholder="Enter 6-word key..."
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && checkAuth()}
              />
            </div}
            <button 
              onClick={checkAuth}
              className="w-full py-3 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded-lg transition-all active:scale-[0.98]"
            >
              Unlock Panel
            </button>
            {error && <p className="text-red-400 text-center text-sm animate-pulse">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-end mb-12">
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tight text-white">SENTRY</h1>
            <p className="text-zinc-500 font-medium">Access Management Dashboard</p>
          </div>
          
          <div className="flex items-center gap-4 bg-zinc-900 p-2 rounded-2xl border border-zinc-800">
            <div className="flex flex-col px-2 text-right">
              <span className="text-[10px] text-zinc-500 uppercase font-bold">Expiry</span>
              <select 
                value={duration} 
                onChange={(e) => setDuration(Number(e.target.value))}
                className="bg-transparent text-sm font-bold outline-none text-zinc-200 cursor-pointer"
              >
                <option value={15}>15 Minutes</option>
                <option value={30}>30 Minutes</option>
                <option value={60}>1 Hour</option>
                <option value={1440}>24 Hours</option>
                <option value={-1}>Infinite</option>
              </select>
            </div>
            <button 
              onClick={generateLink}
              className="px-6 py-3 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded-xl transition-all shadow-lg active:scale-95"
            >
              + Generate Link
            </button>
          </div>
        </header>

        <div className="grid gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
            <table className="w-full text-left border-collapse">
              <thead className="bg-zinc-800/50 text-zinc-400 text-xs uppercase tracking-widest">
                <tr className="border-b border-zinc-800">
                  <th className="p-4 font-semibold">Token / Session</th>
                  <th className="p-4 font-semibold">Created</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr_headers>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {sessions.length === 0 ? (
                  <tr className="text-center">
                    <td colSpan={4} className="p-20 text-zinc-600 italic">
                      No active access tokens found.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.token} className="hover:bg-zinc-800/30 transition-colors group">
                      <td className="p-4">
                        <div className="font-mono text-sm text-blue-400 font-medium">{s.token.slice(0, 12)}...</div>
                        <div className="text-xs text-zinc-600">SID: {s.sessionId}</div>
                      </td>
                      <td className="p-4 text-sm text-zinc-400 font-mono">
                        {new Date(s.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                          <span className="text-zinc-300">
                            {s.remainingTime === 0 && s.expiresAt > Date.now() 
                              ? 'Permanent' 
                              : `${Math.floor(s.remainingTime / 60000)}m ${Math.floor((s.remainingTime % 60000) / 1000)}s`}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-3">
                          <button 
                            onClick={() => window.open(`/?token=${s.token}`, '_blank')}
                            className="p-2 text-zinc-500 hover:text-white bg-zinc-800 rounded-lg transition-all"
                            title="Sentry View"
                          >
                            👁️
                          </button>
                          <button 
                            onClick={() => killSession(s.token)}
                            className="p-2 text-zinc-500 hover:text-red-400 bg-zinc-800 rounded-lg transition-all"
                            title="Revoke Access"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
