import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '../../store/authStore.ts';

const modalBackdropClass =
  'fixed inset-0 z-50 flex items-center justify-center bg-[rgba(2,6,12,0.84)] px-4 backdrop-blur-lg';

const modalPanelClass =
  'w-full rounded-2xl border border-[rgba(110,220,255,0.28)] bg-[linear-gradient(180deg,rgba(18,29,41,0.995),rgba(8,13,22,0.995))] shadow-[0_28px_72px_rgba(3,8,14,0.68),inset_0_1px_0_rgba(255,255,255,0.06)]';

const modalLabelClass = 'text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-hover)]';
const modalTitleClass = 'mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--color-text)]';
const modalMutedTextClass = 'text-slate-300';

export function UserMenu() {
  const { user, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [imgError, setImgError] = useState(false);
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
  const showGravatar = !!user?.gravatar_url && !imgError;

  const handleLogout = useCallback(async () => {
    setOpen(false);
    await logout();
  }, [logout]);

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white hover:bg-blue-500 transition-colors overflow-hidden"
          title={user?.display_name || user?.email || ''}
        >
          {showGravatar ? (
            <img
              src={user.gravatar_url}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            initial
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-10 w-48 bg-[#1e293b] border border-slate-600 rounded-md shadow-xl z-50 py-1">
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
  const [gravatarAllowed, setGravatarAllowed] = useState(user?.gravatar_allowed ?? true);
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
    <div className={modalBackdropClass} onClick={onClose}>
      <div
        className={`${modalPanelClass} max-w-[36rem] px-6 py-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5">
          <p className={modalLabelClass}>Profile</p>
          <h2 className={modalTitleClass}>Edit Profile</h2>
          <p className={`mt-1 text-sm ${modalMutedTextClass}`}>Update your public name and avatar preference.</p>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className={`mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] ${modalMutedTextClass}`}>Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); clearError(); }}
              className="h-14 w-full rounded-xl border border-[rgba(87,117,146,0.92)] bg-[rgba(11,18,31,0.98)] px-4 text-lg text-[var(--color-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors placeholder:text-slate-500 focus:border-[var(--color-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[rgba(110,220,255,0.24)]"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgba(87,117,146,0.86)] bg-[rgba(11,18,31,0.96)] px-4 py-3 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors hover:border-[rgba(110,220,255,0.34)]">
            <input
              type="checkbox"
              checked={gravatarAllowed}
              onChange={(e) => setGravatarAllowed(e.target.checked)}
              className="mt-0.5 rounded border-[rgba(87,117,146,0.92)] bg-[rgba(7,12,19,0.98)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
            />
            <span className="flex-1">
              <span className="block text-[1.05rem] font-semibold leading-6 text-[var(--color-text)]">Show Gravatar avatar</span>
              <span className={`mt-1 block text-xs ${modalMutedTextClass}`}>Use the avatar associated with your email when it is available.</span>
            </span>
          </label>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-12 flex-1 rounded-xl border border-[rgba(87,117,146,0.88)] bg-[rgba(23,37,54,0.98)] text-base font-semibold text-[var(--color-text)] transition-colors hover:border-[rgba(110,220,255,0.34)] hover:bg-[rgba(30,47,67,1)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-12 flex-1 rounded-xl bg-[linear-gradient(135deg,#4859f0,#4354e6)] text-base font-semibold text-white shadow-[0_10px_20px_rgba(67,84,230,0.25)] transition-opacity hover:opacity-95 disabled:bg-slate-600 disabled:shadow-none"
            >
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

  const fetchSessions = useCallback(
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
    listSessions(undefined)
      .then((res) => {
        setSessions(res.sessions);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [listSessions]);

  const handleShowAll = useCallback(() => {
    setShowAll(true);
    fetchSessions(true);
  }, [fetchSessions]);

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
    <div className={modalBackdropClass} onClick={onClose}>
      <div
        className={`${modalPanelClass} max-h-[80vh] max-w-[42rem] overflow-y-auto px-6 py-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className={modalLabelClass}>Security</p>
            <h2 className={modalTitleClass}>
              Active Sessions
              <span className={`ml-2 text-base font-normal ${modalMutedTextClass}`}>({total})</span>
            </h2>
            <p className={`mt-1 text-sm ${modalMutedTextClass}`}>Review where you are signed in and revoke sessions you no longer trust.</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(69,98,124,0.82)] bg-[rgba(19,32,44,0.96)] text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-[rgba(110,220,255,0.32)] hover:text-white"
            aria-label="Close sessions"
          >
            &times;
          </button>
        </div>

        {loading ? (
          <p className={`py-6 text-center text-sm ${modalMutedTextClass}`}>Loading...</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.session_id}
                className="flex items-start justify-between gap-4 rounded-xl border border-[rgba(69,98,124,0.76)] bg-[rgba(10,17,28,0.92)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-[var(--color-text)]">
                    <span className="truncate">{s.geo || s.ip}</span>
                    {s.current && (
                      <span className="rounded-full border border-emerald-300/35 bg-emerald-400/14 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                        Current
                      </span>
                    )}
                  </p>
                  <p className={`mt-1 text-sm ${modalMutedTextClass}`}>
                    {s.geo ? `${s.ip} \u00b7 ` : ''}{new Date(s.created_at).toLocaleString()}
                  </p>
                </div>
                {!s.current && (
                  <button
                    onClick={() => handleRevoke(s.session_id)}
                    className="shrink-0 rounded-lg border border-red-300/30 bg-red-400/12 px-3 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-400/18"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}

            {hiddenCount > 0 && !showAll && (
              <button
                onClick={handleShowAll}
                className="w-full rounded-xl border border-[rgba(69,98,124,0.76)] bg-[rgba(10,17,28,0.88)] py-3 text-sm font-medium text-[var(--color-accent-hover)] transition-colors hover:border-[rgba(110,220,255,0.3)] hover:bg-[rgba(13,23,34,0.98)]"
              >
                Show all sessions ({hiddenCount} more)
              </button>
            )}
          </div>
        )}

        {total > 1 && (
          <button
            onClick={handleRevokeOthers}
            className="mt-5 w-full rounded-xl border border-red-300/30 bg-red-400/12 py-3 text-sm font-medium text-red-200 transition-colors hover:bg-red-400/18"
          >
            Revoke all other sessions
          </button>
        )}
      </div>
    </div>
  );
}
