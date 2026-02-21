import { useEffect, useState } from 'react';

import {
  type ArchitectureListItem,
  deleteArchitecture,
  getArchitecture,
  listArchitectures,
} from '../api/architectures.ts';
import { useAuthStore } from '../store/authStore.ts';
import { useCanvasStore } from '../store/canvasStore.ts';
import { notify } from '../utils/notifications.ts';

export function SavedArchitecturesModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const importSchema = useCanvasStore((s) => s.importSchema);
  const setArchitectureId = useCanvasStore((s) => s.setArchitectureId);
  const setSchemaName = useCanvasStore((s) => s.setSchemaName);
  const setSchemaDescription = useCanvasStore((s) => s.setSchemaDescription);
  const setSchemaTags = useCanvasStore((s) => s.setSchemaTags);
  const setIsPublic = useCanvasStore((s) => s.setIsPublic);

  const [items, setItems] = useState<ArchitectureListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }
    let cancelled = false;
    listArchitectures(user.id)
      .then((data) => { if (!cancelled) setItems(data); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  const handleOpen = async (item: ArchitectureListItem) => {
    try {
      const detail = await getArchitecture(item.id);
      const json = JSON.stringify(detail.data);
      const result = importSchema(json);
      if (!result.ok) {
        notify.error(`Failed to load: ${result.error}`);
        return;
      }
      setArchitectureId(detail.id);
      setSchemaName(detail.name);
      setSchemaDescription(detail.description ?? '');
      setSchemaTags(detail.tags ?? []);
      setIsPublic(detail.is_public);
      onClose();
    } catch (e) {
      notify.error(`Failed to load: ${(e as Error).message}`);
    }
  };

  const handleDelete = async (item: ArchitectureListItem) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      await deleteArchitecture(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      // If the deleted architecture is currently loaded, clear the binding
      const currentId = useCanvasStore.getState().architectureId;
      if (currentId === item.id) {
        setArchitectureId(null);
      }
    } catch (e) {
      notify.error(`Delete failed: ${(e as Error).message}`);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#1e293b] rounded-xl p-6 w-full max-w-md mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-200">Saved Architectures</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {loading && (
          <p className="text-sm text-slate-400 py-8 text-center">Loading...</p>
        )}

        {error && (
          <p className="text-sm text-red-400 py-4 text-center">{error}</p>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="text-sm text-slate-400 py-8 text-center">No saved architectures yet</p>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="flex-1 overflow-y-auto space-y-1 -mx-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-slate-700/50 transition-colors group"
              >
                <button
                  onClick={() => handleOpen(item)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="text-sm text-slate-200 truncate">{item.name}</div>
                  <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                    <span>{formatDate(item.updated_at)}</span>
                    {item.is_public && <span className="text-blue-400">public</span>}
                    {item.tags?.map((tag) => (
                      <span key={tag} className="px-1 py-0 text-[10px] bg-blue-500/15 text-blue-300/80 rounded">{tag}</span>
                    ))}
                  </div>
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  className="text-xs text-red-400/60 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 px-1.5 py-1"
                  title="Delete"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
