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

if (!fs.existsSync(indexPath)) {
  console.error('[pwa] dist/index.html not found — run `expo export --platform web` first.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

if (html.includes('data-wavecairn-pwa')) {
  console.log('[pwa] already injected — nothing to do.');
  process.exit(0);
}

const headSnippet = `
    <!-- data-wavecairn-pwa -->
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Wavecairn" />
    <meta name="application-name" content="Wavecairn" />
    <meta name="description" content="Your private media archive: pull audio and video in from any link or Telegram chat, name any song, stream your library anywhere." />
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

fs.writeFileSync(indexPath, html);
console.log('[pwa] manifest link, Apple metas and service worker registration injected.');
