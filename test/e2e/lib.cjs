// e2e 공용: 브라우저 페이지 생성, 길찾기 자동 이동
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const SHOTS = process.env.SHOTS || require('path').join(__dirname, 'shots');
require('fs').mkdirSync(SHOTS, { recursive: true });
const URL = process.env.URL || 'http://localhost:3000/';

async function launch() {
  return chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
}

async function player(browser, name, { viewport = { width: 960, height: 540 }, log = true } = {}) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (log && m.type() === 'error') console.log(`[${name}] console.error: ${m.text()}`); });
  page.on('pageerror', (e) => console.log(`[${name}] PAGEERROR ${e.message}`));
  await page.goto(URL);
  await page.waitForSelector('.menu-card input', { timeout: 60000 });
  await page.fill('.menu-card input.input:not(.code-input)', name);
  page.pname = name;
  return page;
}

/** 페이지 안에서 BFS 길찾기로 목표까지 걷는다 (입력 주입 훅 사용) */
async function walkTo(page, x, y, { tolerance = 40, timeout = 30000 } = {}) {
  await page.evaluate(([tx, ty, tol]) => {
    const g = window.__game;
    const world = g.store.world;
    const { cell, gw, gh } = world.map;
    const R = 14;
    const free = (cx, cy) => world.circleFree(cx * cell + cell / 2, cy * cell + cell / 2, R + 8);
    const sx = Math.floor(g.store.me.x / cell), sy = Math.floor(g.store.me.y / cell);
    // 목표 근처에서 갈 수 있는 칸 찾기
    const prev = new Int32Array(gw * gh).fill(-1);
    const q = [sy * gw + sx]; prev[q[0]] = q[0];
    let goal = -1, best = Infinity;
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi]; const cx = i % gw, cy = (i / gw) | 0;
      const d = Math.hypot(cx * cell + cell / 2 - tx, cy * cell + cell / 2 - ty);
      if (d < best) { best = d; goal = i; }
      if (d < tol * 0.5) break;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        const ni = ny * gw + nx;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || prev[ni] !== -1 || !free(nx, ny)) continue;
        prev[ni] = i; q.push(ni);
      }
    }
    const path = [];
    for (let i = goal; i !== prev[i]; i = prev[i]) path.unshift([(i % gw) * cell + cell / 2, ((i / gw) | 0) * cell + cell / 2]);
    let k = 0;
    window.__walkDone = false;
    window.__inputOverride = () => {
      const me = g.store.me;
      if (Math.hypot(tx - me.x, ty - me.y) < tol) { window.__walkDone = true; return -1; }
      // 경로에서 지금 위치와 가장 가까운 지점으로 진행 위치를 맞춘다 (모퉁이를 질러가도 뒤로 가지 않게)
      let bestK = k, bestD = Infinity;
      for (let i = k; i < Math.min(path.length, k + 120); i++) { const d = Math.hypot(path[i][0] - me.x, path[i][1] - me.y); if (d < bestD) { bestD = d; bestK = i; } }
      k = bestK;
      while (k < path.length && Math.hypot(path[k][0] - me.x, path[k][1] - me.y) < 24) k++;
      if (k >= path.length) { window.__walkDone = true; return -1; }
      // 직선으로 갈 수 있는 가장 먼 지점을 목표로 (경로 다듬기)
      const clear = (x0, y0, x1, y1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6); for (let i = 1; i <= n; i++) { if (!world.circleFree(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, R + 3)) return false; } return true; };
      let j = Math.min(k + 60, path.length - 1);
      while (j > k && !clear(me.x, me.y, path[j][0], path[j][1])) j -= 2;
      const [px, py] = path[Math.max(j, k)];
      const a = Math.atan2(py - me.y, px - me.x);
      return ((Math.round(a / (Math.PI / 8)) % 16) + 16) % 16;
    };
  }, [x, y, tolerance]);
  await page.waitForFunction(() => window.__walkDone === true, null, { timeout });
  await page.evaluate(() => { window.__inputOverride = () => -1; });
}

const state = (page) => page.evaluate(() => {
  const s = window.__game.store;
  return { phase: s.phase, you: s.you, me: { x: s.me.x, y: s.me.y }, playerId: s.playerId, players: s.state?.players, bodies: [...s.bodies.values()], meeting: s.state?.meeting, end: s.state?.end, sabotage: s.state?.sabotage, taskBar: s.state?.taskBar };
});

module.exports = { launch, player, walkTo, state, SHOTS };

/** N명이 방에 들어가 게임 시작까지 */
async function startGame(browser, names, opts = {}) {
  const pages = [];
  const A = await player(browser, names[0], opts);
  await A.click('text=방 만들기');
  await A.waitForSelector('.lobby:not(.hidden)');
  const code = (await A.textContent('.room-code .code')).trim();
  pages.push(A);
  for (const n of names.slice(1)) {
    const p = await player(browser, n, opts);
    await p.fill('.code-input', code);
    await p.click('text=코드로 참가');
    await p.waitForSelector('.lobby:not(.hidden)', { timeout: 60000 });
    await p.click('.lobby-bottom button:has-text("준비")');
    pages.push(p);
  }
  if (opts.settings) await A.evaluate((s) => window.__game.net.request('setSettings', { settings: s }), opts.settings);
  if (opts.settings) for (const p of pages.slice(1)) { await p.waitForTimeout(200); await p.click('.lobby-bottom button:has-text("준비")'); }
  await A.waitForFunction(() => !document.querySelector('.start-btn').disabled, null, { timeout: 10000 });
  await A.click('.start-btn');
  for (const p of pages) await p.waitForFunction(() => window.__game.store.phase === 'playing', null, { timeout: 15000 });
  const sts = await Promise.all(pages.map(state));
  return { pages, code, imp: pages.filter((p, i) => sts[i].you.role === 'impostor'), crew: pages.filter((p, i) => sts[i].you.role !== 'impostor') };
}
module.exports.startGame = startGame;
