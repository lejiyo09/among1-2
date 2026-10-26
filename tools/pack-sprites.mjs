// 크루원 스프라이트 프레임을 하나의 아틀라스(PNG + Phaser JSON Hash)로 합친다.
// 원본: github.com/arizkhalid/among-us-clone 의 frontend/public/assets/sprites/Base (원작 추출 프레임, 마스크 색 형식)
//
// 사용법: node tools/pack-sprites.mjs <arizkhalid 저장소 경로>
// 결과:   client/assets/sprites/crewmate.png, crewmate.json
// (이미 결과물이 저장소에 들어 있으므로 평소에는 실행할 필요가 없다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRepo = process.argv[2];
if (!srcRepo) { console.error('usage: node tools/pack-sprites.mjs <path-to-arizkhalid-among-us-clone>'); process.exit(1); }
const base = path.join(srcRepo, 'frontend/public/assets/sprites/Base');
const SCALE = 2; // 1/2 로 축소 (게임에서 약 0.8배로 표시)

const pad = (n) => String(n).padStart(4, '0');
const frames = [
  ['idle', 'idle.png'],
  ...Array.from({ length: 12 }, (_, i) => [`walk${i + 1}`, `Walk${pad(i + 1)}.png`]),
  ...Array.from({ length: 42 }, (_, i) => [`dead${i + 1}`, `Dead${pad(i + 1)}.png`]),
  ...Array.from({ length: 48 }, (_, i) => [`ghost${i + 1}`, `ghost/ghost${pad(i + 1)}.png`]),
  ...Array.from({ length: 7 }, (_, i) => [`vent${i + 1}`, `Vent${pad(i + 1)}.png`]),
];

function downscale(png, f) {
  const w = Math.ceil(png.width / f), h = Math.ceil(png.height / f);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
      const sx = x * f + dx, sy = y * f + dy;
      if (sx >= png.width || sy >= png.height) continue;
      const i = (sy * png.width + sx) * 4;
      const al = png.data[i + 3];
      r += png.data[i] * al; g += png.data[i + 1] * al; b += png.data[i + 2] * al; a += al; n++;
    }
    const o = (y * w + x) * 4;
    out.data[o] = a ? r / a : 0; out.data[o + 1] = a ? g / a : 0; out.data[o + 2] = a ? b / a : 0; out.data[o + 3] = a / n;
  }
  return out;
}

const images = frames.map(([name, file]) => ({ name, png: downscale(PNG.sync.read(fs.readFileSync(path.join(base, file))), SCALE) }));

// 선반(shelf) 배치
const MAXW = 1024;
let x = 0, y = 0, rowH = 0;
for (const im of images) {
  if (x + im.png.width > MAXW) { x = 0; y += rowH + 1; rowH = 0; }
  im.x = x; im.y = y;
  x += im.png.width + 1;
  rowH = Math.max(rowH, im.png.height);
}
const W = MAXW, H = y + rowH;
const atlas = new PNG({ width: W, height: H });
const json = { frames: {}, meta: { app: 'tools/pack-sprites.mjs', image: 'crewmate.png', format: 'RGBA8888', size: { w: W, h: H }, scale: 1 } };
for (const im of images) {
  PNG.bitblt(im.png, atlas, 0, 0, im.png.width, im.png.height, im.x, im.y);
  json.frames[im.name] = {
    frame: { x: im.x, y: im.y, w: im.png.width, h: im.png.height }, rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: im.png.width, h: im.png.height }, sourceSize: { w: im.png.width, h: im.png.height },
  };
}
const outDir = path.join(root, 'client/assets/sprites');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'crewmate.png'), PNG.sync.write(atlas));
fs.writeFileSync(path.join(outDir, 'crewmate.json'), JSON.stringify(json));
console.log(`packed ${images.length} frames into ${W}x${H}`);
