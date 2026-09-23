// Generates the source icon/splash images for @capacitor/assets. The art is a
// 2048-style tile board (colored rounded tiles), so the home-screen icon reads
// as an ordinary number-puzzle game. Pure rectangles — no font dependency.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const CREAM = '#faf8ef';
const BOARD = '#bbada0';
const TILES = ['#eee4da', '#f2b179', '#edcf72', '#f59563']; // 2, 8, 128, 16 vibe

// A 2x2 tile board centered in a `size` box, occupying `board` px.
function board(size: number, boardPx: number): string {
  const ox = (size - boardPx) / 2;
  const oy = (size - boardPx) / 2;
  const pad = boardPx * 0.05;
  const gap = boardPx * 0.04;
  const tile = (boardPx - 2 * pad - gap) / 2;
  const rx = tile * 0.09;
  const cell = (r: number, c: number, color: string) => {
    const x = ox + pad + c * (tile + gap);
    const y = oy + pad + r * (tile + gap);
    return `<rect x="${x}" y="${y}" width="${tile}" height="${tile}" rx="${rx}" fill="${color}"/>`;
  };
  return `
    <rect x="${ox}" y="${oy}" width="${boardPx}" height="${boardPx}" rx="${boardPx * 0.06}" fill="${BOARD}"/>
    ${cell(0, 0, TILES[0])}${cell(0, 1, TILES[1])}${cell(1, 0, TILES[2])}${cell(1, 1, TILES[3])}
  `;
}

function svg(size: number, bg: string | null, boardPx: number): string {
  const background = bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${background}${board(size, boardPx)}</svg>`;
}

async function png(svgStr: string, out: string) {
  await sharp(Buffer.from(svgStr)).png().toFile(out);
  console.log('wrote', out);
}

await mkdir('assets', { recursive: true });

// App icon (full-bleed; iOS applies its own rounded mask).
await png(svg(1024, CREAM, 800), 'assets/icon-only.png');
// Android adaptive: solid background + centered foreground within the safe zone.
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: CREAM } })
  .png()
  .toFile('assets/icon-background.png');
console.log('wrote assets/icon-background.png');
await png(svg(1024, null, 620), 'assets/icon-foreground.png'); // transparent bg, safe-zone board
// Splash (light + dark) with a smaller centered board.
await png(svg(2732, CREAM, 900), 'assets/splash.png');
await png(svg(2732, '#1a1a1a', 900), 'assets/splash-dark.png');

console.log('done');
