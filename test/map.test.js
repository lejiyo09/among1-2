import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMap } from '../server/mapLoader.js';
import { CollisionWorld } from '../shared/map.js';
import { PLAYER_RADIUS, USE_RANGE, VENT_RANGE } from '../shared/constants.js';

const map = loadMap('skeld');
const world = new CollisionWorld(map);

/** 스폰 지점에서 플레이어 원이 도달할 수 있는 셀 중심 집합 */
function reachableFrom(w, start) {
  const { cell, gw, gh } = map;
  const seen = new Uint8Array(gw * gh);
  const sx = Math.floor(start.x / cell), sy = Math.floor(start.y / cell);
  const q = [[sx, sy]];
  seen[sy * gw + sx] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || seen[ny * gw + nx]) continue;
      if (!w.circleFree(nx * cell + cell / 2, ny * cell + cell / 2, PLAYER_RADIUS)) continue;
      seen[ny * gw + nx] = 1;
      q.push([nx, ny]);
    }
  }
  return seen;
}
const reach = reachableFrom(world, map.spawn[0]);

function nearestReachable(x, y) {
  const { cell, gw } = map;
  let best = Infinity;
  for (let i = 0; i < reach.length; i++) {
    if (!reach[i]) continue;
    const cx = (i % gw) * cell + cell / 2, cy = Math.floor(i / gw) * cell + cell / 2;
    best = Math.min(best, Math.hypot(cx - x, cy - y));
  }
  return best;
}

test('맵 기본 구조', () => {
  assert.equal(map.rooms.length, 14);
  assert.equal(map.doors.length, 13, '원작 스켈드 문은 13개');
  assert.equal(map.vents.length, 14, '원작 스켈드 벤트는 14개');
  assert.ok(map.emergency);
  assert.ok(map.spawn.length >= 15);
});

test('모든 스폰 지점은 비어 있고 서로 연결된다', () => {
  for (const s of map.spawn) {
    assert.ok(world.circleFree(s.x, s.y, PLAYER_RADIUS), `spawn (${s.x},${s.y}) blocked`);
    assert.ok(nearestReachable(s.x, s.y) < map.cell, `spawn (${s.x},${s.y}) unreachable`);
  }
});

test('모든 방에 걸어서 갈 수 있다', () => {
  for (const r of map.rooms) {
    const [x0, y0, x1, y1] = r.rect;
    let ok = false;
    for (let y = y0; y < y1 && !ok; y += map.cell) for (let x = x0; x < x1 && !ok; x += map.cell) {
      if (reach[Math.floor(y / map.cell) * map.gw + Math.floor(x / map.cell)]) ok = true;
    }
    assert.ok(ok, `room ${r.name} unreachable`);
  }
});

test('모든 미션 지점은 사용 거리 안에서 접근 가능', () => {
  for (const t of map.tasks) {
    const d = nearestReachable(t.x, t.y);
    assert.ok(d <= USE_RANGE * 0.75, `task ${t.id} too far from walkable area (${d.toFixed(0)}px)`);
  }
});

test('모든 사보타주 콘솔과 비상 버튼은 접근 가능', () => {
  for (const c of map.consoles) {
    const d = nearestReachable(c.x, c.y);
    assert.ok(d <= USE_RANGE * 0.75, `console ${c.id} too far (${d.toFixed(0)}px)`);
  }
  const e = map.emergency;
  assert.ok(nearestReachable(e.x, e.y) <= e.range * 0.85, 'emergency button too far');
});

test('모든 벤트는 접근 가능하고 연결이 양방향', () => {
  const ids = new Set(map.vents.map((v) => v.id));
  for (const v of map.vents) {
    const d = nearestReachable(v.x, v.y);
    assert.ok(d <= VENT_RANGE * 0.6, `vent ${v.id} too far (${d.toFixed(0)}px)`);
    for (const l of v.links) {
      assert.ok(ids.has(l), `vent ${v.id} links unknown ${l}`);
      assert.ok(map.vents.find((o) => o.id === l).links.includes(v.id), `vent link ${v.id}->${l} not symmetric`);
    }
  }
});

test('문을 닫으면 통로가 완전히 막힌다', () => {
  for (const d of map.doors) {
    const w = new CollisionWorld(map);
    const before = reachableFrom(w, map.spawn[0]).reduce((a, b) => a + b, 0);
    w.setDoorClosed(d.id, true);
    const [x0, y0, x1, y1] = d.rect;
    // 문 사각형 안에는 플레이어가 설 수 없어야 한다
    for (let y = y0; y <= y1; y += 4) for (let x = x0; x <= x1; x += 4) {
      assert.ok(!w.circleFree(x, y, PLAYER_RADIUS), `door ${d.id} leaks at (${x},${y})`);
    }
    // 문 하나를 닫으면 도달 가능 영역이 바뀌지 않아야 정상(다른 길로 우회 가능) 이거나 줄어든다. 늘어나면 안 된다.
    const after = reachableFrom(w, map.spawn[0]).reduce((a, b) => a + b, 0);
    assert.ok(after <= before);
    // 문 양 끝은 벽에 붙어 있어야 틈으로 빠져나갈 수 없다
    const horizontal = x1 - x0 > y1 - y0;
    const ends = horizontal
      ? [[x0 - map.cell, (y0 + y1) / 2], [x1 + map.cell, (y0 + y1) / 2]]
      : [[(x0 + x1) / 2, y0 - map.cell], [(x0 + x1) / 2, y1 + map.cell]];
    for (const [ex, ey] of ends) {
      assert.ok(!world.circleFree(ex, ey, PLAYER_RADIUS), `door ${d.id} end (${ex},${ey}) not against a wall`);
    }
  }
});
