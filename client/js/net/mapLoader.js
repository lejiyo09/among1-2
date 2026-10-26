// 브라우저에서 Tiled 맵(.tmj)을 읽는다. collision 레이어는 zlib 압축 → DecompressionStream('deflate')
import { parseMap, base64ToBytes } from '../../shared/map.js';

export async function loadMap(name = 'skeld') {
  const tmj = await fetch(`shared/maps/${name}.tmj`).then((r) => {
    if (!r.ok) throw new Error(`map ${name}: HTTP ${r.status}`);
    return r.json();
  });
  const layer = tmj.layers.find((l) => l.name === 'collision');
  let bytes = base64ToBytes(layer.data);
  if (layer.compression === 'zlib') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return parseMap(tmj, bytes);
}

/** shared/maps/index.json 에 있는 모든 맵 → { id: 맵 } */
export async function loadAllMaps() {
  const list = await fetch('shared/maps/index.json').then((r) => r.json());
  const maps = await Promise.all(list.map((m) => loadMap(m.file.replace(/\.tmj$/, ''))));
  return Object.fromEntries(maps.map((m) => [m.id, m]));
}
