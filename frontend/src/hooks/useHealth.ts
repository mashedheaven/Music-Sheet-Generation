import { useEffect, useState } from 'react';
import { getHealth } from '../api/client';
import type { Health } from '../api/types';

let cached: Health | null = null;

export function useHealth(): { health: Health | null; offline: boolean } {
  const [health, setHealth] = useState<Health | null>(cached);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getHealth()
        .then((h) => {
          cached = h;
          if (alive) {
            setHealth(h);
            setOffline(false);
          }
        })
        .catch(() => alive && setOffline(true));
    load();
    const id = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return { health, offline };
}
