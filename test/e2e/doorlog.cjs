// 혼자 연습(미라 HQ): Y자 복도 북쪽 센서를 지나간 뒤 통신실 출입 기록 장치에서 내 색이 기록됐는지 확인
const { launch, player, walkTo, state, SHOTS } = require('./lib.cjs');
const assert = require('assert');
(async () => {
  const b = await launch();
  const P = await player(b, '기록', { viewport: { width: 1280, height: 720 } });
  await P.click('text=혼자 연습하기');
  await P.waitForSelector('.lobby:not(.hidden)');
  await P.selectOption('.settings select >> nth=1', 'mira');
  await P.waitForFunction(() => window.__game.store.state.settings.map === 'mira');
  await P.click('.start-btn');
  await P.waitForFunction(() => window.__game.store.phase === 'playing', null, { timeout: 15000 });
  await P.waitForTimeout(2500);
  const s = await P.evaluate(() => window.__game.store.map.sensors.find((x) => x.id === 'north'));
  const cx = (s.x1 + s.x2) / 2;
  await walkTo(P, cx, s.y1 + 80, { tolerance: 30, timeout: 180000 });
  await walkTo(P, cx, s.y1 - 80, { tolerance: 30, timeout: 60000 });
  console.log('crossed north sensor');
  const con = await P.evaluate(() => window.__game.store.map.doorLogConsole);
  await walkTo(P, con.x, con.y + 60, { tolerance: 30, timeout: 180000 });
  await P.waitForTimeout(400);
  await P.keyboard.press('e');
  await P.waitForSelector('.doorlog .row', { timeout: 5000 });
  const rows = await P.$$eval('.doorlog .row', (els) => els.map((e) => e.textContent));
  console.log('log rows', rows);
  assert.ok(rows.some((r) => r.includes('북쪽')));
  await P.screenshot({ path: `${SHOTS}/doorlog.png` });
  // 생체 신호 화면 모양 (미라에는 장치가 없어 서버 응답 대신 예시 데이터로 그린다)
  await P.keyboard.press('Escape');
  await P.evaluate(() => {
    const m = window.__game.hud.monitors;
    m.kind = 'vitals'; m.spot = window.__game.store.me; m.title.textContent = '생체 신호'; m.el.classList.remove('hidden');
    m.renderVitals([{ color: 0, state: 'alive' }, { color: 1, state: 'dead' }, { color: 2, state: 'alive' }, { color: 3, state: 'dc' }, { color: 4, state: 'alive' }, { color: 5, state: 'alive' }]);
  });
  await P.waitForTimeout(500);
  await P.screenshot({ path: `${SHOTS}/vitals.png` });
  console.log('DOORLOG OK');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
