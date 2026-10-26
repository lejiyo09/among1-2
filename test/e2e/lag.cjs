// 지연 환경에서 이동 동기화: 예측 오차, 서버와 클라이언트·상대방 화면 위치 일치 확인
process.env.URL = 'http://localhost:3200/';
const { launch, player, walkTo, state } = require('./lib.cjs');
const assert = require('assert');
(async () => {
  const browser = await launch();
  const A = await player(browser, 'A');
  await A.click('text=방 만들기');
  await A.waitForSelector('.lobby:not(.hidden)');
  const code = (await A.textContent('.room-code .code')).trim();
  const B = await player(browser, 'B');
  await B.fill('.code-input', code); await B.click('text=코드로 참가'); await B.waitForSelector('.lobby:not(.hidden)');
  await A.waitForTimeout(1500);
  const rtt = await A.evaluate(() => window.__game.net.rtt);
  console.log('measured RTT ms', rtt);
  // B 가 이리저리 걸어 다니는 동안 A 의 화면에서 B 위치 추적
  const t0 = Date.now();
  const walk = (async () => {
    for (const [x, y] of [[1700, 860], [2120, 860], [2300, 450], [1915, 380]]) await walkTo(B, x, y, { tolerance: 40, timeout: 120000 });
  })();
  const bid = await B.evaluate(() => window.__game.store.playerId);
  await A.evaluate((id) => {
    window.__spd = []; let last = null, lt = 0;
    const f = (t) => { const p = window.__game.store.remotePos(id); if (p && last && t > lt) window.__spd.push(Math.hypot(p.x - last.x, p.y - last.y) / ((t - lt) / 1000)); last = p && { x: p.x, y: p.y }; lt = t; if (window.__spd.length < 100000) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }, bid);
  await A.waitForTimeout(25000);
  const spd = (await A.evaluate(() => window.__spd)).sort((a, b) => a - b);
  const maxJump = spd.at(-1), samples = spd.length;
  console.log('remote speed px/s p50', spd[Math.floor(spd.length * 0.5)].toFixed(0), 'p95', spd[Math.floor(spd.length * 0.95)].toFixed(0), 'p99', spd[Math.floor(spd.length * 0.99)].toFixed(0), 'max', maxJump.toFixed(0), '(walk speed 200)');
  await walk.catch(() => {});
  await B.waitForTimeout(1500);
  const bStats = await B.evaluate(() => window.__game.store.stats);
  const bMe = await B.evaluate(() => window.__game.store.me);
  const bOnA = await A.evaluate((id) => window.__game.store.remotes.get(id), await B.evaluate(() => window.__game.store.playerId));
  console.log('B prediction stats', JSON.stringify(bStats));
  console.log('B final local', Math.round(bMe.x), Math.round(bMe.y), 'seen on A', bOnA.x, bOnA.y);
  console.log('frames sampled', samples);
  assert.ok(Math.hypot(bMe.x - bOnA.x, bMe.y - bOnA.y) < 2, '정지 후 위치 일치');
  assert.ok(bStats.mispredicts / bStats.snapshots < 0.05, '예측 오차 5% 미만');
  await browser.close();
  console.log('LAG PASSED');
})().catch((e) => { console.error('LAG FAILED', e); process.exit(1); });
