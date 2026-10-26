// 미라 HQ 규칙: 발사대 시작, 맵별 미션, 통신 키패드 2곳, 원자로 45초, 전력 우회 2단계
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/game/Room.js';
import { loadMap } from '../server/mapLoader.js';
import { TICK_MS, PHASES } from '../shared/constants.js';
import { ERR } from '../shared/protocol.js';
import { TASK_DEFS, DIVERT_TARGETS } from '../shared/tasks.js';
import { fakeConn, teleport } from './helpers.js';

const maps = { skeld: loadMap('skeld'), mira: loadMap('mira') };
const mira = maps.mira;

function setup(n = 4) {
  const clock = { t: 1_000_000 };
  const room = new Room({ code: 'MIRAAA', maps, now: () => clock.t, minPlayers: 2 });
  const players = [];
  for (let i = 0; i < n; i++) {
    const { player } = room.addPlayer({ name: `P${i}`, color: i, conn: fakeConn(), token: `t${i}` });
    player.ready = true;
    players.push(player);
  }
  const advance = (ms) => { const end = clock.t + ms; while (clock.t < end) { clock.t = Math.min(end, clock.t + TICK_MS); room.tick(); } };
  assert.equal(room.handle(players[0], { t: 'setSettings', settings: { map: 'mira', impostors: 1 } }), null);
  for (const p of players) p.ready = true;
  assert.equal(room.handle(players[0], { t: 'start' }), null);
  advance(6000);
  assert.equal(room.phase, PHASES.PLAYING);
  return { room, players, advance, imp: players.find((p) => p.role === 'impostor'), crew: players.filter((p) => p.role === 'crewmate') };
}

test('미라: 발사대에서 시작하고 미라 미션만 받는다', () => {
  const { room, players } = setup();
  assert.equal(room.map.id, 'mira');
  const launchpad = mira.rooms.find((r) => r.name === 'Launchpad').rect;
  for (const p of players) {
    assert.ok(p.x >= launchpad[0] && p.x < launchpad[2] && p.y >= launchpad[1] && p.y < launchpad[3], `시작 위치 (${p.x},${p.y})`);
    for (const t of p.tasks) {
      const def = TASK_DEFS[t.defId];
      assert.ok(!def.maps || def.maps.includes('mira'), `${t.defId} 는 미라 미션이 아님`);
      for (const s of t.spots) assert.ok(mira.tasks.some((x) => x.id === s));
    }
  }
});

test('미라: 통신 사보타주는 두 키패드에 각 코드를 넣어야 해결', () => {
  const { room, advance, imp, crew } = setup();
  advance(10_100);
  assert.equal(room.handle(imp, { t: 'sabotage', kind: 'comms' }), null);
  const a = room.sabotage.active;
  assert.equal(a.mode, 'keypad');
  const cons = mira.consoles.filter((c) => c.sabotage === 'comms');
  assert.equal(cons.length, 2);
  for (const c of cons) {
    teleport(crew[0], c.x, c.y + 40);
    assert.equal(room.handle(crew[0], { t: 'fix', consoleId: c.id, action: 'code', value: (Number(a.codes[c.id]) + 1) % 10000 }), ERR.WRONG_ANSWER);
    assert.equal(room.handle(crew[0], { t: 'fix', consoleId: c.id, action: 'code', value: Number(a.codes[c.id]) }), null);
  }
  assert.equal(room.sabotage.active, null);
});

test('미라: 원자로 붕괴는 45초', () => {
  const { room, advance, imp } = setup();
  advance(10_100);
  assert.equal(room.handle(imp, { t: 'sabotage', kind: 'reactor' }), null);
  advance(44_000);
  assert.equal(room.phase, PHASES.PLAYING);
  advance(1_500);
  assert.equal(room.phase, PHASES.ENDED);
  assert.equal(room.endInfo.reason, 'sabotage');
});

test('미라: 전력 우회 스위치는 전력을 받을 방을 가리킨다', () => {
  const { room, crew } = setup();
  const p = crew[0];
  const spots = ['divert_reactor', 'accept_office'];
  p.tasks = [{ defId: 'divertMira', spots, step: 0, done: false }];
  const s = mira.tasks.find((x) => x.id === spots[0]);
  teleport(p, s.x + 40, s.y + 30);
  assert.equal(room.handle(p, { t: 'taskStart', taskId: 'divertMira' }), null);
  assert.equal(p.activeTask.challenge.target, DIVERT_TARGETS.mira.indexOf('Office'));
});
