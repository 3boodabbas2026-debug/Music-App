// Generates every raster brand asset (favicon, PWA icons, Android adaptive
// icon layers, Capacitor icon/splash sources) from one vector definition of
// the Starhollow mark, so every surface stays pixel-consistent with the
// in-app <BrandMark /> component (src/components/ui/BrandMark.tsx).
//
// Run: node scripts/generate-brand-assets.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const INK = '#07111B'; // midnight navy-pine
const INK_DEEP = '#03080F';
const INK_LIFT = '#102B2B';
const STAR = '#E9CD7E'; // star gold
const CORE = '#FFF7DE';
const AURORA = '#63D6B5'; // aurora teal
const RIDGE_FAR = '#0B3028';
const RIDGE_NEAR = '#03120F';

// Mark geometry mirrors BrandMark.tsx's 0 0 100 100 viewBox exactly. The
// concentric grooves read as both a record and a signal travelling through a
// hollow; the long star remains legible when the mark is only 16px wide.
function markGroup({ star = 'url(#sh-star)', core = CORE, ridgeFar = RIDGE_FAR, ridgeNear = RIDGE_NEAR, glow = true, flat = false } = {}) {
  return `
    ${flat
      ? '<circle cx="50" cy="50" r="40" fill="none" stroke="#FFFFFF" stroke-width="3" opacity="0.42" />'
      : '<circle cx="50" cy="50" r="42" fill="url(#sh-disc)" stroke="url(#sh-rim)" stroke-width="1.35" />'}
    ${glow ? '<circle cx="50" cy="39" r="31" fill="url(#sh-glow)" />' : ''}
    <circle cx="50" cy="50" r="32" fill="none" stroke="${flat ? '#FFFFFF' : AURORA}" stroke-width="0.8" opacity="${flat ? '0.34' : '0.18'}" />
    <circle cx="50" cy="50" r="25" fill="none" stroke="${flat ? '#FFFFFF' : AURORA}" stroke-width="0.7" opacity="${flat ? '0.24' : '0.13'}" />
    <circle cx="50" cy="50" r="18" fill="none" stroke="${flat ? '#FFFFFF' : AURORA}" stroke-width="0.6" opacity="${flat ? '0.18' : '0.1'}" />
    <path d="M11,77 L27,54 L39,68 L50,57 L61,68 L73,54 L89,77 L89,89 L11,89 Z" fill="${ridgeFar}" ${flat ? 'opacity="0.68"' : ''} />
    <path d="M11,84 L28,67 L42,80 L50,73 L58,80 L72,67 L89,84 L89,91 L11,91 Z" fill="${ridgeNear}" />
    <path d="M50,10 C51.4,21 52.7,28 55.5,32 C61,34.3 68.5,35.8 78,37 C68.5,38.4 61,39.8 55.5,42 C52.8,47 51.5,55 50,67 C48.5,55 47.2,47 44.5,42 C39,39.8 31.5,38.4 22,37 C31.5,35.8 39,34.3 44.5,32 C47.3,28 48.6,21 50,10 Z" fill="${star}" />
    ${flat ? '' : `<path d="M50,27 C50.7,32.2 51.3,34.4 53,36.5 C55.6,37.3 57.8,37.8 61,38.5 C57.8,39.2 55.6,39.7 53,40.5 C51.4,42.7 50.8,45 50,50 C49.2,45 48.6,42.7 47,40.5 C44.4,39.7 42.2,39.2 39,38.5 C42.2,37.8 44.4,37.3 47,36.5 C48.7,34.4 49.3,32.2 50,27 Z" fill="${core}" opacity="0.92" />`}
    <circle cx="24" cy="24" r="1.45" fill="${flat ? '#FFFFFF' : STAR}" opacity="0.72" />
    <circle cx="76" cy="20" r="1.05" fill="${flat ? '#FFFFFF' : STAR}" opacity="0.5" />
  `;
}

const GLOW_DEFS = `<defs>
  <linearGradient id="sh-bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${INK_LIFT}" />
    <stop offset="48%" stop-color="${INK}" />
    <stop offset="100%" stop-color="${INK_DEEP}" />
  </linearGradient>
  <radialGradient id="sh-ambient" cx="50%" cy="47%" r="52%">
    <stop offset="0%" stop-color="${AURORA}" stop-opacity="0.24" />
    <stop offset="62%" stop-color="${AURORA}" stop-opacity="0.07" />
    <stop offset="100%" stop-color="${AURORA}" stop-opacity="0" />
  </radialGradient>
  <linearGradient id="sh-disc" x1="16" y1="12" x2="82" y2="90" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="#173A3B" stop-opacity="0.94" />
    <stop offset="55%" stop-color="#0A1B24" stop-opacity="0.97" />
    <stop offset="100%" stop-color="#050B12" stop-opacity="0.99" />
  </linearGradient>
  <linearGradient id="sh-rim" x1="14" y1="12" x2="86" y2="90" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="${CORE}" stop-opacity="0.3" />
    <stop offset="42%" stop-color="${AURORA}" stop-opacity="0.68" />
    <stop offset="100%" stop-color="${AURORA}" stop-opacity="0.12" />
  </linearGradient>
  <linearGradient id="sh-star" x1="50" y1="10" x2="50" y2="67" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="${CORE}" />
    <stop offset="44%" stop-color="${STAR}" />
    <stop offset="100%" stop-color="#C9953F" />
  </linearGradient>
  <radialGradient id="sh-glow" cx="50%" cy="39%" r="44%">
    <stop offset="0%" stop-color="${STAR}" stop-opacity="0.42" />
    <stop offset="100%" stop-color="${STAR}" stop-opacity="0" />
  </radialGradient>
</defs>`;

/** Flat square icon: ink background, mark scaled to ~64% and centered. Used for favicon / app icon / PWA "any" icons. */
function squareIconSvg({ cornerRadius = 0 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    ${GLOW_DEFS}
    <rect width="1024" height="1024" rx="${cornerRadius}" fill="url(#sh-bg)" />
    <circle cx="512" cy="492" r="430" fill="url(#sh-ambient)" />
    <g transform="translate(174 174) scale(6.76)">${markGroup()}</g>
  </svg>`;
}

/** Maskable PWA icon: same as square but mark pulled further in so OS masking (circle/squircle) never clips it. */
function maskableIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    ${GLOW_DEFS}
    <rect width="1024" height="1024" fill="url(#sh-bg)" />
    <circle cx="512" cy="492" r="430" fill="url(#sh-ambient)" />
    <g transform="translate(246 246) scale(5.32)">${markGroup()}</g>
  </svg>`;
}

/** Android adaptive icon foreground layer: transparent, mark kept inside the ~66% safe zone. */
function foregroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    ${GLOW_DEFS}
    <g transform="translate(246 246) scale(5.32)">${markGroup()}</g>
  </svg>`;
}

/** Android adaptive icon background layer: navy/aurora field, no mark. */
function backgroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    ${GLOW_DEFS}
    <rect width="1024" height="1024" fill="url(#sh-bg)" />
    <circle cx="512" cy="492" r="430" fill="url(#sh-ambient)" />
  </svg>`;
}

/** Android 13+ themed monochrome layer: single-colour silhouette, transparent bg (OS supplies the tint). */
function monochromeSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <g transform="translate(246 246) scale(5.32)">${markGroup({ star: '#FFFFFF', ridgeFar: '#FFFFFF', ridgeNear: '#FFFFFF', glow: false, flat: true })}</g>
  </svg>`;
}

/** Splash screen: ink canvas, mark small and centered — used for both the light and dark Capacitor splash. */
function splashSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
    ${GLOW_DEFS}
    <rect width="2732" height="2732" fill="url(#sh-bg)" />
    <circle cx="1366" cy="1366" r="860" fill="url(#sh-ambient)" />
    <g transform="translate(1066 1066) scale(6)">${markGroup()}</g>
  </svg>`;
}

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'assets');
const assetsCapacitor = path.join(root, 'assets-capacitor');
const publicIcons = path.join(root, 'public', 'icons');
const androidDrawableNoDpi = path.join(root, 'android', 'app', 'src', 'main', 'res', 'drawable-nodpi');

const jobs = [
  // App icon / favicon / splash foreground art
  [squareIconSvg({ cornerRadius: 0 }), 1024, path.join(assets, 'icon.png')],
  [squareIconSvg({ cornerRadius: 36 }), 196, path.join(assets, 'favicon.png')],
  [foregroundSvg(), 1024, path.join(assets, 'splash-icon.png')],

  // Android adaptive icon (expo prebuild + app.json android.adaptiveIcon)
  [foregroundSvg(), 1024, path.join(assets, 'android-icon-foreground.png')],
  [backgroundSvg(), 1024, path.join(assets, 'android-icon-background.png')],
  [monochromeSvg(), 1024, path.join(assets, 'android-icon-monochrome.png')],
  // Capacitor keeps a checked-in native project. Android 13's themed icon
  // therefore needs an explicit drawable in addition to Expo's source PNG.
  [monochromeSvg(), 1024, path.join(androidDrawableNoDpi, 'ic_launcher_monochrome.png')],

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
  // Keep a human-editable/vector deliverable beside the generated Expo PNG.
  fs.writeFileSync(path.join(assets, 'starhollow-icon.svg'), squareIconSvg());
  console.log('wrote', path.join('assets', 'starhollow-icon.svg'), '1024x1024 vector');
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
