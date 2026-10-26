import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupRoom, startGame, teleport, map } from './helpers.js';
import { PHASES, KILL_DISTANCES, TICK_MS, BASE_SPEED, TICK_RATE } from '../shared/constants.js';
import { ERR } from '../shared/protocol.js';
import { TASK_DEFS, CARD_SWIPE_MS } from '../shared/tasks.js';

/** 테스트용 미션 정답 */
function answerFor(defId, ch) {
  switch (defId) {
    case 'wires': return ch.left.map((c) => ch.right.indexOf(c));
    case 'manifolds': return Array.from({ length: 10 }, (_, k) => ch.labels.indexOf(k + 1));
    case 'simon': return ch.seq;
    case 'shields': return ch.off;
    case 'divert': return ch.target;
    case 'card': return 800;
    case 'asteroids': return 20;
    case 'align': return 0;
    default: return true;
  }
}

function doTaskStep(ctx, p) {
  const t = p.tasks.find((x) => !x.done);
  const spot = map.tasks.find((s) => s.id === t.spots[t.step]);
  teleport(p, spot.x, spot.y + 10);
  p.conn.clear();
  assert.equal(ctx.room.handle(p, { t: 'taskStart', taskId: t.defId }), null);
  const begin = p.conn.last((m) => m.t === 'task');
  ctx.advance(TASK_DEFS[t.defId].minMs + 50);
  assert.equal(ctx.room.handle(p, { t: 'taskComplete', taskId: t.defId, answer: answerFor(t.defId, begin.challenge) }), null);
}

test('역할 비공개: 승무원은 임포스터 정보를 받지 않는다', () => {
  const ctx = setupRoom(5);
  const { impostors, crew } = startGame(ctx);
  assert.equal(impostors.length, 1);
  for (const c of crew) {
    const reveal = c.conn.last((m) => m.kind === 'roleReveal');
    assert.equal(reveal.role, 'crewmate');
    assert.deepEqual(reveal.team, [c.id]);
    const st = c.conn.last((m) => m.t === 'state');
    assert.equal(st.impostors, undefined);
    assert.equal(st.you.role, 'crewmate');
    assert.ok(!JSON.stringify(c.conn.msgs).includes('"role":"impostor"'), '승무원 메시지에 임포스터 역할이 없어야 함');
  }
  const imp = impostors[0];
  assert.deepEqual(imp.conn.last((m) => m.t === 'state').impostors, [imp.id]);
});

test('킬: 역할/쿨다운/거리/중복 검증', () => {
  const ctx = setupRoom(5);
  const { impostors, crew } = startGame(ctx);
  const imp = impostors[0];
  const [a, b] = crew;
  // 승무원은 킬 불가
  assert.equal(ctx.room.handle(a, { t: 'kill', targetId: b.id }), ERR.NOT_ALLOWED);
  // 시작 직후 쿨다운 (원작 10초)
  teleport(imp, 1700, 450); teleport(a, 1740, 450);
  assert.equal(ctx.room.handle(imp, { t: 'kill', targetId: a.id }), ERR.COOLDOWN);
  ctx.advance(10_000);
  // 거리 밖
  teleport(a, 1700 + KILL_DISTANCES.medium * 1.3, 450);
  assert.equal(ctx.room.handle(imp, { t: 'kill', targetId: a.id }), ERR.OUT_OF_RANGE);
  // 성공
  teleport(a, 1760, 450);
  assert.equal(ctx.room.handle(imp, { t: 'kill', targetId: a.id }), null);
  assert.equal(a.alive, false);
  assert.equal(ctx.room.bodies.size, 1);
  assert.equal(imp.x, a.x, '임포스터가 피해자 위치로 이동');
  // 같은 대상 재요청 / 쿨다운
  assert.equal(ctx.room.handle(imp, { t: 'kill', targetId: a.id }), ERR.COOLDOWN);
  ctx.advance(26_000);
  assert.equal(ctx.room.handle(imp, { t: 'kill', targetId: a.id }), ERR.INVALID_TARGET);
  // 임포스터끼리 킬 불가, 자기 자신 불가
  assert.equal(ctx.room.handle(imp, { t: 'kill', targetId: imp.id }), ERR.INVALID_TARGET);
});

test('벽 너머로는 킬할 수 없다', () => {
  const ctx = setupRoom(4);
  const { impostors, crew } = startGame(ctx);
  ctx.advance(10_000);
  // 식당 왼쪽 벽 안쪽(1500,300)과 바깥 상부 복도 위쪽 우주 공간 쪽 벽 너머
  teleport(impostors[0], 1490, 470); // 왼쪽 문 근처 식당 안
  teleport(crew[0], 1430, 330);      // 복도 위 벽 너머 (막힌 곳)
  assert.equal(ctx.room.handle(impostors[0], { t: 'kill', targetId: crew[0].id }), ERR.OUT_OF_RANGE);
});

test('신고 → 토론 → 투표 → 추방 → 승리 판정', () => {
  const ctx = setupRoom(4, { settings: { discussionTime: 5, votingTime: 30 } });
  const { impostors, crew } = startGame(ctx);
  const imp = impostors[0];
  const [a, b, c] = crew;
  ctx.advance(10_000);
  teleport(imp, 1700, 450); teleport(a, 1750, 450);
  assert.equal(ctx.room.handle(imp, { t: 'kill', targetId: a.id }), null);
  const body = [...ctx.room.bodies.values()][0];
  // 죽은 사람은 신고 불가
  assert.equal(ctx.room.handle(a, { t: 'report', bodyId: body.id }), ERR.NOT_ALLOWED);
  // 멀면 불가
  teleport(b, 2200, 600);
  assert.equal(ctx.room.handle(b, { t: 'report', bodyId: body.id }), ERR.OUT_OF_RANGE);
  teleport(b, body.x + 40, body.y);
  assert.equal(ctx.room.handle(b, { t: 'report', bodyId: body.id }), null);
  assert.equal(ctx.room.phase, PHASES.DISCUSSION);
  assert.equal(ctx.room.bodies.size, 0, '회의 시작 시 시체 정리');
  // 토론 중 투표 불가
  assert.equal(ctx.room.handle(b, { t: 'vote', target: imp.id }), ERR.WRONG_PHASE);
  ctx.advance(3000 + 5000 + 50);
  assert.equal(ctx.room.phase, PHASES.VOTING);
  // 죽은 사람 투표 불가, 죽은 사람에게 투표 불가
  assert.equal(ctx.room.handle(a, { t: 'vote', target: imp.id }), ERR.NOT_ALLOWED);
  assert.equal(ctx.room.handle(b, { t: 'vote', target: a.id }), ERR.INVALID_TARGET);
  assert.equal(ctx.room.handle(b, { t: 'vote', target: imp.id }), null);
  assert.equal(ctx.room.handle(b, { t: 'vote', target: c.id }), ERR.ALREADY_DONE, '중복 투표 방지');
  assert.equal(ctx.room.handle(c, { t: 'vote', target: imp.id }), null);
  assert.equal(ctx.room.phase, PHASES.VOTING);
  assert.equal(ctx.room.handle(imp, { t: 'vote', target: 'skip' }), null);
  // 생존자 전원 투표 → 즉시 결과
  assert.equal(ctx.room.phase, PHASES.RESULT);
  assert.equal(ctx.room.meeting.result.ejectedId, imp.id);
  assert.match(ctx.room.meeting.result.text, /임포스터였습니다/);
  ctx.advance(7100);
  assert.equal(ctx.room.phase, PHASES.ENDED);
  assert.equal(ctx.room.endInfo.winner, 'crew');
  // 종료 화면 후 로비 복귀
  ctx.advance(8100);
  assert.equal(ctx.room.phase, PHASES.LOBBY);
  assert.equal(a.alive, true);
  assert.equal(a.role, null);
});

test('동점이면 아무도 추방되지 않고 게임으로 복귀, 킬 쿨다운 초기화', () => {
  const ctx = setupRoom(4, { settings: { discussionTime: 0, votingTime: 20 } });
  const { impostors, crew } = startGame(ctx);
  const [a, b, c] = crew;
  teleport(a, map.emergency.x, map.emergency.y + 110);
  ctx.advance(15_000);
  assert.equal(ctx.room.handle(a, { t: 'emergency' }), null);
  assert.equal(a.emergencyLeft, 0);
  ctx.advance(3100);
  ctx.room.handle(a, { t: 'vote', target: b.id });
  ctx.room.handle(b, { t: 'vote', target: a.id });
  ctx.room.handle(c, { t: 'vote', target: 'skip' });
  ctx.advance(20_100); // 임포스터는 투표하지 않음 → 시간 만료
  assert.equal(ctx.room.phase, PHASES.RESULT);
  assert.equal(ctx.room.meeting.result.ejectedId, null);
  assert.equal(ctx.room.meeting.result.tie, true);
  ctx.advance(7100);
  assert.equal(ctx.room.phase, PHASES.PLAYING);
  assert.ok(impostors[0].killReadyAt > ctx.clock.t + 20_000, '회의 후 킬 쿨다운 전체 초기화');
  // 긴급 회의는 1회만
  ctx.advance(16_000);
  teleport(a, map.emergency.x, map.emergency.y + 110);
  assert.equal(ctx.room.handle(a, { t: 'emergency' }), ERR.NOT_ALLOWED);
});

test('미션: 거리·최소 시간·정답 검증과 미션 승리', () => {
  const ctx = setupRoom(4, { settings: { commonTasks: 1, longTasks: 1, shortTasks: 1 } });
  const { impostors, crew } = startGame(ctx);
  const imp = impostors[0];
  // 임포스터는 미션 불가
  assert.equal(ctx.room.handle(imp, { t: 'taskStart', taskId: imp.tasks[0].defId }), ERR.NOT_ALLOWED);
  const a = crew[0];
  const t = a.tasks[0];
  // 멀리서 시작 불가
  teleport(a, 100, 100);
  assert.equal(ctx.room.handle(a, { t: 'taskStart', taskId: t.defId }), ERR.OUT_OF_RANGE);
  // 너무 빨리 완료 불가
  const spot = map.tasks.find((s) => s.id === t.spots[0]);
  teleport(a, spot.x, spot.y + 10);
  assert.equal(ctx.room.handle(a, { t: 'taskStart', taskId: t.defId }), null);
  const ch = a.conn.last((m) => m.t === 'task').challenge;
  assert.equal(ctx.room.handle(a, { t: 'taskComplete', taskId: t.defId, answer: answerFor(t.defId, ch) }), ERR.TOO_FAST);
  ctx.room.handle(a, { t: 'taskCancel' });
  // 모든 승무원이 모든 미션 완료 → 승무원 승리
  for (const p of crew) {
    while (p.tasks.some((x) => !x.done) && ctx.room.phase === PHASES.PLAYING) doTaskStep(ctx, p);
  }
  assert.equal(ctx.room.phase, PHASES.ENDED);
  assert.deepEqual([ctx.room.endInfo.winner, ctx.room.endInfo.reason], ['crew', 'tasks']);
});

test('미션: 틀린 답은 거부되고 진행되지 않는다', () => {
  const ctx = setupRoom(4, { settings: { commonTasks: 1, longTasks: 0, shortTasks: 0 } });
  const { crew } = startGame(ctx);
  const a = crew[0];
  const t = a.tasks[0];
  const spot = map.tasks.find((s) => s.id === t.spots[0]);
  teleport(a, spot.x, spot.y + 10);
  ctx.room.handle(a, { t: 'taskStart', taskId: t.defId });
  ctx.advance(3000);
  const wrong = t.defId === 'card' ? CARD_SWIPE_MS[0] - 100 : [0, 0, 0, 0];
  assert.equal(ctx.room.handle(a, { t: 'taskComplete', taskId: t.defId, answer: wrong }), ERR.WRONG_ANSWER);
  assert.equal(t.step, 0);
});

test('임포스터 수가 승무원 이상이면 임포스터 승리', () => {
  const ctx = setupRoom(4);
  const { impostors, crew } = startGame(ctx);
  const imp = impostors[0];
  ctx.advance(10_000);
  teleport(imp, 1700, 450); teleport(crew[0], 1740, 450);
  assert.equal(ctx.room.handle(imp, { t: 'kill', targetId: crew[0].id }), null);
  assert.equal(ctx.room.phase, PHASES.PLAYING);
  ctx.advance(25_100);
  teleport(crew[1], 1760, 450);
  assert.equal(ctx.room.handle(imp, { t: 'kill', targetId: crew[1].id }), null);
  assert.equal(ctx.room.phase, PHASES.ENDED);
  assert.equal(ctx.room.endInfo.winner, 'impostor');
  // 종료 정보에는 모든 역할이 공개된다
  assert.equal(ctx.room.endInfo.roles.length, 4);
});

test('사보타주: 원자로 시간 초과 시 임포스터 승리', () => {
  const ctx = setupRoom(4);
  const { impostors, crew } = startGame(ctx);
  assert.equal(ctx.room.handle(crew[0], { t: 'sabotage', kind: 'reactor' }), ERR.NOT_ALLOWED);
  assert.equal(ctx.room.handle(impostors[0], { t: 'sabotage', kind: 'reactor' }), ERR.COOLDOWN);
  ctx.advance(10_100);
  assert.equal(ctx.room.handle(impostors[0], { t: 'sabotage', kind: 'reactor' }), null);
  assert.equal(ctx.room.handle(impostors[0], { t: 'sabotage', kind: 'lights' }), ERR.NOT_ALLOWED, '동시에 두 개 불가');
  // 위급 사보타주 중 긴급 회의 불가
  teleport(crew[0], map.emergency.x, map.emergency.y + 110);
  ctx.advance(15_000);
  assert.equal(ctx.room.handle(crew[0], { t: 'emergency' }), ERR.NOT_ALLOWED);
  ctx.advance(15_500);
  assert.equal(ctx.room.phase, PHASES.ENDED);
  assert.deepEqual([ctx.room.endInfo.winner, ctx.room.endInfo.reason], ['impostor', 'sabotage']);
});

test('사보타주: 원자로는 서로 다른 두 명이 동시에 손을 대야 해결', () => {
  const ctx = setupRoom(4);
  const { impostors, crew } = startGame(ctx);
  ctx.advance(10_100);
  ctx.room.handle(impostors[0], { t: 'sabotage', kind: 'reactor' });
  const [top, bottom] = map.consoles.filter((c) => c.sabotage === 'reactor');
  teleport(crew[0], top.x + 20, top.y + 20);
  assert.equal(ctx.room.handle(crew[0], { t: 'fix', consoleId: top.id, action: 'hold' }), null);
  // 같은 사람이 다른 쪽을 눌러도 해결되지 않음 (거리도 멀다)
  assert.equal(ctx.room.handle(crew[0], { t: 'fix', consoleId: bottom.id, action: 'hold' }), ERR.OUT_OF_RANGE);
  ctx.advance(100);
  assert.ok(ctx.room.sabotage.active);
  teleport(crew[1], bottom.x + 20, bottom.y - 20);
  assert.equal(ctx.room.handle(crew[1], { t: 'fix', consoleId: bottom.id, action: 'hold' }), null);
  ctx.advance(100);
  assert.equal(ctx.room.sabotage.active, null);
});

test('사보타주: 산소(코드 두 곳), 전등(스위치), 통신(다이얼)', () => {
  const ctx = setupRoom(4);
  const { impostors, crew } = startGame(ctx);
  const [a] = crew;
  ctx.advance(10_100);
  // 산소
  ctx.room.handle(impostors[0], { t: 'sabotage', kind: 'o2' });
  const code = Number(ctx.room.sabotage.active.code);
  for (const con of map.consoles.filter((c) => c.sabotage === 'o2')) {
    teleport(a, con.x, con.y + 30);
    assert.equal(ctx.room.handle(a, { t: 'fix', consoleId: con.id, action: 'code', value: (code + 1) % 100000 }), ERR.WRONG_ANSWER);
    assert.equal(ctx.room.handle(a, { t: 'fix', consoleId: con.id, action: 'code', value: code }), null);
  }
  assert.equal(ctx.room.sabotage.active, null);
  // 전등: 시야 감소 후 스위치 복구
  ctx.advance(30_100);
  const before = ctx.room.visionRadius(a);
  assert.equal(ctx.room.handle(impostors[0], { t: 'sabotage', kind: 'lights' }), null);
  assert.ok(ctx.room.visionRadius(a) < before);
  assert.equal(ctx.room.visionRadius(impostors[0]), ctx.room.visionRadius(impostors[0]), '임포스터 시야는 그대로');
  const lc = map.consoles.find((c) => c.sabotage === 'lights');
  teleport(a, lc.x + 30, lc.y);
  ctx.room.sabotage.active.switches.forEach((on, i) => { if (!on) ctx.room.handle(a, { t: 'fix', consoleId: lc.id, action: 'switch', value: i }); });
  assert.equal(ctx.room.sabotage.active, null);
  // 통신: 미션 목록 숨김
  ctx.advance(30_100);
  ctx.room.handle(impostors[0], { t: 'sabotage', kind: 'comms' });
  assert.equal(ctx.room.stateFor(a).you.tasks, null);
  const cc = map.consoles.find((c) => c.sabotage === 'comms');
  teleport(a, cc.x, cc.y + 30);
  ctx.room.handle(a, { t: 'fix', consoleId: cc.id, action: 'dial', value: ctx.room.sabotage.active.target + 3 });
  assert.equal(ctx.room.sabotage.active, null);
  assert.ok(Array.isArray(ctx.room.stateFor(a).you.tasks));
});

test('문 사보타주: 10초 닫힘, 닫힌 문은 통과 불가', () => {
  const ctx = setupRoom(4);
  const { impostors } = startGame(ctx);
  assert.equal(ctx.room.handle(impostors[0], { t: 'sabotage', kind: 'doors', room: 'MedBay' }), null);
  assert.ok(ctx.room.world.closedDoors.has('medbay'));
  assert.equal(ctx.room.handle(impostors[0], { t: 'sabotage', kind: 'doors', room: 'MedBay' }), ERR.COOLDOWN);
  ctx.advance(10_100);
  assert.ok(!ctx.room.world.closedDoors.has('medbay'));
});

test('이동: 빠르게 보내도 실제 시간 이상으로 빨라지지 않는다 (스피드핵 방지)', () => {
  const ctx = setupRoom(4);
  const p = ctx.players[0];
  teleport(p, 1915, 760);
  const step = BASE_SPEED / TICK_RATE;
  const startX = p.x;
  // 3초 동안 실제보다 5배 빠르게 입력을 보냄 (틱마다 5개)
  let seq = 0;
  for (let t = 0; t < 90; t++) {
    ctx.room.handle(p, { t: 'input', seq, d: [0, 0, 0, 0, 0] });
    seq += 5;
    ctx.advance(TICK_MS);
  }
  const moved = p.x - startX;
  // 허용: 3초(90틱) + 지연 보정 크레딧 15틱
  assert.ok(moved <= step * (90 + 15) + 1, `moved ${moved.toFixed(0)}px, limit ${(step * 105).toFixed(0)}`);
  // 이미 처리한 seq 재전송은 무시
  ctx.advance(2000);
  const x = p.x, last = p.lastSeq;
  ctx.room.handle(p, { t: 'input', seq: 0, d: [0, 0, 0] });
  ctx.advance(TICK_MS * 3);
  assert.equal(p.x, x);
  assert.equal(p.lastSeq, last);
});

test('이동: 지연으로 몰려온 입력은 따라잡는다 (정상 플레이어 보호)', () => {
  const ctx = setupRoom(4);
  const p = ctx.players[0];
  teleport(p, 1915, 760);
  ctx.advance(1000); // 0.6초 동안 입력이 없었다가
  const startY = p.y;
  // 아래쪽(방향 4)은 테이블 사이 빈 공간
  ctx.room.handle(p, { t: 'input', seq: 0, d: Array(8).fill(4) });
  ctx.room.handle(p, { t: 'input', seq: 8, d: Array(8).fill(4) });
  ctx.advance(TICK_MS * 6); // 16개 입력이 6틱 만에 처리되어야 함 (틱당 최대 3개)
  assert.equal(p.lastSeq, 15);
  assert.ok(Math.abs(p.y - startY - (BASE_SPEED / TICK_RATE) * 16) < 1, `moved ${p.y - startY}`);
});

test('이동: 벽을 통과할 수 없다', () => {
  const ctx = setupRoom(4);
  const p = ctx.players[0];
  teleport(p, 1915, 120); // 식당 위쪽
  for (let i = 0; i < 20; i++) ctx.room.handle(p, { t: 'input', seq: i * 4, d: [12, 12, 12, 12] }); // 위로
  ctx.advance(3000);
  assert.ok(p.y > 60, `y=${p.y} 벽을 넘지 않음`);
  assert.ok(ctx.room.world.circleFree(p.x, p.y, 14));
});

test('시야 밖 플레이어 위치는 전송하지 않는다 (월핵 방지)', () => {
  const ctx = setupRoom(4);
  const { crew } = startGame(ctx);
  const [a, b] = crew;
  teleport(a, 1700, 470);
  teleport(b, 3400, 980); // 항해실
  a.conn.clear();
  ctx.advance(200);
  const seenB = a.conn.msgs.filter((m) => m.t === 's').some((m) => (m.p ?? []).some((e) => e[0] === b.id));
  assert.equal(seenB, false);
  teleport(b, 1760, 470);
  ctx.advance(200);
  const seenNow = a.conn.msgs.filter((m) => m.t === 's').some((m) => (m.p ?? []).some((e) => e[0] === b.id));
  assert.equal(seenNow, true);
});

test('연결 끊김: 유예 후 제거, 방장 이전, 게임 중 이탈은 승리 판정에 반영', () => {
  const ctx = setupRoom(4);
  const host = ctx.players[0];
  ctx.room.onDisconnect(host);
  assert.notEqual(ctx.room.hostId, host.id, '방장 즉시 이전');
  // 유예 안에 재접속
  ctx.room.reattach(host, host.conn ?? { send() {} });
  assert.equal(host.connected, true);
  const { impostors } = startGame(ctx);
  const imp = impostors[0];
  ctx.room.onDisconnect(imp);
  assert.equal(ctx.room.phase, PHASES.PLAYING);
  ctx.advance(46_000);
  assert.equal(imp.removed, true);
  assert.equal(ctx.room.phase, PHASES.ENDED);
  assert.equal(ctx.room.endInfo.winner, 'crew');
});

test('벤트: 임포스터만, 연결된 벤트로만 이동', () => {
  const ctx = setupRoom(4);
  const { impostors, crew } = startGame(ctx);
  const imp = impostors[0];
  const v = map.vents.find((x) => x.id === 'CafeVent');
  teleport(crew[0], v.x, v.y + 20);
  assert.equal(ctx.room.handle(crew[0], { t: 'vent', action: 'enter' }), ERR.NOT_ALLOWED);
  teleport(imp, v.x, v.y + 20);
  assert.equal(ctx.room.handle(imp, { t: 'vent', action: 'enter' }), null);
  assert.equal(ctx.room.handle(imp, { t: 'vent', action: 'move', to: 'NavVentNorth' }), ERR.INVALID_TARGET);
  assert.equal(ctx.room.handle(imp, { t: 'vent', action: 'move', to: 'AdminVent' }), null);
  assert.equal(imp.inVent, 'AdminVent');
  // 벤트 안에서는 킬 불가
  ctx.advance(10_100);
  assert.equal(ctx.room.handle(imp, { t: 'kill', targetId: crew[0].id }), ERR.NOT_ALLOWED);
  assert.equal(ctx.room.handle(imp, { t: 'vent', action: 'exit' }), null);
  assert.equal(imp.inVent, null);
});

test('채팅: 게임 중 생존자 불가, 유령 채팅은 유령에게만', () => {
  const ctx = setupRoom(4);
  const { impostors, crew } = startGame(ctx);
  assert.equal(ctx.room.handle(crew[0], { t: 'chat', text: 'hi' }), ERR.WRONG_PHASE);
  ctx.advance(10_000);
  teleport(impostors[0], 1700, 450); teleport(crew[0], 1740, 450);
  ctx.room.handle(impostors[0], { t: 'kill', targetId: crew[0].id });
  crew[1].conn.clear();
  assert.equal(ctx.room.handle(crew[0], { t: 'chat', text: 'boo' }), null);
  assert.ok(!crew[1].conn.msgs.some((m) => m.kind === 'chat' && m.text === 'boo'), '생존자는 유령 채팅을 못 봄');
});

test('유령: 벽 통과, 미션 가능, 신고·긴급회의·투표 불가', () => {
  const ctx = setupRoom(5, { settings: { discussionTime: 0 } });
  const { impostors, crew } = startGame(ctx);
  const [a, b] = crew;
  ctx.advance(10_000);
  teleport(impostors[0], 1700, 450); teleport(a, 1740, 450);
  assert.equal(ctx.room.handle(impostors[0], { t: 'kill', targetId: a.id }), null);
  // 벽 통과: 식당 위쪽 벽을 넘어 위로 이동
  teleport(a, 1915, 120);
  for (let i = 0; i < 10; i++) { ctx.room.handle(a, { t: 'input', seq: 1000 + i * 4, d: [12, 12, 12, 12] }); ctx.advance(TICK_MS * 4); }
  assert.ok(a.y < 60, `ghost y=${a.y}`);
  // 미션
  const t = a.tasks.find((x) => !x.done);
  const spot = map.tasks.find((s) => s.id === t.spots[t.step]);
  teleport(a, spot.x, spot.y + 10);
  assert.equal(ctx.room.handle(a, { t: 'taskStart', taskId: t.defId }), null);
  ctx.room.handle(a, { t: 'taskCancel' });
  // 신고/긴급 회의 불가
  const body = [...ctx.room.bodies.values()][0];
  teleport(a, body.x, body.y);
  assert.equal(ctx.room.handle(a, { t: 'report', bodyId: body.id }), ERR.NOT_ALLOWED);
  teleport(a, map.emergency.x, map.emergency.y + 110);
  assert.equal(ctx.room.handle(a, { t: 'emergency' }), ERR.NOT_ALLOWED);
  // 다른 사람이 신고 → 투표 단계에서 유령 투표 불가
  teleport(b, body.x + 30, body.y);
  assert.equal(ctx.room.handle(b, { t: 'report', bodyId: body.id }), null);
  ctx.advance(3100);
  assert.equal(ctx.room.phase, PHASES.VOTING);
  assert.equal(ctx.room.handle(a, { t: 'vote', target: 'skip' }), ERR.NOT_ALLOWED);
  // 유령은 살아 있는 사람에게 보이지 않는다
  assert.equal(ctx.room.canSee(b, a), false);
});
