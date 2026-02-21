import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '../../store/authStore.ts';

export function UserMenu() {
  const { user, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initial = user?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?';

  const handleLogout = useCallback(async () => {
    setOpen(false);
    await logout();
  }, [logout]);

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white hover:bg-blue-500 transition-colors"
          title={user?.display_name || user?.email || ''}
        >
          {initial}
        </button>

        {open && (
          <div className="absolute right-0 top-10 w-48 bg-[#1e293b] border border-slate-600 rounded-lg shadow-xl z-50 py-1">
            <div className="px-3 py-2 border-b border-slate-600">
              <p className="text-xs text-slate-200 font-medium truncate">{user?.display_name || user?.name}</p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
            <button
              onClick={() => { setOpen(false); setShowProfile(true); }}
              className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Profile
            </button>
            <button
              onClick={() => { setOpen(false); setShowSessions(true); }}
              className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Sessions
            </button>
            <div className="border-t border-slate-600">
              <button
                onClick={handleLogout}
                className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-slate-700 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showSessions && <SessionsModal onClose={() => setShowSessions(false)} />}
    </>
  );
}

function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user, updateProfile, error, clearError } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [gravatarAllowed, setGravatarAllowed] = useState(user?.gravatar_allowed || false);
  const [submitting, setSubmitting] = useState(false);

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      try {
        await updateProfile(displayName.trim(), gravatarAllowed);
        onClose();
      } finally {
        setSubmitting(false);
      }
    },
    [displayName, gravatarAllowed, updateProfile, onClose],
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#1e293b] rounded-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-100 mb-4">Edit Profile</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); clearError(); }}
              className="w-full px-3 py-2.5 bg-[#0f172a] border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={gravatarAllowed}
              onChange={(e) => setGravatarAllowed(e.target.checked)}
              className="rounded border-slate-600 bg-[#0f172a] text-blue-500 focus:ring-blue-500"
            />
            Show Gravatar avatar
          </label>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 text-sm text-slate-300 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex-1 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-500 disabled:bg-slate-600 transition-colors font-semibold">
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface SessionInfo {
  session_id: string;
  ip: string;
  geo: string;
  created_at: string;
  last_active_at: string;
  current: boolean;
}

function SessionsModal({ onClose }: { onClose: () => void }) {
  const { listSessions, revokeSession, revokeOtherSessions } = useAuthStore();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    (all: boolean) => {
      setLoading(true);
      listSessions(all ? 0 : undefined)
        .then((res) => {
          setSessions(res.sessions);
          setTotal(res.total);
        })
        .finally(() => setLoading(false));
    },
    [listSessions],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const handleShowAll = useCallback(() => {
    setShowAll(true);
    load(true);
  }, [load]);

  const handleRevoke = useCallback(
    async (sessionID: string) => {
      await revokeSession(sessionID);
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionID));
      setTotal((prev) => prev - 1);
    },
    [revokeSession],
  );

  const handleRevokeOthers = useCallback(async () => {
    await revokeOtherSessions();
    setSessions((prev) => prev.filter((s) => s.current));
    setTotal(1);
  }, [revokeOtherSessions]);

  const hiddenCount = total - sessions.length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#1e293b] rounded-xl p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-100">
            Active Sessions
            <span className="ml-2 text-sm font-normal text-slate-400">({total})</span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg">&times;</button>
        </div>

        {loading ? (
          <p className="text-xs text-slate-400 text-center py-4">Loading...</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.session_id} className="bg-[#0f172a] rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-200">
                    {s.geo || s.ip}
                    {s.current && <span className="ml-2 text-green-400 text-[10px]">current</span>}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {s.geo ? s.ip + ' \u00b7 ' : ''}{new Date(s.created_at).toLocaleString()}
                  </p>
                </div>
                {!s.current && (
                  <button onClick={() => handleRevoke(s.session_id)} className="text-xs text-red-400 hover:text-red-300">
                    Revoke
                  </button>
                )}
              </div>
            ))}

            {hiddenCount > 0 && !showAll && (
              <button
                onClick={handleShowAll}
                className="w-full py-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Show all sessions ({hiddenCount} more)
              </button>
            )}
          </div>
        )}

        {total > 1 && (
          <button
            onClick={handleRevokeOthers}
            className="w-full mt-4 py-2 text-xs text-red-400 border border-red-400/30 rounded-lg hover:bg-red-400/10 transition-colors"
          >
            Revoke all other sessions
          </button>
        )}
      </div>
    </div>
  );
}
