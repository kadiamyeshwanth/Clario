// Generates the Clario app icon set from the website logo mark
// (finance-tracker/public/clario.svg). Usage, from mobile/:
//   npm i --no-save sharp && node scripts/make-icons.cjs assets
const sharp = require('sharp');
const path = require('path');
const out = process.argv[2];

const MARK = 'M 228 0 C 172.772 0 128 44.772 128 100 L 128 0 L 0 0 L 0 28 C 0 83.228 44.772 128 100 128 L 0 128 L 0 256 L 28 256 C 83.228 256 128 211.228 128 156 L 128 256 L 256 256 L 256 228 C 256 172.772 211.228 128 156 128 L 256 128 L 256 0 Z';
const ORANGE = '#E85002';
const DARK = '#0E0E0E';

/** An SVG canvas of `size` px with the mark centred at `scale` of the width. */
const svg = ({ size, scale, color, bg }) => {
  const m = size * scale;
  const off = (size - m) / 2;
  const k = m / 256;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}
    <path d="${MARK}" fill="${color}" transform="translate(${off} ${off}) scale(${k})"/>
  </svg>`);
};

const write = (name, opts) => sharp(svg(opts)).png().toFile(path.join(out, name)).then(() => console.log('wrote', name));

(async () => {
  // iOS / generic: full-bleed square, no transparency (Apple masks the corners).
  await write('icon.png', { size: 1024, scale: 0.56, color: ORANGE, bg: DARK });
  // Android adaptive: launchers crop to a circle/squircle using only the centre
  // ~66%, so the mark sits well inside that safe zone.
  await write('android-icon-foreground.png', { size: 1024, scale: 0.36, color: ORANGE });
  await write('android-icon-background.png', { size: 1024, scale: 0, color: DARK, bg: DARK });
  // Android 13+ themed icons: single colour, the system tints it.
  await write('android-icon-monochrome.png', { size: 1024, scale: 0.36, color: '#FFFFFF' });
  // Splash: the mark alone; the splash background is set to the brand dark in app.json.
  await write('splash-icon.png', { size: 1024, scale: 0.8, color: ORANGE });
  // Notification (status bar) icon: Android requires a white silhouette on transparent.
  await write('notification-icon.png', { size: 96, scale: 0.75, color: '#FFFFFF' });
  // Web favicon for the Expo web build.
  await write('favicon.png', { size: 48, scale: 0.86, color: ORANGE });
})().catch((e) => { console.error(e); process.exit(1); });
