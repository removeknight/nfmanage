import { useEffect, useRef } from "react";

// Refresh data in visible tabs without remounting forms or resetting user input.
export function useAutoRefresh(callback, interval = 5000) {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    let busy = false, active = true;
    async function tick() {
      if (!active || busy || document.visibilityState === "hidden") return;
      busy = true;
      try { await latest.current(); } catch { /* Keep existing data during a transient disconnect. */ }
      finally { busy = false; }
    }
    const timer = setInterval(tick, interval);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [interval]);
}
