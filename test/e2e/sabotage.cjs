// 사보타주 E2E: 원자로(두 명), 산소(키패드 UI), 전등(스위치 UI), 통신(다이얼), 문, 벤트
const { launch, startGame, walkTo, state, SHOTS } = require('./lib.cjs');
const assert = require('assert');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const consoles = (p) => p.evaluate(() => window.__game.store.map.consoles);
const sab = async (p) => (await state(p)).sabotage?.active;

(async () => {
  const browser = await launch();
  const { pages, imp: [I], crew } = await startGame(browser, ['임', '가', '나', '다']);
  const [X, Y] = crew;
  const cons = await consoles(X);
  const at = (id) => cons.find((c) => c.id === id);
  // 사보타주 쿨다운 10초 대기
  await I.waitForFunction(() => window.__game.net.serverNow() > window.__game.store.state.sabotage.cooldownUntil + 200, null, { timeout: 20000 });

  // ---- 전등: 임포스터가 지도에서 사보타주 버튼 클릭
  await I.keyboard.press('f');
  await I.waitForSelector('.mapview:not(.hidden)');
  await I.screenshot({ path: `${SHOTS}/40-sabotage-map.png` });
  await I.click('.map-sabo[title="전등 고장"]');
  await X.waitForFunction(() => window.__game.store.state.sabotage.active?.kind === 'lights', null, { timeout: 5000 });
  await X.waitForTimeout(400);
  await X.screenshot({ path: `${SHOTS}/41-lights-out.png` });
  log('lights sabotaged; X walks to electrical');
  const lc = at('lights_electrical');
  await walkTo(X, lc.x + 40, lc.y + 10, { tolerance: 60, timeout: 150000 });
  await X.keyboard.press('e');
  await X.waitForSelector('.task-panel');
  await X.screenshot({ path: `${SHOTS}/42-lights-panel.png` });
  for (let i = 0; i < 5; i++) {
    const sw = (await sab(X))?.switches;
    if (!sw) break;
    const idx = sw.findIndex((on) => !on);
    if (idx < 0) break;
    await X.click(`.task-stage button >> nth=${idx}`);
    await X.waitForTimeout(300);
  }
  await X.waitForFunction(() => !window.__game.store.state.sabotage.active, null, { timeout: 5000 });
  log('lights fixed via UI');

  // ---- 산소: 키패드 두 곳
  await I.waitForFunction(() => window.__game.net.serverNow() > window.__game.store.state.sabotage.cooldownUntil + 200, null, { timeout: 40000 });
  // 위급 사보타주는 30초 제한이라, 느린 테스트 환경에서는 미리 콘솔 앞에 가 있는다
  const o2a = at('o2_admin'), o2o = at('o2_o2');
  await Promise.all([walkTo(X, o2a.x, o2a.y + 40, { tolerance: 60, timeout: 150000 }), walkTo(Y, o2o.x - 20, o2o.y + 40, { tolerance: 60, timeout: 150000 })]);
  await I.evaluate(() => window.__game.net.request('sabotage', { kind: 'o2' }));
  await X.waitForFunction(() => window.__game.store.state.sabotage.active?.kind === 'o2', null, { timeout: 5000 });
  log('o2 sabotaged');
  for (const P of [X, Y]) {
    await P.evaluate(() => {
      window.__mut = [];
      new MutationObserver((ms) => { for (const m of ms) for (const n of m.removedNodes) if (n.nodeType === 1 && n.tagName === 'BUTTON') window.__mut.push(`removed ${n.textContent} parent=${m.target.className}`); }).observe(document.getElementById('ui'), { childList: true, subtree: true });
    });
    await P.keyboard.press('e');
    await P.waitForSelector('.task-panel');
    log(P.pname, 'panels', await P.evaluate(() => [...document.querySelectorAll('.task-panel h3')].map((e) => e.textContent)));
    setTimeout(async () => { try { log(P.pname, 'mut', JSON.stringify(await P.evaluate(() => window.__mut.slice(0, 8)))); } catch {} }, 4000);
    const code = (await sab(P)).code;
    for (const d of code) await P.click(`.task-stage button:text-is("${d}")`);
    if (P === X) await P.screenshot({ path: `${SHOTS}/43-o2-keypad.png` });
    await P.click('.task-stage button:text-is("✓")');
    await P.waitForTimeout(500);
  }
  await X.waitForFunction(() => !window.__game.store.state.sabotage.active, null, { timeout: 5000 });
  log('o2 fixed via keypads');

  // ---- 원자로: 두 명이 동시에 손
  await I.waitForFunction(() => window.__game.net.serverNow() > window.__game.store.state.sabotage.cooldownUntil + 200, null, { timeout: 40000 });
  const r1 = at('reactor_top'), r2 = at('reactor_bottom');
  await Promise.all([walkTo(X, r1.x + 30, r1.y + 20, { tolerance: 60, timeout: 150000 }), walkTo(Y, r2.x + 30, r2.y - 20, { tolerance: 60, timeout: 150000 })]);
  await I.evaluate(() => window.__game.net.request('sabotage', { kind: 'reactor' }));
  await X.waitForFunction(() => window.__game.store.state.sabotage.active?.kind === 'reactor', null, { timeout: 5000 });
  log('reactor sabotaged');
  const left = (await sab(X))?.endsAt - (await X.evaluate(() => window.__game.net.serverNow()));
  log('reactor time left ms', left);
  for (const P of [X, Y]) { await P.keyboard.press('e'); await P.waitForSelector('.task-panel'); }
  await X.screenshot({ path: `${SHOTS}/44-reactor.png` });
  const padX = await (await X.$('.task-stage div')).boundingBox();
  const padY = await (await Y.$('.task-stage div')).boundingBox();
  await X.mouse.move(padX.x + 50, padX.y + 50); await X.mouse.down();
  await X.waitForTimeout(500);
  assert.ok(await sab(X), '한 명만으로는 해결 안 됨');
  await Y.mouse.move(padY.x + 50, padY.y + 50); await Y.mouse.down();
  await X.waitForFunction(() => !window.__game.store.state.sabotage.active, null, { timeout: 5000 });
  await X.mouse.up(); await Y.mouse.up();
  log('reactor fixed by two players');

  // ---- 통신: 미션 목록 숨김 → 다이얼
  await I.waitForFunction(() => window.__game.net.serverNow() > window.__game.store.state.sabotage.cooldownUntil + 200, null, { timeout: 40000 });
  await I.evaluate(() => window.__game.net.request('sabotage', { kind: 'comms' }));
  await X.waitForFunction(() => window.__game.store.state.sabotage.active?.kind === 'comms', null, { timeout: 5000 });
  assert.equal((await state(X)).you.tasks, null, '통신 방해 중 미션 목록 숨김');
  await X.screenshot({ path: `${SHOTS}/45-comms.png` });
  const cc = at('comms_comms');
  await walkTo(X, cc.x, cc.y + 60, { tolerance: 60, timeout: 150000 });
  await X.keyboard.press('e');
  await X.waitForSelector('.task-stage canvas');
  const target = (await sab(X)).target;
  const cv = await (await X.$('.task-stage canvas')).boundingBox();
  const sx = cv.width / 460, sy = cv.height / 300;
  const a = (target * Math.PI) / 180;
  await X.mouse.move(cv.x + 360 * sx, cv.y + 220 * sy); await X.mouse.down();
  await X.mouse.move(cv.x + (360 + Math.cos(a) * 50) * sx, cv.y + (220 + Math.sin(a) * 50) * sy, { steps: 5 });
  await X.mouse.up();
  await X.waitForFunction(() => !window.__game.store.state.sabotage.active, null, { timeout: 5000 });
  assert.ok(Array.isArray((await state(X)).you.tasks), '통신 복구 후 미션 목록 복원');
  log('comms fixed via dial');

  // ---- 문: 임포스터가 의무실 문 닫기
  await I.keyboard.press('f');
  await I.waitForSelector('.mapview:not(.hidden)');
  await I.click('.map-sabo[title="의무실 문 닫기"]');
  await X.waitForFunction(() => window.__game.store.state.sabotage.doorsClosed.includes('medbay'), null, { timeout: 5000 });
  log('medbay door closed');
  await X.waitForFunction(() => !window.__game.store.state.sabotage.doorsClosed.includes('medbay'), null, { timeout: 15000 });
  log('medbay door reopened after ~10s');
  await I.keyboard.press('Escape');

  // ---- 벤트: 임포스터가 식당 벤트 → 관리실 벤트
  const vents = await I.evaluate(() => window.__game.store.map.vents);
  const cafe = vents.find((v) => v.id === 'CafeVent');
  await walkTo(I, cafe.x, cafe.y + 20, { tolerance: 40, timeout: 150000 });
  await I.keyboard.press('v');
  await I.waitForFunction(() => window.__game.store.you.inVent === 'CafeVent', null, { timeout: 5000 });
  await I.waitForTimeout(400);
  await I.screenshot({ path: `${SHOTS}/46-vent.png` });
  await I.click('.vent-arrow >> nth=0');
  await I.waitForFunction(() => window.__game.store.you.inVent && window.__game.store.you.inVent !== 'CafeVent', null, { timeout: 5000 });
  log('moved through vent to', (await state(I)).you.inVent);
  await I.keyboard.press('v');
  await I.waitForFunction(() => !window.__game.store.you.inVent, null, { timeout: 5000 });
  log('exited vent');
  await browser.close();
  log('SABOTAGE PASSED');
})().catch((e) => { console.error('SABOTAGE FAILED', e); process.exit(1); });
