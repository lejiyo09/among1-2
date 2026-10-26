// 게임 맵 빌드 도구
// 입력: tools/<맵>-objects.mjs (수작업 배치 데이터) (+ 스켈드는 client/assets/map/skeld.png 의 투명도)
// 출력: shared/maps/<맵>.tmj (Tiled JSON 형식: 충돌 타일 레이어 + 오브젝트 레이어)
//       floors 를 쓰는 맵은 client/assets/map/<맵>-minimap.png (지도 화면용)도 만든다
//       tools/out/<맵>-debug.png (충돌 확인용 오버레이, --debug, 커밋하지 않음)
//
// 실행: npm run build:map            (모든 게임 맵)
//       node tools/build-map.mjs mira  (한 맵만)
// devDependency 인 pngjs 가 필요하다.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const name of names.length ? names : ['skeld', 'mira']) {
  const cfg = await import(pathToFileURL(path.join(root, `tools/${name}-objects.mjs`)).href);
  build(name, cfg);
}

function build(name, { CELL, WALL_FACE, OUTLINE, obstacles, openings, objects, floors, META, WIDTH, HEIGHT }) {
const meta = META ?? {
  mapId: 'skeld', displayName: '더 스켈드', image: 'assets/map/skeld.png',
  source: 'Skeld map art by Z3_NON (via github.com/jinhyuk558/web-amongus-clone)',
};
// 디버그 오버레이 배경: 스켈드는 원본 PNG, 그 밖의 맵은 tools/out/<맵>-preview.png (커밋하지 않음) 가 있으면 사용
const imgPath = floors ? path.join(root, `tools/out/${name}-preview.png`) : path.join(root, 'client/assets/map/skeld.png');
const img = fs.existsSync(imgPath) ? PNG.sync.read(fs.readFileSync(imgPath)) : null;
const W = WIDTH ?? img.width;
const H = HEIGHT ?? img.height;
const data = img?.data;
const GW = Math.ceil(W / CELL);
const GH = Math.ceil(H / CELL);
const grid = new Uint8Array(GW * GH);

if (floors) {
  // 바닥 목록 방식: 바닥 도형 안만 걸을 수 있고 나머지는 벽
  grid.fill(1);
  for (const f of floors) fillShape(f, 0);
} else {
  // 1) 픽셀 단위 "우주 공간"(투명) 마스크
  const voidPx = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) voidPx[i] = data[i * 4 + 3] < 128 ? 1 : 0;

  // 2) 벽 마스크: 투명 영역 + 투명 영역 아래 WALL_FACE 픽셀(위쪽 벽면) + 좌/우/아래 OUTLINE 픽셀(외곽선)
  const wallPx = new Uint8Array(W * H);
  // 이미지 바깥도 우주 공간으로 본다 (식당 윗벽은 이미지 맨 위에 붙어 있다)
  for (let x = 0; x < W; x++) {
    let sinceVoid = 0;
    for (let y = 0; y < H; y++) {
      if (voidPx[y * W + x]) sinceVoid = 0; else sinceVoid++;
      if (sinceVoid <= WALL_FACE) wallPx[y * W + x] = 1;
    }
    let untilVoid = 0; // 아래쪽 외곽선
    for (let y = H - 1; y >= 0; y--) {
      if (voidPx[y * W + x]) untilVoid = 0; else untilVoid++;
      if (untilVoid <= OUTLINE) wallPx[y * W + x] = 1;
    }
  }
  for (let y = 0; y < H; y++) {
    let d = 0;
    for (let x = 0; x < W; x++) { if (voidPx[y * W + x]) d = 0; else d++; if (d <= OUTLINE) wallPx[y * W + x] = 1; }
    d = 0;
    for (let x = W - 1; x >= 0; x--) { if (voidPx[y * W + x]) d = 0; else d++; if (d <= OUTLINE) wallPx[y * W + x] = 1; }
  }

  // 3) 셀 단위로 축약: 셀의 절반 이상이 벽이면 막힘
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      let n = 0, t = 0;
      for (let y = gy * CELL; y < Math.min(H, (gy + 1) * CELL); y++) {
        for (let x = gx * CELL; x < Math.min(W, (gx + 1) * CELL); x++) { t++; n += wallPx[y * W + x]; }
      }
      grid[gy * GW + gx] = n * 2 >= t ? 1 : 0;
    }
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
    { name: 'mapId', type: 'string', value: meta.mapId },
    { name: 'kind', type: 'string', value: 'game' },
    { name: 'displayName', type: 'string', value: meta.displayName },
    { name: 'image', type: 'string', value: meta.image },
    { name: 'imageWidth', type: 'int', value: W },
    { name: 'imageHeight', type: 'int', value: H },
    ...(meta.minimap ? [{ name: 'minimap', type: 'string', value: meta.minimap }] : []),
    ...(meta.commsMode ? [{ name: 'commsMode', type: 'string', value: meta.commsMode }] : []),
    ...(meta.reactorTime ? [{ name: 'reactorTime', type: 'int', value: meta.reactorTime }] : []),
    { name: 'source', type: 'string', value: meta.source },
  ],
  tilesets: [{ firstgid: 1, name: 'collision', tilewidth: CELL, tileheight: CELL, tilecount: 2, columns: 2, image: 'collision-tile.png', imagewidth: CELL * 2, imageheight: CELL }],
  layers: [],
};
let layerId = 1;
tmj.layers.push({ id: layerId++, type: 'imagelayer', name: 'background', image: `../../client/${meta.image}`, x: 0, y: 0, opacity: 1, visible: true });
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
fs.writeFileSync(path.join(root, `shared/maps/${meta.mapId}.tmj`), JSON.stringify(tmj));
console.log(`${meta.mapId}: grid ${GW}x${GH} cells of ${CELL}px, walls ${grid.filter((v) => v === 1).length}, furniture ${grid.filter((v) => v === 2).length}`);

// 6) 디버그 오버레이
if (floors) writeMinimap();
if (process.argv.includes('--debug') && img) {
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
  fs.writeFileSync(path.join(root, `tools/out/${name}-debug.png`), PNG.sync.write(out));
  console.log(`debug overlay: tools/out/${name}-debug.png`);
}

// 지도 화면용 미니맵: 원작 지도처럼 바닥은 반투명 하늘색, 테두리는 진한 선 (가로 1000px)
function writeMinimap() {
  const S = 1000 / W;
  const mw = Math.round(W * S), mh = Math.round(H * S);
  const png = new PNG({ width: mw, height: mh });
  const walk = (x, y) => {
    const gx = Math.floor(x / S / CELL), gy = Math.floor(y / S / CELL);
    return gx >= 0 && gy >= 0 && gx < GW && gy < GH && grid[gy * GW + gx] !== 1;
  };
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const i = (y * mw + x) * 4;
      const inside = walk(x + 0.5, y + 0.5);
      let edge = false;
      if (!inside) for (let d = 1; d <= 3 && !edge; d++) edge = walk(x + d, y) || walk(x - d, y) || walk(x, y + d) || walk(x, y - d);
      const c = inside ? [96, 170, 214, 150] : edge ? [26, 52, 74, 255] : [0, 0, 0, 0];
      png.data.set(c, i);
    }
  }
  const out = path.join(root, 'client', meta.minimap);
  fs.writeFileSync(out, PNG.sync.write(png));
  console.log(`minimap: ${path.relative(root, out)} (${mw}x${mh})`);
}
}
