import { useEffect, useState } from 'react';

import { getDominantColor } from '../utils/dominantColor';
import { ensureTrackAccentContrast } from '../utils/accentContrast';

/** The current track's cover-art accent color, or null while it's loading /
 * unavailable (native, no thumbnail, or a host that blocks pixel reads) —
 * callers should fall back to their default palette on null. */
export function useTrackAccent(thumbnailUrl: string | null | undefined): string | null {
  const [accent, setAccent] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setAccent(null);
    getDominantColor(thumbnailUrl).then((color) => {
      if (alive) setAccent(color ? ensureTrackAccentContrast(color) : null);
    });
    return () => {
      alive = false;
    };
  }, [thumbnailUrl]);

  return accent;
}
