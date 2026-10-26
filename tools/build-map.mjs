// 스켈드 맵 빌드 도구
// 입력: client/assets/map/skeld.png (배경 이미지) + tools/skeld-objects.mjs (수작업 배치 데이터)
// 출력: shared/maps/skeld.tmj (Tiled JSON 형식: 충돌 타일 레이어 + 오브젝트 레이어)
//       tools/out/skeld-debug.png (충돌 확인용 오버레이, 커밋하지 않음)
//
// 실행: npm run build:map   (devDependency인 pngjs가 필요하다)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { CELL, WALL_FACE, OUTLINE, obstacles, openings, objects } from './skeld-objects.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const img = PNG.sync.read(fs.readFileSync(path.join(root, 'client/assets/map/skeld.png')));
const { width: W, height: H, data } = img;
const GW = Math.ceil(W / CELL);
const GH = Math.ceil(H / CELL);

// 1) 픽셀 단위 "우주 공간"(투명) 마스크
const voidPx = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) voidPx[i] = data[i * 4 + 3] < 128 ? 1 : 0;

// 2) 벽 마스크: 투명 영역 + 투명 영역 아래 WALL_FACE 픽셀(위쪽 벽면) + 좌/우/아래 OUTLINE 픽셀(외곽선)
const wallPx = new Uint8Array(W * H);
for (let x = 0; x < W; x++) {
  let sinceVoid = Infinity;
  for (let y = 0; y < H; y++) {
    if (voidPx[y * W + x]) sinceVoid = 0; else sinceVoid++;
    if (sinceVoid <= WALL_FACE) wallPx[y * W + x] = 1;
  }
  let untilVoid = Infinity; // 아래쪽 외곽선
  for (let y = H - 1; y >= 0; y--) {
    if (voidPx[y * W + x]) untilVoid = 0; else untilVoid++;
    if (untilVoid <= OUTLINE) wallPx[y * W + x] = 1;
  }
}
for (let y = 0; y < H; y++) {
  let d = Infinity;
  for (let x = 0; x < W; x++) { if (voidPx[y * W + x]) d = 0; else d++; if (d <= OUTLINE) wallPx[y * W + x] = 1; }
  d = Infinity;
  for (let x = W - 1; x >= 0; x--) { if (voidPx[y * W + x]) d = 0; else d++; if (d <= OUTLINE) wallPx[y * W + x] = 1; }
}

// 3) 셀 단위로 축약: 셀의 절반 이상이 벽이면 막힘
const grid = new Uint8Array(GW * GH);
for (let gy = 0; gy < GH; gy++) {
  for (let gx = 0; gx < GW; gx++) {
    let n = 0, t = 0;
    for (let y = gy * CELL; y < Math.min(H, (gy + 1) * CELL); y++) {
      for (let x = gx * CELL; x < Math.min(W, (gx + 1) * CELL); x++) { t++; n += wallPx[y * W + x]; }
    }
    grid[gy * GW + gx] = n * 2 >= t ? 1 : 0;
  }
}

// 4) 수작업 장애물(테이블, 상자, 엔진 등)과 통로(자동 판정이 잘못 막은 곳) 적용
function fillShape(shape, value) {
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const cx = gx * CELL + CELL / 2, cy = gy * CELL + CELL / 2;
      if (inside(shape, cx, cy)) grid[gy * GW + gx] = value;
    }
  }
}
function inside(s, x, y) {
  if (s.circle) { const [cx, cy, r] = s.circle; return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; }
  if (s.ellipse) { const [cx, cy, rx, ry] = s.ellipse; return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1; }
  if (s.rect) { const [x0, y0, x1, y1] = s.rect; return x >= x0 && x < x1 && y >= y0 && y < y1; }
  if (s.poly) { // ray casting
    let c = false; const p = s.poly;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i], [xj, yj] = p[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  return false;
}
// 1 = 벽 (이동·시야 모두 막음), 2 = 가구 (이동만 막고 시야는 통과 — 원작처럼 테이블은 그림자를 만들지 않는다)
for (const o of openings) fillShape(o, 0);
for (const o of obstacles) fillShape(o, 2);

// 5) Tiled JSON 작성 (collision 레이어: base64 + zlib, gid 1 = 벽, gid 2 = 가구)
const gids = Buffer.alloc(GW * GH * 4);
for (let i = 0; i < GW * GH; i++) gids.writeUInt32LE(grid[i], i * 4);
let nextId = 1;
const toTiled = (o) => {
  const t = { id: nextId++, name: o.name ?? '', type: o.type ?? '', visible: true, rotation: 0 };
  if (o.rect) { const [x0, y0, x1, y1] = o.rect; Object.assign(t, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }); }
  else if (o.poly) { Object.assign(t, { x: 0, y: 0, width: 0, height: 0, polygon: o.poly.map(([x, y]) => ({ x, y })) }); }
  else { Object.assign(t, { x: o.x, y: o.y, width: 0, height: 0, point: true }); }
  const props = Object.entries(o.props ?? {}).map(([name, value]) => ({
    name, type: typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : typeof value === 'boolean' ? 'bool' : 'string', value,
  }));
  if (props.length) t.properties = props;
  return t;
};
const tmj = {
  type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
  width: GW, height: GH, tilewidth: CELL, tileheight: CELL, nextlayerid: 1, nextobjectid: 1,
  properties: [
    { name: 'imageWidth', type: 'int', value: W },
    { name: 'imageHeight', type: 'int', value: H },
    { name: 'source', type: 'string', value: 'Skeld map art by Z3_NON (via github.com/jinhyuk558/web-amongus-clone)' },
  ],
  tilesets: [{ firstgid: 1, name: 'collision', tilewidth: CELL, tileheight: CELL, tilecount: 2, columns: 2, image: 'collision-tile.png', imagewidth: CELL * 2, imageheight: CELL }],
  layers: [],
};
let layerId = 1;
tmj.layers.push({ id: layerId++, type: 'imagelayer', name: 'background', image: '../../client/assets/map/skeld.png', x: 0, y: 0, opacity: 1, visible: true });
tmj.layers.push({
  id: layerId++, type: 'tilelayer', name: 'collision', width: GW, height: GH, x: 0, y: 0, opacity: 0.5, visible: true,
  encoding: 'base64', compression: 'zlib', data: zlib.deflateSync(gids, { level: 9 }).toString('base64'),
});
for (const [layerName, list] of Object.entries(objects)) {
  tmj.layers.push({ id: layerId++, type: 'objectgroup', name: layerName, draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: list.map(toTiled) });
}
tmj.nextlayerid = layerId;
tmj.nextobjectid = nextId;
fs.mkdirSync(path.join(root, 'shared/maps'), { recursive: true });
fs.writeFileSync(path.join(root, 'shared/maps/skeld.tmj'), JSON.stringify(tmj));
console.log(`grid ${GW}x${GH} cells of ${CELL}px, walls ${grid.filter((v) => v === 1).length}, furniture ${grid.filter((v) => v === 2).length}`);

// 6) 디버그 오버레이
if (process.argv.includes('--debug')) {
  const out = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = data[i + 3] / 255;
      let r = data[i] * a, g = data[i + 1] * a, b = data[i + 2] * a;
      const v = grid[Math.floor(y / CELL) * GW + Math.floor(x / CELL)];
      if (v === 1) { r = r * 0.45 + 140; g *= 0.45; b *= 0.45; }
      else if (v === 2) { r *= 0.45; g *= 0.45; b = b * 0.45 + 140; }
      out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = 255;
    }
  }
  const mark = (x, y, col, s = 7) => {
    for (let dy = -s; dy <= s; dy++) for (let dx = -s; dx <= s; dx++) {
      const px = Math.round(x + dx), py = Math.round(y + dy);
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const i = (py * W + px) * 4; out.data[i] = col[0]; out.data[i + 1] = col[1]; out.data[i + 2] = col[2];
    }
  };
  const colors = { tasks: [255, 255, 0], vents: [0, 255, 0], spawn: [0, 255, 255], consoles: [255, 128, 0], doors: [255, 0, 255] };
  for (const [layerName, list] of Object.entries(objects)) {
    for (const o of list) {
      const col = colors[layerName] ?? [255, 255, 255];
      if (o.rect) { const [x0, y0, x1, y1] = o.rect; for (let x = x0; x < x1; x += 3) { mark(x, y0, col, 1); mark(x, y1, col, 1); } for (let y = y0; y < y1; y += 3) { mark(x0, y, col, 1); mark(x1, y, col, 1); } }
      else if (o.x !== undefined) mark(o.x, o.y, col);
    }
  }
  fs.mkdirSync(path.join(root, 'tools/out'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools/out/skeld-debug.png'), PNG.sync.write(out));
  console.log('debug overlay: tools/out/skeld-debug.png');
}
