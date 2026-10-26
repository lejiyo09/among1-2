// 미라 HQ 흐름: 맵 선택 → 발사대에서 시작 → 승무원이 모든 미션 지점까지 걸어가 완료(미라 전용 미션 포함)
// → 임포스터 통신 사보타주(키패드 두 곳) 수리 → 미션 완료로 승무원 승리
const { launch, walkTo, state, startGame, SHOTS } = require('./lib.cjs');
const assert = require('assert');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** 서버 문제(challenge)로부터 정답 계산 (UI 퍼즐 대신) */
async function solveCurrent(page, defId) {
  return page.evaluate(async (defId) => {
    const m = window.__tasks.at(-1);
    const ch = m.challenge;
    const { TASK_DEFS, gameOf } = await import('/shared/tasks.js');
    const game = gameOf(defId, m.step);
    const ans = {
      wires: () => ch.left.map((c) => ch.right.indexOf(c)), manifolds: () => Array.from({ length: 10 }, (_, k) => ch.labels.indexOf(k + 1)),
      simon: () => ch.seq, shields: () => ch.off, divert: () => ch.target, asteroids: () => 20,
      idcode: () => ch.code, beverage: () => ch.drink, diagnostics: () => ch.anomaly, samples: () => ch.kinds,
    }[game]?.() ?? true;
    await new Promise((r) => setTimeout(r, TASK_DEFS[defId].minMs + 300));
    return window.__game.net.request('taskComplete', { taskId: defId, answer: ans });
  }, defId);
}

(async () => {
  const browser = await launch();
  const { pages, imp: [imp], crew } = await startGame(browser, ['하나', '두리', '세나'], { settings: { map: 'mira', impostors: 1, commonTasks: 1, longTasks: 1, shortTasks: 2 } });
  const all = pages;
  const s0 = await state(crew[0]);
  const mapId = await crew[0].evaluate(() => window.__game.store.mapId);
  assert.equal(mapId, 'mira');
  // 원작처럼 발사대에서 시작
  for (const p of all) {
    const s = await state(p);
    assert.ok(s.me.x < 1000 && s.me.y > 1650, `발사대 시작 위치가 아님 (${Math.round(s.me.x)},${Math.round(s.me.y)})`);
  }
  log('started on mira at launchpad; tasks', s0.you.tasks.map((t) => `${t.defId}x${t.steps}`).join(' '));
  await crew[0].waitForTimeout(2500);
  await crew[0].screenshot({ path: `${SHOTS}/mira-01-launchpad.png` });

  // 지도
  await crew[0].keyboard.press('Tab');
  await crew[0].waitForTimeout(500);
  await crew[0].screenshot({ path: `${SHOTS}/mira-02-map.png` });
  await crew[0].keyboard.press('Tab');
  await imp.keyboard.press('f');
  await imp.waitForTimeout(500);
  await imp.screenshot({ path: `${SHOTS}/mira-03-sabomap.png` });
  const saboKinds = await imp.$$eval('.map-sabo', (els) => els.map((e) => e.dataset.kind ?? `door:${e.dataset.room}`));
  log('sabotage buttons', saboKinds.join(','));
  assert.deepEqual(saboKinds.sort(), ['comms', 'lights', 'o2', 'reactor'], '미라 HQ 사보타주 4종, 문 없음');
  await imp.keyboard.press('Escape');

  // 통신 사보타주 → 키패드 두 곳 수리
  const r = await imp.evaluate(() => window.__game.net.request('sabotage', { kind: 'comms' }));
  assert.ok(r.ok, `sabotage comms ${JSON.stringify(r)}`);
  await crew[0].waitForFunction(() => window.__game.store.state?.sabotage?.active?.kind === 'comms');
  const sab = (await state(crew[0])).sabotage.active;
  assert.equal(sab.mode, 'keypad');
  const consoles = await crew[0].evaluate(() => window.__game.store.map.consoles.filter((c) => c.sabotage === 'comms'));
  for (const c of consoles) {
    await walkTo(crew[0], c.x, c.y + 40, { tolerance: 70, timeout: 120000 });
    if (c === consoles[0]) {
      await crew[0].keyboard.press('e');
      await crew[0].waitForTimeout(500);
      await crew[0].screenshot({ path: `${SHOTS}/mira-04-comms-keypad.png` });
      await crew[0].keyboard.press('Escape');
    }
    const res = await crew[0].evaluate(({ id, code }) => window.__game.net.request('fix', { consoleId: id, action: 'code', value: Number(code) }), { id: c.id, code: sab.codes[c.id] });
    log('fix', c.id, JSON.stringify(res));
    assert.ok(res.ok);
  }
  await crew[0].waitForFunction(() => !window.__game.store.state?.sabotage?.active, null, { timeout: 5000 });
  log('comms fixed');

  // 승무원 둘이 자기 미션을 모두 걸어가서 완료
  for (const X of crew) await X.evaluate(() => { window.__tasks = []; window.__game.net.on('task', (m) => window.__tasks.push(m)); });
  let shot = 0;
  await Promise.all(crew.map(async (X) => {
    for (let guard = 0; guard < 20; guard++) {
      const s = await state(X);
      const t = s.you.tasks.find((x) => !x.done);
      if (!t) break;
      const spot = await X.evaluate((id) => window.__game.store.map.tasks.find((q) => q.id === id), t.spot);
      await walkTo(X, spot.x, spot.y, { tolerance: 70, timeout: 180000 });
      const st = await X.evaluate((defId) => window.__game.net.request('taskStart', { taskId: defId }), t.defId);
      assert.ok(st.ok, `${X.pname} taskStart ${t.defId} @${spot.id}: ${JSON.stringify(st)}`);
      await X.waitForSelector('.task-panel', { timeout: 5000 });
      if (shot++ < 6) await X.screenshot({ path: `${SHOTS}/mira-1${shot}-task-${t.defId}.png` });
      const done = await solveCurrent(X, t.defId);
      log(X.pname, 'done', t.defId, 'step', t.step, '@', spot.id, JSON.stringify(done));
      assert.ok(done.ok, `${t.defId} rejected`);
      await X.waitForTimeout(900);
    }
  }));
  for (const p of all) await p.waitForFunction(() => window.__game.store.state?.end || window.__game.store.phase === 'ended', null, { timeout: 20000 });
  const end = (await state(crew[0])).end;
  log('end', JSON.stringify(end));
  assert.equal(end.winner, 'crew');
  assert.equal(end.reason, 'tasks');
  await crew[0].screenshot({ path: `${SHOTS}/mira-20-end.png` });
  log('MIRA E2E OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
