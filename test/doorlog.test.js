// 미라 HQ 출입 기록 / 생체 신호
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/game/Room.js';
import { loadMap } from '../server/mapLoader.js';
import { TICK_MS, PHASES } from '../shared/constants.js';
import { ERR } from '../shared/protocol.js';
import { dirFromVector } from '../shared/movement.js';
import { fakeConn, teleport } from './helpers.js';

function setup(maps, mapId) {
  const clock = { t: 1_000_000 };
  const room = new Room({ code: 'LOGAAA', maps, now: () => clock.t, minPlayers: 2 });
  const players = [0, 1, 2, 3].map((i) => room.addPlayer({ name: `P${i}`, color: i, conn: fakeConn(), token: `t${i}` }).player);
  const advance = (ms) => { const end = clock.t + ms; while (clock.t < end) { clock.t = Math.min(end, clock.t + TICK_MS); room.tick(); } };
  room.handle(players[0], { t: 'setSettings', settings: { map: mapId, impostors: 1 } });
  for (const p of players) p.ready = true;
  room.handle(players[0], { t: 'start' });
  advance(6000);
  assert.equal(room.phase, PHASES.PLAYING);
  return { room, players, advance, clock };
}

/** (x0,y0) 에서 (x1,y1) 로 걷기 (실제 입력으로) */
function walk(ctx, p, x1, y1) {
  for (let i = 0; i < 200 && Math.hypot(p.x - x1, p.y - y1) > 6; i++) {
    p.inputQueue.push({ seq: ++p.queuedSeq, d: dirFromVector(x1 - p.x, y1 - p.y) });
    ctx.advance(34);
  }
}

test('출입 기록: 북쪽 센서를 지나가면 색과 센서가 기록되고, 장치 앞에서만 볼 수 있다', () => {
  const mira = loadMap('mira');
  const ctx = setup({ mira }, 'mira');
  const [a, b] = ctx.players.filter((p) => p.role === 'crewmate');
  const north = mira.sensors.find((s) => s.id === 'north');
  const cx = (north.x1 + north.x2) / 2;
  teleport(a, cx, north.y1 + 60);
  walk(ctx, a, cx, north.y1 - 60);   // 위로 통과
  walk(ctx, a, cx, north.y1 + 60);   // 3초 안에 다시 통과 → 같은 센서는 한 번만
  ctx.advance(3100);
  walk(ctx, a, cx, north.y1 - 60);   // 3초 뒤 다시 통과 → 기록
  assert.equal(ctx.room.doorLog.length, 2);
  assert.deepEqual(ctx.room.doorLog.map((e) => [e.color, e.sensor]), [[a.color, 'north'], [a.color, 'north']]);

  // 멀리서는 볼 수 없다
  assert.equal(ctx.room.handle(b, { t: 'doorlog' }), ERR.OUT_OF_RANGE);
  teleport(b, mira.doorLogConsole.x, mira.doorLogConsole.y + 60);
  b.conn.clear();
  assert.equal(ctx.room.handle(b, { t: 'doorlog' }), null);
  const m = b.conn.last((x) => x.t === 'doorLog');
  assert.equal(m.entries.length, 2);
  assert.equal(m.entries[0].color, a.color);
  assert.ok(!JSON.stringify(m).includes(a.id), '플레이어 id 는 보내지 않는다 (원작처럼 색만)');
  // 통신 방해 중 사용 불가
  ctx.room.sabotage.active = { kind: 'comms', mode: 'keypad', codes: {}, fixed: new Set() };
  assert.equal(ctx.room.handle(b, { t: 'doorlog' }), ERR.COMMS_DOWN);
});

test('출입 기록: 유령은 기록되지 않는다', () => {
  const mira = loadMap('mira');
  const ctx = setup({ mira }, 'mira');
  const a = ctx.players.find((p) => p.role === 'crewmate');
  a.alive = false;
  const s = mira.sensors.find((x) => x.id === 'north');
  const cx = (s.x1 + s.x2) / 2;
  teleport(a, cx, s.y1 + 60);
  walk(ctx, a, cx, s.y1 - 60);
  assert.equal(ctx.room.doorLog.length, 0);
});

test('생체 신호: 살아 있음 / 죽음 / 연결 끊김 (시체를 찾기 전에도 죽음이 보인다)', () => {
  const skeld = loadMap('skeld');
  // 생체 신호 장치가 있는 맵으로 시험 (원작에서는 폴러스 사무실)
  const map = { ...skeld, vitalsConsole: { x: skeld.spawn[0].x, y: skeld.spawn[0].y } };
  const ctx = setup({ skeld: map }, 'skeld');
  const [a, b, c] = ctx.players.filter((p) => p.role === 'crewmate');
  b.alive = false;            // 몰래 죽음 (아직 신고 안 됨)
  ctx.room.onDisconnect(c);   // 연결 끊김
  teleport(a, map.vitalsConsole.x, map.vitalsConsole.y);
  a.conn.clear();
  assert.equal(ctx.room.handle(a, { t: 'vitals' }), null);
  const v = a.conn.last((x) => x.t === 'vitals');
  const by = Object.fromEntries(v.players.map((p) => [p.color, p.state]));
  assert.equal(by[a.color], 'alive');
  assert.equal(by[b.color], 'dead');
  assert.equal(by[c.color], 'dc');
  // 장치가 없는 맵(스켈드 원본)에서는 사용할 수 없다
  const ctx2 = setup({ skeld }, 'skeld');
  assert.equal(ctx2.room.handle(ctx2.players[0], { t: 'vitals' }), ERR.INVALID_TARGET);
});
