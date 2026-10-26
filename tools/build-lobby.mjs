// 대기실(원작 드롭십) 맵 생성
// 원본: github.com/arizkhalid/among-us-clone (MIT) 의 frontend/public/assets/map/Lobby.png + lobby.json(충돌 타일)
//
// 사용법: node tools/build-lobby.mjs <arizkhalid 저장소 경로>
// 결과:   client/assets/map/lobby.png, shared/maps/lobby.tmj
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) { console.error('usage: node tools/build-lobby.mjs <path-to-arizkhalid-among-us-clone>'); process.exit(1); }
const dir = path.join(src, 'frontend/public/assets/map');

const SCALE = 1.3;   // 그림 1px → 월드 1.3px (스켈드 캐릭터 크기에 맞춤)
const CELL = 8;

const img = PNG.sync.read(fs.readFileSync(path.join(dir, 'Lobby.png')));
const tj = JSON.parse(fs.readFileSync(path.join(dir, 'lobby.json'), 'utf8'));
const col = tj.layers.find((l) => l.name === 'collisions').data;
const tw = tj.tilewidth;
// lobby.json 타일 격자와 그림 크기의 비율 (원본 프로젝트에서 그림 크기에 맞춰 늘려 썼다)
const kx = img.width / (tj.width * tw), ky = img.height / (tj.height * tw);

const W = Math.round(img.width * SCALE), H = Math.round(img.height * SCALE);
const GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);
const grid = new Uint8Array(GW * GH);
for (let gy = 0; gy < GH; gy++) {
  for (let gx = 0; gx < GW; gx++) {
    const px = (gx * CELL + CELL / 2) / SCALE, py = (gy * CELL + CELL / 2) / SCALE;
    const tx = Math.floor(px / (tw * kx)), ty = Math.floor(py / (tw * ky));
    const blocked = tx < 0 || ty < 0 || tx >= tj.width || ty >= tj.height || col[ty * tj.width + tx] !== 0;
    grid[gy * GW + gx] = blocked ? 1 : 0;
  }
}

// 오브젝트 (그림 좌표 × SCALE)
const S = (v) => Math.round(v * SCALE);
const spawn = Array.from({ length: 15 }, (_, i) => {
  // 바닥 격자 구역에 3줄로 배치
  const row = Math.floor(i / 5), colI = i % 5;
  return { name: `spawn${i}`, type: 'spawn', x: S(400 + colI * 105), y: S(500 + row * 52) };
});
const objects = {
  rooms: [{ name: 'Dropship', type: 'room', rect: [S(340), S(100), S(890), S(650)] }],
  spawn,
  // 원작 대기실 노트북: 색 바꾸기
  laptop: [{ name: 'laptop', type: 'laptop', x: S(645), y: S(420), props: { range: 120 } }],
};

let nextId = 1;
const toTiled = (o) => {
  const t = { id: nextId++, name: o.name, type: o.type, visible: true, rotation: 0 };
  if (o.rect) { const [x0, y0, x1, y1] = o.rect; Object.assign(t, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }); }
  else Object.assign(t, { x: o.x, y: o.y, width: 0, height: 0, point: true });
  if (o.props) t.properties = Object.entries(o.props).map(([name, value]) => ({ name, type: typeof value === 'number' ? 'int' : 'string', value }));
  return t;
};
const gids = Buffer.alloc(GW * GH * 4);
for (let i = 0; i < GW * GH; i++) gids.writeUInt32LE(grid[i], i * 4);
const tmj = {
  type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
  width: GW, height: GH, tilewidth: CELL, tileheight: CELL,
  properties: [
    { name: 'mapId', type: 'string', value: 'lobby' },
    { name: 'kind', type: 'string', value: 'lobby' },
    { name: 'displayName', type: 'string', value: '대기실' },
    { name: 'image', type: 'string', value: 'assets/map/lobby.png' },
    { name: 'imageWidth', type: 'int', value: W },
    { name: 'imageHeight', type: 'int', value: H },
    { name: 'source', type: 'string', value: 'Dropship lobby via github.com/arizkhalid/among-us-clone (MIT)' },
  ],
  tilesets: [{ firstgid: 1, name: 'collision', tilewidth: CELL, tileheight: CELL, tilecount: 2, columns: 2, image: 'collision-tile.png', imagewidth: CELL * 2, imageheight: CELL }],
  layers: [
    { id: 1, type: 'imagelayer', name: 'background', image: '../../client/assets/map/lobby.png', x: 0, y: 0, opacity: 1, visible: true },
    { id: 2, type: 'tilelayer', name: 'collision', width: GW, height: GH, x: 0, y: 0, opacity: 0.5, visible: true, encoding: 'base64', compression: 'zlib', data: zlib.deflateSync(gids, { level: 9 }).toString('base64') },
    ...Object.entries(objects).map(([name, list], i) => ({ id: 3 + i, type: 'objectgroup', name, draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: list.map(toTiled) })),
  ],
};
tmj.nextlayerid = tmj.layers.length + 1;
tmj.nextobjectid = nextId;
fs.copyFileSync(path.join(dir, 'Lobby.png'), path.join(root, 'client/assets/map/lobby.png'));
fs.writeFileSync(path.join(root, 'shared/maps/lobby.tmj'), JSON.stringify(tmj));
console.log(`lobby ${W}x${H}, grid ${GW}x${GH}, blocked ${grid.reduce((a, b) => a + b, 0)}`);
