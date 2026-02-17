import { useCallback, useEffect, useRef, useState } from 'react';

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Periodically fetches /index.html and compares the hashed script src
 * with the one loaded at startup. If they differ, a new deploy happened.
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
    } else {
      // Fallback: fetch and parse
      checkVersion();
    }

    const id = setInterval(checkVersion, CHECK_INTERVAL);
    return () => clearInterval(id);
  }, [checkVersion]);

  const reload = useCallback(() => {
    window.location.reload();
  }, []);

  return { updateAvailable, reload };
}
