// 연습 모드(원작 자유 플레이): 혼자 시작, 더미 크루원, 역할 선택, 승패 없음, 다른 사람 입장 불가
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/game/Room.js';
import { loadMap } from '../server/mapLoader.js';
import { TICK_MS, PHASES, TIMINGS } from '../shared/constants.js';
import { ERR } from '../shared/protocol.js';
import { fakeConn, teleport } from './helpers.js';

const maps = { skeld: loadMap('skeld'), mira: loadMap('mira') };

function setup(settings = {}) {
  const clock = { t: 1_000_000 };
  const room = new Room({ code: 'SOLOAA', maps, now: () => clock.t, minPlayers: 1, practice: true });
  const { player: me } = room.addPlayer({ name: '나', color: 0, conn: fakeConn(), token: 'tok' });
  const advance = (ms) => { const end = clock.t + ms; while (clock.t < end) { clock.t = Math.min(end, clock.t + TICK_MS); room.tick(); } };
  assert.equal(room.handle(me, { t: 'setSettings', settings }), null);
  return { room, me, advance, clock };
}

test('연습: 다른 사람은 들어올 수 없다', () => {
  const { room } = setup();
  assert.equal(room.addPlayer({ name: '남', color: 1, conn: fakeConn(), token: 't2' }).error, ERR.ROOM_FULL);
});

test('연습: 혼자 시작하면 더미가 생기고, 고른 역할을 받는다', () => {
  const { room, me, advance } = setup({ map: 'mira', practiceRole: 'impostor' });
  assert.equal(room.handle(me, { t: 'start' }), null);
  advance(6000);
  assert.equal(room.phase, PHASES.PLAYING);
  const dummies = [...room.players.values()].filter((p) => p.dummy);
  assert.equal(dummies.length, 6, '미라 HQ 더미 6명 (원작 DummyLocations)');
  assert.equal(me.role, 'impostor');
  assert.ok(dummies.every((d) => d.role === 'crewmate' && d.tasks.length === 0));
  // 더미를 하나 남길 때까지는 계속된다
  advance(TIMINGS.firstKillCooldown * 1000 + 100);
  for (const d of dummies.slice(0, 2)) {
    teleport(me, d.x + 10, d.y);
    me.killReadyAt = 0;
    assert.equal(room.handle(me, { t: 'kill', targetId: d.id }), null);
  }
  assert.equal(room.phase, PHASES.PLAYING);
  // 신고 → 회의, 더미는 건너뛰기 투표 → 내가 투표하면 바로 결과 → 다시 게임
  const body = [...room.bodies.values()][0];
  teleport(me, body.x + 10, body.y);
  assert.equal(room.handle(me, { t: 'report', bodyId: body.id }), null);
  advance(TIMINGS.meetingIntroMs + room.settings.discussionTime * 1000 + 100);
  assert.equal(room.phase, PHASES.VOTING);
  assert.equal(room.handle(me, { t: 'vote', target: 'skip' }), null);
  assert.equal(room.phase, PHASES.RESULT);
  advance(TIMINGS.ejectMs + 100);
  assert.equal(room.phase, PHASES.PLAYING);
  // 끝내기 → 대기실, 더미 사라짐
  assert.equal(room.handle(me, { t: 'endPractice' }), null);
  assert.equal(room.phase, PHASES.LOBBY);
  assert.equal(room.players.size, 1);
});

test('연습: 임포스터가 더미를 줄여 수가 같아지면 임포스터 승리', () => {
  const { room, me, advance } = setup({ map: 'skeld', practiceRole: 'impostor' });
  room.handle(me, { t: 'start' });
  advance(6000);
  const dummies = [...room.players.values()].filter((p) => p.dummy);
  for (const d of dummies.slice(0, -1)) {
    teleport(me, d.x + 10, d.y);
    me.killReadyAt = 0;
    assert.equal(room.handle(me, { t: 'kill', targetId: d.id }), null);
  }
  assert.equal(room.phase, PHASES.ENDED);
  assert.deepEqual([room.endInfo.winner, room.endInfo.reason], ['impostor', 'crew_outnumbered']);
});

test('연습: 승무원으로 미션을 모두 끝내면 승무원 승리', () => {
  const { room, me, advance } = setup({ map: 'skeld', practiceRole: 'crewmate' });
  room.handle(me, { t: 'start' });
  advance(6000);
  assert.equal(room.phase, PHASES.PLAYING, '임포스터가 없어도 바로 끝나지 않는다');
  for (const t of me.tasks) { t.step = t.spots.length; t.done = true; }
  room.checkWinNow();
  assert.equal(room.phase, PHASES.ENDED);
  assert.deepEqual([room.endInfo.winner, room.endInfo.reason], ['crew', 'tasks']);
});

test('연습: 승무원으로 사보타주 시간이 지나도 지지 않고, 나가면 방이 닫힌다', () => {
  const { room, me, advance } = setup({ map: 'skeld', practiceRole: 'crewmate' });
  room.handle(me, { t: 'start' });
  advance(6000);
  assert.equal(me.role, 'crewmate');
  assert.ok([...room.players.values()].some((p) => p.dummy));
  assert.ok(me.tasks.length > 0);
  room.sabotage.cooldownUntil = 0;
  room.sabotage.start(me, 'reactor', null, room.now());
  advance(31_000);
  assert.equal(room.phase, PHASES.PLAYING);
  assert.equal(room.sabotage.active, null);
  room.removePlayer(me, 'left');
  assert.ok(room.closed);
});

test('일반 방에서는 연습 설정·끝내기를 쓸 수 없다', () => {
  const room = new Room({ code: 'NORMAL', maps, minPlayers: 2 });
  const { player } = room.addPlayer({ name: 'A', color: 0, conn: fakeConn(), token: 'x' });
  room.handle(player, { t: 'setSettings', settings: { practiceRole: 'impostor' } });
  assert.equal(room.settings.practiceRole, undefined);
  assert.equal(room.handle(player, { t: 'endPractice' }), ERR.NOT_ALLOWED);
});
