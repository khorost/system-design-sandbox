import { useCallback, useEffect, useRef, useState } from 'react';

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Vite throws TypeError with these messages when a dynamic import chunk is gone
const CHUNK_ERROR_RE = /failed to fetch dynamically imported module|error loading dynamically imported module|loading chunk|load module script/i;

function isChunkLoadError(error: unknown): boolean {
  if (error instanceof TypeError && CHUNK_ERROR_RE.test(error.message)) return true;
  if (error instanceof Error && error.name === 'ChunkLoadError') return true;
  return false;
}

/**
 * 1. Periodically fetches /index.html and compares the hashed script src
 *    with the one loaded at startup. If they differ — a new deploy happened.
 * 2. Listens for chunk/asset load failures (dynamic import 404, CSS/JS load errors)
 *    which indicate the running version's assets were removed from the server.
 */
export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const initialScriptRef = useRef<string | null>(null);

  const extractScriptSrc = (html: string): string | null => {
    const match = html.match(/<script[^>]+src="(\/assets\/index-[^"]+\.js)"/);
    return match?.[1] ?? null;
  };

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch('/index.html', { cache: 'no-cache' });
      if (!res.ok) return;
      const html = await res.text();
      const remoteSrc = extractScriptSrc(html);
      if (!remoteSrc) return;

      if (initialScriptRef.current === null) {
        initialScriptRef.current = remoteSrc;
        return;
      }

      if (remoteSrc !== initialScriptRef.current) {
        setUpdateAvailable(true);
      }
    } catch {
      // Network error — ignore silently
    }
  }, []);

  useEffect(() => {
    // Capture current script src on mount
    const currentScript = document.querySelector('script[src*="/assets/index-"]');
    if (currentScript) {
      initialScriptRef.current = currentScript.getAttribute('src');
    }

    // First check right away (via setInterval's first tick or an immediate timeout)
    const id = setInterval(checkVersion, CHECK_INTERVAL);
    const immediateId = setTimeout(checkVersion, 0);

    // Dynamic import() failures surface as unhandled rejections
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isChunkLoadError(e.reason)) {
        setUpdateAvailable(true);
      }
    };

    // <script> / <link> load failures surface as error events on the element
    const onResourceError = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'SCRIPT' || target.tagName === 'LINK') {
        setUpdateAvailable(true);
      }
    };

    window.addEventListener('unhandledrejection', onRejection);
    // capture: true — resource error events don't bubble, only capturable
    window.addEventListener('error', onResourceError, true);

    return () => {
      clearTimeout(immediateId);
      clearInterval(id);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onResourceError, true);
    };
  }, [checkVersion]);

  const reload = useCallback(() => {
    window.location.reload();
  }, []);

  return { updateAvailable, reload };
}
