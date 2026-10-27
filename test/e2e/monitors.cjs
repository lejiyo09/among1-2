// 혼자 연습(스켈드): 관리실 지도 → 보안실 CCTV → 미션 전부 완료로 승무원 승리
const { launch, player, walkTo, state, SHOTS } = require('./lib.cjs');
const assert = require('assert');
(async () => {
  const b = await launch();
  const P = await player(b, '혼자', { viewport: { width: 1280, height: 720 } });
  await P.click('text=혼자 연습하기');
  await P.waitForSelector('.lobby:not(.hidden)');
  await P.click('.start-btn');
  await P.waitForFunction(() => window.__game.store.phase === 'playing', null, { timeout: 15000 });
  await P.waitForTimeout(2500);
  // 관리실 지도
  const at = await P.evaluate(() => window.__game.store.map.adminTable);
  await walkTo(P, at.x - 20, at.y - 60, { tolerance: 40, timeout: 120000 });
  await P.waitForTimeout(400);
  await P.keyboard.press('e');
  await P.waitForSelector('.mapview.admin:not(.hidden)', { timeout: 5000 });
  await P.waitForFunction(() => document.querySelectorAll('.admin-icons img').length > 0, null, { timeout: 5000 });
  const icons = await P.$$eval('.admin-icons', (els) => els.map((e) => e.children.length));
  console.log('admin icons per room', icons);
  await P.screenshot({ path: `${SHOTS}/mon-admin.png` });
  await P.keyboard.press('Escape');
  // CCTV
  const cc = await P.evaluate(() => window.__game.store.map.camsConsole);
  await walkTo(P, cc.x, cc.y + 55, { tolerance: 30, timeout: 120000 });
  await P.waitForTimeout(400);
  await P.keyboard.press('e');
  await P.waitForSelector('.cams:not(.hidden) .cell', { timeout: 5000 });
  await P.waitForTimeout(800);
  assert.equal((await state(P)).you.watchingCams, true);
  await P.screenshot({ path: `${SHOTS}/mon-cams.png` });
  await P.keyboard.press('Escape');
  await P.waitForFunction(() => !window.__game.store.you.watchingCams, null, { timeout: 5000 });
  // 미션 모두 완료 → 승무원 승리
  await P.evaluate(() => { window.__tasks = []; window.__game.net.on('task', (m) => window.__tasks.push(m)); });
  for (let guard = 0; guard < 20; guard++) {
    const s = await state(P);
    const t = s.you.tasks.find((x) => !x.done);
    if (!t) break;
    const spot = await P.evaluate((id) => window.__game.store.map.tasks.find((q) => q.id === id), t.spot);
    await walkTo(P, spot.x, spot.y, { tolerance: 70, timeout: 180000 });
    const r = await P.evaluate(async (defId) => {
      const st = await window.__game.net.request('taskStart', { taskId: defId });
      if (!st.ok) return st;
      const m = window.__tasks.at(-1); const ch = m.challenge;
      const { TASK_DEFS, gameOf } = await import('/shared/tasks.js');
      const game = gameOf(defId, m.step);
      const ans = { wires: () => ch.left.map((c) => ch.right.indexOf(c)), manifolds: () => Array.from({ length: 10 }, (_, k) => ch.labels.indexOf(k + 1)), simon: () => ch.seq, shields: () => ch.off, divert: () => ch.target, card: () => 800, asteroids: () => 20, align: () => 0 }[game]?.() ?? true;
      await new Promise((res) => setTimeout(res, TASK_DEFS[defId].minMs + 300));
      return window.__game.net.request('taskComplete', { taskId: defId, answer: ans });
    }, t.defId);
    console.log('task', t.defId, t.step, JSON.stringify(r));
    await P.waitForTimeout(800);
  }
  await P.waitForFunction(() => window.__game.store.state?.end, null, { timeout: 20000 });
  const end = (await state(P)).end;
  console.log('end', end.winner, end.reason);
  assert.equal(end.winner, 'crew');
  await P.waitForTimeout(1500);
  await P.screenshot({ path: `${SHOTS}/mon-win.png` });
  console.log('MONITORS OK');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
