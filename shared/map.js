// Tiled JSON(.tmj) 맵을 게임용 데이터로 바꾸고, 충돌 판정을 제공한다.
// 서버(server/mapLoader.js)와 클라이언트(client/js/net/mapLoader.js)가 같은 코드를 쓴다.
// 압축 해제(zlib)만 환경별로 다르므로 inflate 결과(Uint8Array)를 받아서 처리한다.

/**
 * @typedef {{x:number,y:number}} Point
 * @typedef {{name:string, rect:[number,number,number,number]}} Room
 * @typedef {{id:string, taskType:string, room:string, x:number, y:number}} TaskSpot
 * @typedef {{id:string, x:number, y:number, links:string[], room:string}} Vent
 * @typedef {{id:string, sabotage:string, x:number, y:number, room:string}} Console
 * @typedef {{id:string, room:string, rect:[number,number,number,number]}} Door
 */

/** Tiled 오브젝트 레이어의 properties 배열을 평범한 객체로 */
function props(o) {
  const out = {};
  for (const p of o.properties ?? []) out[p.name] = p.value;
  return out;
}

/**
 * @param {any} tmj Tiled JSON
 * @param {Uint8Array} collisionBytes collision 레이어 data 를 base64 디코드 + zlib 해제한 바이트
 */
export function parseMap(tmj, collisionBytes) {
  const gw = tmj.width, gh = tmj.height, cell = tmj.tilewidth;
  const grid = new Uint8Array(gw * gh);
  const view = new DataView(collisionBytes.buffer, collisionBytes.byteOffset, collisionBytes.byteLength);
  // 0 = 빈 곳, 1 = 벽(이동·시야 차단), 2 = 가구(이동만 차단)
  for (let i = 0; i < gw * gh; i++) grid[i] = Math.min(2, view.getUint32(i * 4, true));

  const mapProps = props(tmj);
  const layer = (name) => tmj.layers.find((l) => l.type === 'objectgroup' && l.name === name)?.objects ?? [];
  const rect = (o) => /** @type {[number,number,number,number]} */ ([o.x, o.y, o.x + o.width, o.y + o.height]);

  const rooms = layer('rooms').map((o) => ({ name: o.name, rect: rect(o) }));
  // 방 사각형이 겹치는 곳(예: 의무실 대각선 벽 옆 식당)은 더 작은 방을 우선한다
  const bySize = [...rooms].sort((a, b) => (a.rect[2] - a.rect[0]) * (a.rect[3] - a.rect[1]) - (b.rect[2] - b.rect[0]) * (b.rect[3] - b.rect[1]));
  const roomAt = (x, y) => bySize.find((r) => x >= r.rect[0] && x < r.rect[2] && y >= r.rect[1] && y < r.rect[3])?.name ?? 'Hallway';

  return {
    id: mapProps.mapId ?? 'skeld',
    kind: mapProps.kind ?? 'game',
    displayName: mapProps.displayName ?? mapProps.mapId ?? 'skeld',
    image: mapProps.image ?? 'assets/map/skeld.png',
    width: mapProps.imageWidth ?? gw * cell,
    height: mapProps.imageHeight ?? gh * cell,
    gw, gh, cell, grid,
    rooms,
    roomAt,
    spawn: layer('spawn').map((o) => ({ x: o.x, y: o.y })),
    emergency: layer('emergency').map((o) => ({ x: o.x, y: o.y, range: props(o).range ?? 170 }))[0],
    tasks: layer('tasks').map((o) => ({ id: o.name, taskType: props(o).taskType, room: props(o).room || roomAt(o.x, o.y), x: o.x, y: o.y })),
    vents: layer('vents').map((o) => ({ id: o.name, x: o.x, y: o.y, links: String(props(o).links ?? '').split(',').filter(Boolean), room: roomAt(o.x, o.y) })),
    consoles: layer('consoles').map((o) => ({ id: o.name, sabotage: props(o).sabotage, x: o.x, y: o.y, room: roomAt(o.x, o.y) })),
    doors: layer('doors').map((o) => ({ id: o.name, room: props(o).room, rect: rect(o) })),
    laptop: layer('laptop').map((o) => ({ x: o.x, y: o.y, range: props(o).range ?? 120 }))[0] ?? null,
  };
}

/** base64 → Uint8Array (Node/브라우저 공용) */
export function base64ToBytes(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * 충돌 세계: 정적 벽 + 닫힌 문
 * 플레이어는 발 위치를 중심으로 하는 원(radius)으로 판정한다.
 */
export class CollisionWorld {
  /** @param {ReturnType<typeof parseMap>} map */
  constructor(map) {
    this.map = map;
    this.doorCells = new Uint8Array(map.gw * map.gh);
    /** @type {Set<string>} */
    this.closedDoors = new Set();
  }

  setDoorClosed(doorId, closed) {
    if (closed === this.closedDoors.has(doorId)) return;
    const door = this.map.doors.find((d) => d.id === doorId);
    if (!door) return;
    if (closed) this.closedDoors.add(doorId); else this.closedDoors.delete(doorId);
    const { cell, gw } = this.map;
    const [x0, y0, x1, y1] = door.rect;
    for (let gy = Math.floor(y0 / cell); gy <= Math.floor((y1 - 1) / cell); gy++) {
      for (let gx = Math.floor(x0 / cell); gx <= Math.floor((x1 - 1) / cell); gx++) {
        this.doorCells[gy * gw + gx] += closed ? 1 : -1;
      }
    }
  }

  blockedCell(gx, gy) {
    const { gw, gh } = this.map;
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return true;
    const i = gy * gw + gx;
    return this.map.grid[i] !== 0 || this.doorCells[i] > 0;
  }

  /** 시야를 막는 칸인가 (벽과 닫힌 문. 가구는 시야를 막지 않는다) */
  opaqueCell(gx, gy) {
    const { gw, gh } = this.map;
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return true;
    const i = gy * gw + gx;
    return this.map.grid[i] === 1 || this.doorCells[i] > 0;
  }

  /** 좌표 (x,y)에 반지름 r 원을 놓을 수 있는가 */
  circleFree(x, y, r) {
    const { cell } = this.map;
    const gx0 = Math.floor((x - r) / cell), gx1 = Math.floor((x + r) / cell);
    const gy0 = Math.floor((y - r) / cell), gy1 = Math.floor((y + r) / cell);
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (!this.blockedCell(gx, gy)) continue;
        // 원과 셀 사각형의 최근접점 거리
        const nx = Math.max(gx * cell, Math.min(x, (gx + 1) * cell));
        const ny = Math.max(gy * cell, Math.min(y, (gy + 1) * cell));
        if ((nx - x) ** 2 + (ny - y) ** 2 < r * r) return false;
      }
    }
    return true;
  }

  /**
   * 벽을 따라 미끄러지는 이동. 한 번에 셀 절반 이상 움직이지 않도록 잘게 나눠서 터널링을 막는다.
   * @returns {{x:number,y:number}}
   */
  moveCircle(x, y, dx, dy, r) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (this.map.cell / 2)));
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (this.circleFree(x + sx, y + sy, r)) { x += sx; y += sy; continue; }
      if (sx && this.circleFree(x + sx, y, r)) x += sx;
      else if (sy && this.circleFree(x, y + sy, r)) y += sy;
    }
    return { x, y };
  }

  /** 두 점 사이 직선이 벽(또는 닫힌 문)에 막히는가 — 시야, 킬, 신고 판정용. 가구는 통과 */
  lineBlocked(x0, y0, x1, y1) {
    const { cell } = this.map;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / (cell / 2)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.opaqueCell(Math.floor((x0 + (x1 - x0) * t) / cell), Math.floor((y0 + (y1 - y0) * t) / cell))) return true;
    }
    return false;
  }
}
