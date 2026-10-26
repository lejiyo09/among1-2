import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignRoles, tallyVotes, checkWin } from '../server/game/rules.js';
import { makeChallenge, validateAnswer, createTaskAssigner, buildTask } from '../server/game/tasks.js';
import { DEFAULT_SETTINGS, maxImpostorsFor } from '../shared/constants.js';
import { TASK_DEFS } from '../shared/tasks.js';
import { parseClientMessage, sanitizeName } from '../shared/protocol.js';
import { map } from './helpers.js';

test('역할 배정: 인원별 임포스터 수 제한', () => {
  const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`);
  const count = (roles) => [...roles.values()].filter((r) => r === 'impostor').length;
  assert.equal(count(assignRoles(ids(4), 3)), 1);
  assert.equal(count(assignRoles(ids(6), 2)), 1);
  assert.equal(count(assignRoles(ids(7), 2)), 2);
  assert.equal(count(assignRoles(ids(10), 3)), 3);
  assert.equal(count(assignRoles(ids(2), 1)), 1);
  assert.equal(maxImpostorsFor(15), 3);
  // 무작위성: 100번 중 같은 사람만 계속 임포스터가 되지는 않는다
  const seen = new Set();
  for (let i = 0; i < 100; i++) for (const [id, r] of assignRoles(ids(5), 1)) if (r === 'impostor') seen.add(id);
  assert.ok(seen.size >= 4);
});

test('투표 집계: 최다 득표, 동점, 건너뛰기', () => {
  const v = (pairs) => new Map(pairs);
  assert.equal(tallyVotes(v([['a', 'c'], ['b', 'c'], ['c', 'a']])).ejectedId, 'c');
  const tie = tallyVotes(v([['a', 'c'], ['b', 'a']]));
  assert.equal(tie.ejectedId, null);
  assert.equal(tie.tie, true);
  const skip = tallyVotes(v([['a', 'skip'], ['b', 'skip'], ['c', 'a']]));
  assert.equal(skip.ejectedId, null);
  assert.equal(skip.skipped, true);
  // 건너뛰기와 특정인이 동률이면 추방 없음
  assert.equal(tallyVotes(v([['a', 'skip'], ['b', 'c']])).ejectedId, null);
  assert.equal(tallyVotes(v([])).ejectedId, null);
});

test('승리 판정', () => {
  const P = (role, alive = true, removed = false) => ({ role, alive, removed });
  const none = { done: 0, total: 10 };
  assert.equal(checkWin([P('impostor'), P('crewmate'), P('crewmate')], none), null);
  assert.deepEqual(checkWin([P('impostor'), P('crewmate')], none), { winner: 'impostor', reason: 'crew_outnumbered' });
  assert.deepEqual(checkWin([P('impostor', false), P('crewmate'), P('crewmate')], none), { winner: 'crew', reason: 'impostors_eliminated' });
  assert.deepEqual(checkWin([P('impostor'), P('crewmate'), P('crewmate'), P('crewmate')], { done: 10, total: 10 }), { winner: 'crew', reason: 'tasks' });
  // 이탈한 플레이어는 셈에서 빠진다
  assert.deepEqual(checkWin([P('impostor', false, true), P('crewmate'), P('crewmate')], none).winner, 'crew');
  assert.deepEqual(checkWin([P('impostor'), P('crewmate', false, true), P('crewmate'), P('crewmate', false)], none).winner, 'impostor');
});

test('미션 배정: 공통 미션은 모두 같고 개수가 설정과 일치', () => {
  const assign = createTaskAssigner(map, { ...DEFAULT_SETTINGS, commonTasks: 1, longTasks: 2, shortTasks: 3 });
  const a = assign('x'), b = assign('y');
  assert.equal(a.length, 6);
  const commonA = a.filter((t) => TASK_DEFS[t.defId].length === 'common');
  const commonB = b.filter((t) => TASK_DEFS[t.defId].length === 'common');
  assert.deepEqual(commonA, commonB);
  for (const t of a) for (const s of t.spots) assert.ok(map.tasks.find((m) => m.id === s), `spot ${s} exists`);
  assert.equal(new Set(a.map((t) => t.defId)).size, a.length, '같은 미션 중복 없음');
});

test('미션 지점 선택 규칙', () => {
  for (let i = 0; i < 20; i++) {
    const w = buildTask(map, 'wires');
    assert.equal(new Set(w.spots).size, 3, '배선 3곳은 서로 다름');
    const f = buildTask(map, 'fuel');
    assert.deepEqual(f.spots, ['fuel_storage', 'fuel_upper', 'fuel_storage', 'fuel_lower']);
    const g = buildTask(map, 'garbage');
    assert.deepEqual(g.spots, ['garbage_cafeteria', 'garbage_storage']);
    const d = buildTask(map, 'data');
    assert.ok(d.spots[0].startsWith('download_'));
    assert.equal(d.spots[1], 'upload_admin');
  }
});

test('퍼즐 정답 검증', () => {
  const w = makeChallenge('wires');
  const good = w.left.map((c) => w.right.indexOf(c));
  assert.ok(validateAnswer('wires', w, good));
  assert.ok(!validateAnswer('wires', w, [0, 0, 0, 0]));
  assert.ok(!validateAnswer('wires', w, 'x'));

  const m = makeChallenge('manifolds');
  const order = Array.from({ length: 10 }, (_, k) => m.labels.indexOf(k + 1));
  assert.ok(validateAnswer('manifolds', m, order));
  assert.ok(!validateAnswer('manifolds', m, [...order].reverse()));

  const s = makeChallenge('simon');
  assert.ok(validateAnswer('simon', s, s.seq));
  assert.ok(!validateAnswer('simon', s, s.seq.map((v) => (v + 1) % 9)));

  const sh = makeChallenge('shields');
  assert.ok(validateAnswer('shields', sh, sh.off));
  assert.ok(!validateAnswer('shields', sh, []));

  assert.ok(validateAnswer('card', {}, 800));
  assert.ok(!validateAnswer('card', {}, 100));
  assert.ok(!validateAnswer('card', {}, 5000));
});

test('프로토콜 검증: 잘못된 메시지 거부', () => {
  assert.equal(parseClientMessage('not json').ok, false);
  assert.equal(parseClientMessage('[]').ok, false);
  assert.equal(parseClientMessage('{"t":"nope"}').ok, false);
  assert.equal(parseClientMessage('{"t":"__proto__"}').ok, false);
  assert.equal(parseClientMessage('{"t":"kill"}').ok, false);
  assert.equal(parseClientMessage('{"t":"kill","targetId":"p1","extra":1}').ok, false);
  assert.equal(parseClientMessage('{"t":"input","seq":1,"d":[0,1,99]}').ok, false);
  assert.equal(parseClientMessage(`{"t":"chat","text":"${'a'.repeat(200)}"}`).ok, false);
  assert.equal(parseClientMessage('{"t":"join","code":"abc","name":"x"}').ok, false);
  assert.equal(parseClientMessage('{"t":"kill","targetId":"p1","rid":3}').ok, true);
  assert.equal(parseClientMessage('x'.repeat(5000)).ok, false);
  assert.equal(sanitizeName('  <b>홍길동</b>  친구들아 반가워 '), 'b홍길동/b 친구들');
  assert.equal(sanitizeName('\u0000\u0007'), '');
});
