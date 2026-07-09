import { Platform } from 'react-native';

const cache = new Map<string, string | null>();

/**
 * Extracts a vivid accent color from an image URL via an offscreen canvas —
 * web only (there's no DOM/canvas on native). Many thumbnail hosts (e.g.
 * YouTube's img CDN) send permissive CORS headers and work fine; hosts that
 * don't will "taint" the canvas and throw on pixel read — that's caught and
 * treated as "no accent available", never as an error. Callers should treat
 * a null result as "keep the current palette", exactly like a cache miss.
 */
export function getDominantColor(url: string | null | undefined): Promise<string | null> {
  if (!url || Platform.OS !== 'web' || typeof document === 'undefined') return Promise.resolve(null);
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cache.set(url, null);
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size); // throws if the canvas is CORS-tainted

        // Bucket pixels by coarse color, weighted by saturation*value, so a
        // vivid minority color (a logo, a face, a splash of color) wins over
        // a duller majority — closer to "the color of this cover" than a
        // flat average, which usually just comes out as muddy grey-brown.
        const buckets = new Map<string, { r: number; g: number; b: number; score: number; n: number }>();
        for (let i = 0; i < data.length; i += 4 * 3) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 200) continue;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const val = max / 255;
          if (val < 0.12 || val > 0.97) continue; // skip near-black/near-white pixels
          const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
          const score = sat * val;
          const bucket = buckets.get(key);
          if (bucket) {
            bucket.r += r;
            bucket.g += g;
            bucket.b += b;
            bucket.score += score;
            bucket.n += 1;
          } else {
            buckets.set(key, { r, g, b, score, n: 1 });
          }
        }

        let best: { r: number; g: number; b: number; score: number; n: number } | null = null;
        for (const bucket of buckets.values()) {
          if (!best || bucket.score > best.score) best = bucket;
        }
        if (!best) {
          cache.set(url, null);
          resolve(null);
          return;
        }
        const toHex = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
        const hex = `#${toHex(best.r / best.n)}${toHex(best.g / best.n)}${toHex(best.b / best.n)}`;
        cache.set(url, hex);
        resolve(hex);
      } catch {
        // Tainted canvas — this host doesn't allow cross-origin pixel reads.
        cache.set(url, null);
        resolve(null);
      }
    };
    img.onerror = () => {
      cache.set(url, null);
      resolve(null);
    };
    img.src = url;
  });
}
