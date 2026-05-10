#!/usr/bin/env node
/**
 * Regenerate the TLC PWA icon set.
 *
 * Composites the existing transparent TLC wordmark (public/tlc-logo.png) onto
 * a black rounded-square base with an orange outer glow, then rasterizes to
 * every size referenced by manifest.json + app/layout.tsx.
 *
 * Usage:  node scripts/generate-icons.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC = resolve(ROOT, 'public');
const ICONS = resolve(PUBLIC, 'icons');
mkdirSync(ICONS, { recursive: true });

const ORANGE = '#F15A24';
const ORANGE_RGB = { r: 0xF1, g: 0x5A, b: 0x24 };
const LOGO_PATH = resolve(PUBLIC, 'tlc-logo.png');
const MASTER = 1024; // master canvas for high-quality downsampling

const logoMeta = await sharp(LOGO_PATH).metadata();
console.log(`logo: ${logoMeta.width}x${logoMeta.height} (${logoMeta.format})`);

/**
 * Build a square-canvas SVG: solid black rounded-square with a soft orange
 * outer glow. The glow extends slightly outside the rounded square edge.
 *
 * `padding` sets the gap (0–1) between canvas edge and the rounded square,
 * leaving room for the glow halo. `radiusPct` sets the corner radius as a
 * fraction of the rounded square's side.
 */
function baseSvg({
  size = MASTER,
  padding = 0.06,
  radiusPct = 0.22,
  glow = true,
} = {}) {
  const inset = Math.round(size * padding);
  const sq = size - 2 * inset;
  const r = Math.round(sq * radiusPct);
  const blurStd = Math.round(size * 0.04);
  const glowOpacity = 0.55;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${blurStd}" />
    </filter>
  </defs>
  ${glow ? `<rect x="${inset}" y="${inset}" width="${sq}" height="${sq}" rx="${r}" ry="${r}" fill="${ORANGE}" opacity="${glowOpacity}" filter="url(#glow)" />` : ''}
  <rect x="${inset}" y="${inset}" width="${sq}" height="${sq}" rx="${r}" ry="${r}" fill="#000000" />
</svg>`;
}

/**
 * Render the base canvas (black rounded square + glow) to a Buffer at the
 * given size. SVG rasterization is one-shot (no double resize, no ringing).
 */
async function renderBase(size, opts = {}) {
  const svg = Buffer.from(baseSvg({ size, ...opts }));
  return sharp(svg).png().toBuffer();
}

/**
 * Composite the TLC wordmark onto the base canvas. `logoFracWidth` is the
 * fraction of the canvas the logo should span horizontally — smaller values
 * leave more padding (used for maskable icons where the system may crop the
 * outer 20%).
 */
async function buildIcon({
  size,
  logoFracWidth = 0.7,
  padding = 0.06,
  filename,
}) {
  const base = await renderBase(size, { padding });

  const targetW = Math.round(size * logoFracWidth);
  const logoBuf = await sharp(LOGO_PATH)
    .resize({ width: targetW, withoutEnlargement: false })
    .toBuffer();
  const lm = await sharp(logoBuf).metadata();

  const left = Math.round((size - lm.width) / 2);
  const top = Math.round((size - lm.height) / 2);

  const out = await sharp(base)
    .composite([{ input: logoBuf, left, top }])
    .png()
    .toBuffer();

  const outPath = resolve(ICONS, filename);
  writeFileSync(outPath, out);
  console.log(`✓ ${filename}  (${size}x${size})`);
  return outPath;
}

/* ---------- Standard "any" icons ---------- */
const standardSizes = [
  { size: 16,  name: 'favicon-16.png',          frac: 0.86, padding: 0.04 },
  { size: 32,  name: 'favicon-32.png',          frac: 0.84, padding: 0.05 },
  { size: 48,  name: 'favicon-48.png',          frac: 0.82, padding: 0.05 },
  { size: 72,  name: 'icon-72.png',             frac: 0.78, padding: 0.06 },
  { size: 96,  name: 'icon-96.png',             frac: 0.76, padding: 0.06 },
  { size: 128, name: 'icon-128.png',            frac: 0.74, padding: 0.06 },
  { size: 144, name: 'icon-144.png',            frac: 0.72, padding: 0.06 },
  { size: 152, name: 'icon-152.png',            frac: 0.72, padding: 0.06 },
  { size: 167, name: 'icon-167.png',            frac: 0.72, padding: 0.06 },
  { size: 180, name: 'icon-180.png',            frac: 0.72, padding: 0.06 },
  { size: 180, name: 'apple-touch-icon.png',    frac: 0.72, padding: 0.06 },
  { size: 192, name: 'icon-192.png',            frac: 0.72, padding: 0.06 },
  { size: 384, name: 'icon-384.png',            frac: 0.7,  padding: 0.06 },
  { size: 512, name: 'icon-512.png',            frac: 0.7,  padding: 0.06 },
];

for (const s of standardSizes) {
  await buildIcon({ size: s.size, logoFracWidth: s.frac, padding: s.padding, filename: s.name });
}

/* ---------- Maskable icons (Android adaptive) ----------
   Adaptive icons may be cropped to a circle/squircle; safe zone is the
   inner 80%. Logo sized at ~55% width keeps it well inside that mask. */
const maskable = [
  { size: 192, name: 'icon-192-maskable.png', frac: 0.55, padding: 0.0 },
  { size: 512, name: 'icon-512-maskable.png', frac: 0.55, padding: 0.0 },
];
for (const s of maskable) {
  await buildIcon({ size: s.size, logoFracWidth: s.frac, padding: s.padding, filename: s.name });
}

/* ---------- favicon.ico (16/32/48) via ImageMagick ----------
   Next 16 prefers app/favicon.ico over public/favicon.ico when both exist,
   so we write both — keeps `/favicon.ico` consistent regardless of which
   path Next.js routes through. */
const faviconPaths = [
  resolve(PUBLIC, 'favicon.ico'),
  resolve(ROOT, 'app', 'favicon.ico'),
];
for (const faviconOut of faviconPaths) {
  execFileSync(
    'convert',
    [
      resolve(ICONS, 'favicon-16.png'),
      resolve(ICONS, 'favicon-32.png'),
      resolve(ICONS, 'favicon-48.png'),
      faviconOut,
    ],
    { stdio: 'inherit' }
  );
  console.log(`✓ ${faviconOut.replace(ROOT + '/', '')}  (16/32/48 multi-layer)`);
}

/* ---------- iOS splash screens ----------
   Black background, centered glowing icon (the 512 master) at ~38% of the
   shorter side — comfortably visible on phones without crowding. */
const splashes = [
  { w: 640,  h: 1136, file: 'apple-splash-640-1136.png'  },
  { w: 750,  h: 1334, file: 'apple-splash-750-1334.png'  },
  { w: 1125, h: 2436, file: 'apple-splash-1125-2436.png' },
  { w: 1170, h: 2532, file: 'apple-splash-1170-2532.png' },
  { w: 1290, h: 2796, file: 'apple-splash-1290-2796.png' },
];

for (const s of splashes) {
  const iconSize = Math.round(Math.min(s.w, s.h) * 0.55);
  const iconBuf = await buildIconBuffer({
    size: iconSize,
    logoFracWidth: 0.7,
    padding: 0.06,
  });
  const left = Math.round((s.w - iconSize) / 2);
  const top = Math.round((s.h - iconSize) / 2);

  const splash = await sharp({
    create: {
      width: s.w,
      height: s.h,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([{ input: iconBuf, left, top }])
    .png()
    .toBuffer();

  writeFileSync(resolve(ICONS, s.file), splash);
  console.log(`✓ ${s.file}  (${s.w}x${s.h})`);
}

/** Same as buildIcon but returns the buffer without writing. */
async function buildIconBuffer({ size, logoFracWidth, padding }) {
  const base = await renderBase(size, { padding });
  const targetW = Math.round(size * logoFracWidth);
  const logoBuf = await sharp(LOGO_PATH)
    .resize({ width: targetW, withoutEnlargement: false })
    .toBuffer();
  const lm = await sharp(logoBuf).metadata();
  const left = Math.round((size - lm.width) / 2);
  const top = Math.round((size - lm.height) / 2);
  return sharp(base)
    .composite([{ input: logoBuf, left, top }])
    .png()
    .toBuffer();
}

/* ---------- Shortcut icons ----------
   Same black-bg-orange-glow base, with a simple white glyph centered. SVGs
   keep crisp edges at any size and stay tiny. */
const SHORTCUT_GLYPHS = {
  measure: `
    <!-- ruler glyph -->
    <g fill="none" stroke="#F15A24" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
      <rect x="36" y="86" width="184" height="84" rx="10" ry="10" fill="#F15A24" stroke="none"/>
      <g stroke="#000000" stroke-width="10">
        <line x1="60"  y1="86" x2="60"  y2="130"/>
        <line x1="92"  y1="86" x2="92"  y2="120"/>
        <line x1="124" y1="86" x2="124" y2="130"/>
        <line x1="156" y1="86" x2="156" y2="120"/>
        <line x1="188" y1="86" x2="188" y2="130"/>
      </g>
    </g>`,
  schedule: `
    <!-- calendar glyph -->
    <g fill="#F15A24" stroke="none">
      <rect x="44" y="64" width="168" height="148" rx="14" ry="14"/>
    </g>
    <g fill="#000000">
      <rect x="60" y="98" width="136" height="98" rx="6" ry="6"/>
    </g>
    <g fill="#F15A24" stroke="none">
      <rect x="78" y="44"  width="14" height="36" rx="6" ry="6"/>
      <rect x="164" y="44" width="14" height="36" rx="6" ry="6"/>
    </g>
    <g fill="#FFFFFF">
      <rect x="76"  y="116" width="20" height="20" rx="3"/>
      <rect x="118" y="116" width="20" height="20" rx="3"/>
      <rect x="160" y="116" width="20" height="20" rx="3"/>
      <rect x="76"  y="148" width="20" height="20" rx="3"/>
      <rect x="118" y="148" width="20" height="20" rx="3"/>
      <rect x="160" y="148" width="20" height="20" rx="3"/>
    </g>`,
  newjob: `
    <!-- plus glyph -->
    <g fill="#F15A24">
      <rect x="116" y="56"  width="24" height="144" rx="12"/>
      <rect x="56"  y="116" width="144" height="24" rx="12"/>
    </g>`,
};

async function buildShortcut({ name, glyph, size = 192 }) {
  const base = await renderBase(size, { padding: 0.06 });
  const glyphSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">${glyph}</svg>`;
  const glyphBuf = await sharp(Buffer.from(glyphSvg)).png().toBuffer();
  const out = await sharp(base)
    .composite([{ input: glyphBuf, left: 0, top: 0 }])
    .png()
    .toBuffer();
  const file = `shortcut-${name}.png`;
  writeFileSync(resolve(ICONS, file), out);
  console.log(`✓ ${file}  (${size}x${size})`);
}

await buildShortcut({ name: 'measure',  glyph: SHORTCUT_GLYPHS.measure  });
await buildShortcut({ name: 'schedule', glyph: SHORTCUT_GLYPHS.schedule });
await buildShortcut({ name: 'newjob',   glyph: SHORTCUT_GLYPHS.newjob   });

console.log('\nAll icons regenerated.');
