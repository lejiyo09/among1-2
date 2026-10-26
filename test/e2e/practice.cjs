// 혼자 연습(자유 플레이): 메뉴 → 연습 방 → 임포스터로 더미 처치·신고·회의 → 끝내기 → 승무원으로 미라 HQ 미션
const { launch, player, walkTo, state, SHOTS } = require('./lib.cjs');
const assert = require('assert');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const browser = await launch();
  const P = await player(browser, '혼자');
  await P.click('text=혼자 연습하기');
  await P.waitForSelector('.lobby:not(.hidden)');
  await P.waitForTimeout(300);
  await P.selectOption('.settings select >> nth=0', 'impostor');
  await P.waitForFunction(() => window.__game.store.state.settings.practiceRole === 'impostor');
  await P.screenshot({ path: `${SHOTS}/practice-01-lobby.png` });
  assert.ok(!(await P.$eval('.start-btn', (b) => b.disabled)), '혼자서도 START 가능');
  await P.click('.start-btn');
  await P.waitForFunction(() => window.__game.store.phase === 'playing', null, { timeout: 15000 });
  let s = await state(P);
  assert.equal(s.you.role, 'impostor');
  const dummies = s.players.filter((p) => p.dummy);
  log('dummies', dummies.length);
  assert.ok(dummies.length >= 5);
  await P.waitForTimeout(800);
  await P.screenshot({ path: `${SHOTS}/practice-02-impostor.png` });

  // 가장 가까운 보이는 더미에게 걸어가 Q
  await P.waitForFunction(() => window.__game.net.serverNow() > window.__game.store.state.you.killReadyAt + 100, null, { timeout: 20000 });
  const target = await P.evaluate(() => { const g = window.__game.store; const me = g.me; return [...g.remotes.values()].sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0]; });
  await walkTo(P, target.x, target.y, { tolerance: 60, timeout: 60000 });
  await P.keyboard.press('q');
  await P.waitForFunction(() => window.__game.store.bodies.size > 0, null, { timeout: 5000 });
  log('killed a dummy');
  await P.waitForTimeout(600);
  await P.screenshot({ path: `${SHOTS}/practice-03-kill.png` });
  assert.equal((await state(P)).phase, 'playing', '연습 모드는 계속된다');
  await P.keyboard.press('r');
  await P.waitForFunction(() => window.__game.store.phase === 'discussion', null, { timeout: 5000 });
  log('meeting started');
  await P.waitForFunction(() => window.__game.store.phase === 'voting', null, { timeout: 120000 });
  await P.evaluate(() => window.__game.net.request('vote', { target: 'skip' }));
  await P.waitForFunction(() => window.__game.store.phase === 'playing', null, { timeout: 20000 });
  log('back to playing after meeting');

  await P.click('.practice-end');
  await P.waitForSelector('.lobby:not(.hidden)', { timeout: 10000 });
  s = await state(P);
  assert.equal(s.players.length, 1, '더미는 대기실에서 사라진다');
  log('ended practice → lobby');

  // 승무원 + 미라 HQ
  await P.selectOption('.settings select >> nth=0', 'crewmate');
  await P.selectOption('.settings select >> nth=1', 'mira');
  await P.waitForFunction(() => window.__game.store.state.settings.map === 'mira' && window.__game.store.state.settings.practiceRole === 'crewmate');
  await P.click('.start-btn');
  await P.waitForFunction(() => window.__game.store.phase === 'playing', null, { timeout: 15000 });
  s = await state(P);
  assert.equal(s.you.role, 'crewmate');
  await P.evaluate(() => { window.__tasks = []; window.__game.net.on('task', (m) => window.__tasks.push(m)); });
  const t = s.you.tasks.find((x) => !x.done);
  const spot = await P.evaluate((id) => window.__game.store.map.tasks.find((q) => q.id === id), t.spot);
  await walkTo(P, spot.x, spot.y, { tolerance: 70, timeout: 180000 });
  await P.keyboard.press('e');
  await P.waitForSelector('.task-panel', { timeout: 5000 });
  await P.waitForTimeout(500);
  await P.screenshot({ path: `${SHOTS}/practice-04-task-${t.defId}.png` });
  log('opened task', t.defId, 'at', spot.id);
  await P.screenshot({ path: `${SHOTS}/practice-05-mira.png` });
  log('PRACTICE E2E OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
