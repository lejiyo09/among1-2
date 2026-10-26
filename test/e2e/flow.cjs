// 4명 전체 흐름: 로비 → 시작 → 역할 → 미션 → 킬 → 신고 → 회의/투표 → 추방 → 승리
const { launch, player, walkTo, state, SHOTS } = require('./lib.cjs');
const assert = require('assert');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const browser = await launch();
  const A = await player(browser, '철수');
  await A.click('text=방 만들기');
  await A.waitForSelector('.lobby:not(.hidden)');
  const code = (await A.textContent('.room-code .code')).trim();
  const B = await player(browser, '영희');
  const C = await player(browser, '민수');
  const D = await player(browser, '지영');
  for (const p of [B, C, D]) {
    await p.fill('.code-input', code);
    await p.click('text=코드로 참가');
    await p.waitForSelector('.lobby:not(.hidden)');
    await p.click('.lobby-bottom button:has-text("준비")');
  }
  await A.waitForFunction(() => !document.querySelector('.start-btn').disabled);
  await A.click('.start-btn');
  log('started room', code);
  await A.waitForTimeout(2200);
  await A.screenshot({ path: `${SHOTS}/10-role-A.png` });
  await B.screenshot({ path: `${SHOTS}/10-role-B.png` });
  for (const p of [A, B, C]) await p.waitForFunction(() => window.__game.store.phase === 'playing', null, { timeout: 15000 });
  const all = [A, B, C, D];
  const sts = await Promise.all(all.map(state));
  const imp = all[sts.findIndex((s) => s.you.role === 'impostor')];
  const crew = all.filter((p) => p !== imp);
  log('impostor is', imp.pname, 'crew', crew.map((c) => c.pname));
  // 비공개 정보 확인
  for (const c of crew) { const s = await state(c); assert.equal(s.you.role, 'crewmate'); }
  const crewView = await crew[0].evaluate(() => window.__game.store.state.impostors);
  assert.equal(crewView, undefined, '승무원은 임포스터 목록을 받지 않는다');
  await crew[0].screenshot({ path: `${SHOTS}/11-hud-crew.png` });
  await imp.screenshot({ path: `${SHOTS}/11-hud-imp.png` });

  // --- 미션: crew[0] 의 첫 미션 지점으로 걸어가서 E
  const X = crew[0];
  let Y = crew[1], Z = crew[2];
  await X.evaluate(() => { window.__tasks = []; window.__game.net.on('task', (m) => window.__tasks.push(m)); });
  let sx = await state(X);
  const t0 = sx.you.tasks.find((t) => !t.done);
  const spot = await X.evaluate((id) => window.__game.store.map.tasks.find((s) => s.id === id), t0.spot);
  log('X walks to task', t0.defId, spot.id);
  await walkTo(X, spot.x, spot.y + 30, { tolerance: 60, timeout: 150000 });
  await X.waitForTimeout(300);
  await X.keyboard.press('e');
  await X.waitForSelector('.task-panel', { timeout: 5000 });
  await X.waitForTimeout(600);
  await X.screenshot({ path: `${SHOTS}/12-task-${t0.defId}.png` });
  // 정답을 서버 문제로부터 계산해 제출 (UI 퍼즐 대신)
  const done = await X.evaluate(async (defId) => {
    const m = window.__tasks.at(-1);
    const ch = m.challenge;
    const ans = { wires: () => ch.left.map((c) => ch.right.indexOf(c)), manifolds: () => Array.from({ length: 10 }, (_, k) => ch.labels.indexOf(k + 1)), simon: () => ch.seq, shields: () => ch.off, divert: () => ch.target, card: () => 800, asteroids: () => 20, align: () => 0 }[defId]?.() ?? true;
    const { TASK_DEFS } = await import('/shared/tasks.js');
    await new Promise((r) => setTimeout(r, TASK_DEFS[defId].minMs + 300));
    return window.__game.net.request('taskComplete', { taskId: defId, answer: ans });
  }, t0.defId);
  log('task complete ack', JSON.stringify(done));
  assert.ok(done.ok, 'task completion accepted');
  await X.waitForTimeout(800);
  const bars = await Promise.all(all.map(async (p) => (await state(p)).taskBar));
  log('task bars', JSON.stringify(bars));
  assert.ok(bars.every((b) => JSON.stringify(b) === JSON.stringify(bars[0])), '모든 클라이언트의 미션 진행률 동기화');
  const tx = (await state(X)).you.tasks.find((t) => t.defId === t0.defId);
  if (t0.steps === 1) assert.equal(bars[0].done, 1, '단일 단계 미션 완료가 진행률에 반영');
  else assert.equal(tx.step, 1, '다단계 미션은 다음 단계로 진행 (진행률은 전부 끝나야 오른다)');

  // --- 킬: 임포스터가 Y 에게 걸어감
  const sy = await state(Y);
  log('imp walks to Y at', Math.round(sy.me.x), Math.round(sy.me.y));
  await walkTo(imp, sy.me.x, sy.me.y, { tolerance: 70, timeout: 150000 });
  await imp.waitForFunction(() => window.__game.net.serverNow() > window.__game.store.you.killReadyAt + 100, null, { timeout: 20000 });
  await imp.waitForTimeout(400);
  await imp.screenshot({ path: `${SHOTS}/13-before-kill.png` });
  await imp.keyboard.press('q');
  // 가장 가까운 승무원이 죽는다 (Y 가 아닐 수도 있음)
  await imp.waitForFunction(() => window.__game.store.bodies.size > 0, null, { timeout: 5000 });
  for (const c of [crew[1], crew[2]]) if (!(await state(c)).you.alive) { Y = c; Z = crew[1] === c ? crew[2] : crew[1]; }
  assert.ok(!(await state(Y)).you.alive);
  log('Y killed:', Y.pname);
  await Y.waitForTimeout(500);
  await Y.screenshot({ path: `${SHOTS}/14-victim.png` });
  const ys = await state(Y);
  // --- 신고: X 가 시체로 걸어가서 R
  const body = (await state(imp)).bodies[0];
  log('body at', body.x, body.y);
  await walkTo(X, body.x, body.y, { tolerance: 70, timeout: 150000 });
  await X.waitForTimeout(400);
  await X.screenshot({ path: `${SHOTS}/15-see-body.png` });
  await X.keyboard.press('r');
  for (const p of all) await p.waitForFunction(() => window.__game.store.phase === 'discussion', null, { timeout: 5000 });
  await X.waitForTimeout(400);
  await X.screenshot({ path: `${SHOTS}/16-body-reported.png` });
  for (const p of all) await p.waitForFunction(() => window.__game.store.phase === 'voting', null, { timeout: 30000 });
  await X.screenshot({ path: `${SHOTS}/17-voting.png` });
  // X, Z: 임포스터에게 투표 / 임포스터: 건너뛰기 / 죽은 Y: 투표 불가
  const impName = imp.pname;
  for (const v of [X, Z]) {
    await v.click(`.vote-card:has-text("${impName}")`);
    await v.click('.vote-card.selected .confirm button[title="투표"]');
  }
  const yCards = await Y.$$eval('.vote-card', (els) => els.map((e) => e.disabled));
  assert.ok(yCards.every(Boolean), '죽은 플레이어는 투표 불가');
  // 중복 투표 시도 → 서버 거부
  const dup = await X.evaluate(() => window.__game.net.request('vote', { target: 'skip' }));
  assert.equal(dup.error, 'ALREADY_DONE');
  await imp.click('text=건너뛰기');
  await imp.click('text=건너뛰기 확인');
  for (const p of all) await p.waitForFunction(() => window.__game.store.phase === 'result', null, { timeout: 10000 });
  await X.waitForTimeout(900);
  await X.screenshot({ path: `${SHOTS}/18-result.png` });
  const res = (await state(X)).meeting.result;
  log('vote result', JSON.stringify(res));
  assert.equal(res.ejectedId, (await state(imp)).playerId);
  await X.waitForTimeout(2600);
  await X.screenshot({ path: `${SHOTS}/19-eject.png` });
  for (const p of all) await p.waitForFunction(() => window.__game.store.phase === 'ended', null, { timeout: 15000 });
  await A.waitForTimeout(1500);
  await X.screenshot({ path: `${SHOTS}/20-gameover-crew.png` });
  await imp.screenshot({ path: `${SHOTS}/20-gameover-imp.png` });
  const end = (await state(A)).end;
  log('end', JSON.stringify(end));
  assert.equal(end.winner, 'crew');
  assert.equal(end.reason, 'impostors_eliminated');
  for (const p of all) await p.waitForFunction(() => window.__game.store.phase === 'lobby', null, { timeout: 15000 });
  log('back to lobby: OK');
  await browser.close();
  log('FLOW PASSED');
})().catch((e) => { console.error('FLOW FAILED', e); process.exit(1); });
