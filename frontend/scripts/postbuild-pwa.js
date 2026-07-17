/*
 * Post-build PWA injection for `expo export --platform web`.
 *
 * Expo's Metro web export doesn't emit a manifest link, Apple install metas,
 * or service-worker registration — this script patches dist/index.html after
 * every build. Idempotent: safe to run twice.
 */
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');
const swPath = path.join(distDir, 'sw.js');

if (!fs.existsSync(indexPath)) {
  console.error('[pwa] dist/index.html not found — run `expo export --platform web` first.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

// The JS bundle's filename is content-hashed per build, so the service worker
// can't hardcode it. Without this, a device that opens the app for the very
// first time and goes offline before a *second* page load would have no
// bundle in cache at all — the SW would fall back to the cached "/" shell,
// but that shell's <script> tag would 404. Precache it explicitly here so
// even a first-ever visit is fully offline-capable after install.
const bundlePaths = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);

// Sora (the brand's display face) ships as content-hashed .ttf files
// under dist/assets — find them so the brand font actually renders offline
// instead of silently falling back to the system font.
function findFontPaths() {
  const assetsDir = path.join(distDir, 'assets');
  if (!fs.existsSync(assetsDir)) return [];
  const found = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/Sora.*\.ttf$/i.test(entry.name)) {
        found.push('/' + path.relative(distDir, full).split(path.sep).join('/'));
      }
    }
  })(assetsDir);
  return found;
}
const fontPaths = findFontPaths();

if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8');
  const baseShellMatch = sw.match(/const SHELL = \[([^\]]*)\];/);
  if (baseShellMatch) {
    const baseEntries = [...baseShellMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const merged = [...new Set([...baseEntries, ...bundlePaths, ...fontPaths])];
    sw = sw.replace(/const SHELL = \[[^\]]*\];/, `const SHELL = [${merged.map((e) => `'${e}'`).join(', ')}];`);
    fs.writeFileSync(swPath, sw);
    console.log(`[pwa] precached bundle: ${bundlePaths.join(', ')}`);
    console.log(`[pwa] precached ${fontPaths.length} brand font file(s)`);
  } else {
    console.warn('[pwa] could not find `const SHELL = [...]` in sw.js — bundle not precached.');
  }
} else {
  console.warn('[pwa] dist/sw.js not found — did the public/sw.js copy step run?');
}

if (html.includes('data-starhollow-pwa')) {
  console.log('[pwa] already injected — nothing to do.');
  process.exit(0);
}

const headSnippet = `
    <!-- data-starhollow-pwa -->
    <link rel="manifest" href="/manifest.json" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Starhollow" />
    <meta name="application-name" content="Starhollow" />
    <meta name="description" content="Your private media archive: pull audio and video in from any link or Telegram chat, name any song, stream your library anywhere." />
    <style data-starhollow-boot>
      html, body, #root { min-height: 100%; margin: 0; background: #07111B; }
      #starhollow-html-splash { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; background: radial-gradient(circle at 50% 42%, #143333 0, #07111B 52%, #03080F 100%); color: #EFF5F1; font-family: system-ui, sans-serif; }
      #starhollow-html-splash .sh-mark { display: block; width: 112px; height: 112px; margin: 0 auto; border-radius: 24px; animation: sh-breathe 2s ease-in-out infinite; filter: drop-shadow(0 0 30px rgba(99,214,181,.25)); }
      #starhollow-html-splash .sh-name { margin-top: 24px; font-size: 12px; font-weight: 700; letter-spacing: 6px; text-align: center; }
      #starhollow-html-splash .sh-note { margin-top: 10px; color: #7E948A; font-size: 11px; text-align: center; }
      @keyframes sh-breathe { 50% { transform: scale(1.08); opacity: .85; } }
      @media (prefers-reduced-motion: reduce) { #starhollow-html-splash .sh-mark { animation: none; } }
    </style>
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js').catch(function () {});
        });
      }
    </script>
`;

// iOS: draw edge-to-edge behind the notch/home bar (the app handles safe areas).
html = html.replace(
  /<meta name="viewport"[^>]*\/?>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />',
);
html = html.replace('</head>', `${headSnippet}</head>`);
html = html.replace(
  '<div id="root"></div>',
  '<div id="root"><div id="starhollow-html-splash" role="status" aria-label="Starhollow is loading"><div><img class="sh-mark" src="/icons/icon-192.png" alt="" /><div class="sh-name">STARHOLLOW</div><div class="sh-note">Opening your hollow…</div></div></div></div>',
);

fs.writeFileSync(indexPath, html);
console.log('[pwa] manifest link, Apple metas and service worker registration injected.');
