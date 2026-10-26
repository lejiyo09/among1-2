import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMap, base64ToBytes } from '../shared/map.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** shared/maps/<name>.tmj 를 읽어 게임 맵 데이터로 변환 */
export function loadMap(name = 'skeld') {
  const tmj = JSON.parse(fs.readFileSync(path.join(root, 'shared/maps', `${name}.tmj`), 'utf8'));
  const layer = tmj.layers.find((l) => l.name === 'collision');
  const bytes = layer.compression === 'zlib' ? zlib.inflateSync(base64ToBytes(layer.data)) : base64ToBytes(layer.data);
  return parseMap(tmj, new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}

/** shared/maps 의 모든 .tmj 를 읽는다 → { id: 맵 } */
export function loadAllMaps() {
  const dir = path.join(root, 'shared/maps');
  const maps = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.tmj')).sort()) {
    const m = loadMap(f.replace(/\.tmj$/, ''));
    maps[m.id] = m;
  }
  return maps;
}
