// shared/maps/index.json: 클라이언트가 불러올 맵 목록 (id, 파일, 종류, 이름)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../shared/maps');
// 원작 순서: 대기실, 스켈드, 미라 HQ, 폴러스
const ORDER = ['lobby', 'skeld', 'mira', 'polus'];
const rank = (f) => { const i = ORDER.indexOf(f.replace('.tmj', '')); return i < 0 ? ORDER.length : i; };
const list = fs.readdirSync(dir).filter((f) => f.endsWith('.tmj')).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((file) => {
  const tmj = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const p = Object.fromEntries((tmj.properties ?? []).map((x) => [x.name, x.value]));
  return { id: p.mapId ?? file.replace('.tmj', ''), file, kind: p.kind ?? 'game', displayName: p.displayName ?? p.mapId };
});
fs.writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify(list, null, 2)}\n`);
console.log(list.map((m) => `${m.id}(${m.kind})`).join(', '));
