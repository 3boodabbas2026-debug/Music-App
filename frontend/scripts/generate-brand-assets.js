// Generates every raster brand asset (favicon, PWA icons, Android adaptive
// icon layers, Capacitor icon/splash sources) from one vector definition of
// the Wavecairn mark, so every surface stays pixel-consistent with the
// in-app <BrandMark /> component (src/components/ui/BrandMark.tsx).
//
// Run: node scripts/generate-brand-assets.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const INK = '#0C0D10';
const SIGNAL = '#E0954F';
const STONE = '#F5F2EA';
const WAVE = '#46A69C';

// Mark geometry mirrors BrandMark.tsx's 0 0 100 100 viewBox exactly.
function markGroup({ top = SIGNAL, body = STONE, ripple = WAVE, rippleOpacity = 0.55, bodyOpacity = 0.88 } = {}) {
  return `
    <ellipse cx="50" cy="90" rx="30" ry="5" stroke="${ripple}" stroke-width="2.5" fill="none" opacity="${rippleOpacity}" />
    <rect x="18" y="61" width="64" height="20" rx="10" fill="${body}" />
    <rect x="27" y="39" width="46" height="18" rx="9" fill="${body}" opacity="${bodyOpacity}" />
    <rect x="35" y="19" width="30" height="16" rx="8" fill="${top}" />
  `;
}

/** Flat square icon: ink background, mark scaled to ~64% and centered. Used for favicon / app icon / PWA "any" icons. */
function squareIconSvg({ cornerRadius = 0 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <rect width="1024" height="1024" rx="${cornerRadius}" fill="${INK}" />
    <g transform="translate(184 184) scale(6.56)">${markGroup()}</g>
  </svg>`;
}

/** Maskable PWA icon: same as square but mark pulled further in so OS masking (circle/squircle) never clips it. */
function maskableIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <rect width="1024" height="1024" fill="${INK}" />
    <g transform="translate(276 276) scale(4.72)">${markGroup()}</g>
  </svg>`;
}

/** Android adaptive icon foreground layer: transparent, mark kept inside the ~66% safe zone. */
function foregroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <g transform="translate(276 276) scale(4.72)">${markGroup()}</g>
  </svg>`;
}

/** Android adaptive icon background layer: solid ink, no mark. */
function backgroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <rect width="1024" height="1024" fill="${INK}" />
  </svg>`;
}

/** Android 13+ themed monochrome layer: single-colour silhouette, transparent bg (OS supplies the tint). */
function monochromeSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <g transform="translate(276 276) scale(4.72)">${markGroup({ top: '#FFFFFF', body: '#FFFFFF', ripple: '#FFFFFF', rippleOpacity: 0.6, bodyOpacity: 0.85 })}</g>
  </svg>`;
}

/** Splash screen: ink canvas, mark small and centered — used for both the light and dark Capacitor splash. */
function splashSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
    <rect width="2732" height="2732" fill="${INK}" />
    <g transform="translate(1166 1166) scale(4)">${markGroup()}</g>
  </svg>`;
}

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'assets');
const assetsCapacitor = path.join(root, 'assets-capacitor');
const publicIcons = path.join(root, 'public', 'icons');

const jobs = [
  // App icon / favicon / splash foreground art
  [squareIconSvg({ cornerRadius: 0 }), 1024, path.join(assets, 'icon.png')],
  [squareIconSvg({ cornerRadius: 36 }), 196, path.join(assets, 'favicon.png')],
  [foregroundSvg(), 1024, path.join(assets, 'splash-icon.png')],

  // Android adaptive icon (expo prebuild + app.json android.adaptiveIcon)
  [foregroundSvg(), 1024, path.join(assets, 'android-icon-foreground.png')],
  [backgroundSvg(), 1024, path.join(assets, 'android-icon-background.png')],
  [monochromeSvg(), 1024, path.join(assets, 'android-icon-monochrome.png')],

  // Capacitor asset source set (consumed by `npx capacitor-assets generate`)
  [squareIconSvg({ cornerRadius: 0 }), 1024, path.join(assetsCapacitor, 'icon-only.png')],
  [foregroundSvg(), 1024, path.join(assetsCapacitor, 'icon-foreground.png')],
  [backgroundSvg(), 1024, path.join(assetsCapacitor, 'icon-background.png')],
  [splashSvg(), 2732, path.join(assetsCapacitor, 'splash.png')],
  [splashSvg(), 2732, path.join(assetsCapacitor, 'splash-dark.png')],

  // PWA manifest icon set
  [squareIconSvg({ cornerRadius: 0 }), 192, path.join(publicIcons, 'icon-192.png')],
  [squareIconSvg({ cornerRadius: 0 }), 512, path.join(publicIcons, 'icon-512.png')],
  [maskableIconSvg(), 192, path.join(publicIcons, 'icon-maskable-192.png')],
  [maskableIconSvg(), 512, path.join(publicIcons, 'icon-maskable-512.png')],
  [squareIconSvg({ cornerRadius: 36 }), 180, path.join(publicIcons, 'apple-touch-icon.png')],
];

async function main() {
  for (const [svg, size, outPath] of jobs) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
    console.log('wrote', path.relative(root, outPath), `${size}x${size}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
