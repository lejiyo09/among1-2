// 재접속: 게임 중 새로고침 → 같은 플레이어로 복원 / 탭 닫기 → 연결 끊김 표시 → 유예 후 제거
const { launch, startGame, state, SHOTS } = require('./lib.cjs');
const assert = require('assert');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const browser = await launch();
  const { pages, imp: [I], crew } = await startGame(browser, ['가', '나', '다', '라', '마']);
  const [X, Y, Z] = crew;
  const before = await state(X);
  log('X', before.playerId, 'role', before.you.role, 'tasks', before.you.tasks.length);
  // 새로고침
  await X.reload();
  await X.waitForFunction(() => window.__game?.store?.phase === 'playing', null, { timeout: 60000 });
  const after = await state(X);
  assert.equal(after.playerId, before.playerId, '같은 플레이어로 복원');
  assert.equal(after.you.role, before.you.role);
  assert.deepEqual(after.you.tasks.map((t) => t.defId), before.you.tasks.map((t) => t.defId));
  log('reload → resumed as same player with same role/tasks');
  await X.screenshot({ path: `${SHOTS}/50-after-reload.png` });
  // 탭 닫기 (비정상 종료)
  const yId = (await state(Y)).playerId;
  await Y.close();
  await Z.waitForFunction((id) => window.__game.store.player(id)?.connected === false, yId, { timeout: 10000 });
  log('others see Y disconnected');
  // 서버 유예(45초) 후 제거
  await Z.waitForFunction((id) => window.__game.store.player(id)?.left === true, yId, { timeout: 60000 });
  log('Y removed after grace period');
  const st = await state(Z);
  assert.equal(st.phase, 'playing');
  // 방장 나감 → 방장 이전
  const hostId = st.players.find((p) => p.host).id;
  const hostPage = (await Promise.all([I, X, Z, pages[0]].map(async (p) => [p, (await state(p)).playerId]))).find(([, id]) => id === hostId)?.[0];
  if (hostPage) {
    await hostPage.evaluate(() => window.__game.net.leave());
    const other = [I, X, Z].find((p) => p !== hostPage);
    await other.waitForFunction((id) => window.__game.store.state.hostId !== id, hostId, { timeout: 5000 });
    log('host left → host transferred');
  }
  await browser.close();
  log('RECONNECT PASSED');
})().catch((e) => { console.error('RECONNECT FAILED', e); process.exit(1); });
