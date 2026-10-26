// 각 미니게임을 실제 포인터 조작으로 풀고, 제출된 답이 서버 검증을 통과하는지 확인
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { validateAnswer } = await import('../../server/game/tasks.js');
const { TASK_DEFS, gameOf } = await import('../../shared/tasks.js');
const SHOTS = process.env.SHOTS || require('path').join(__dirname, 'shots');
require('fs').mkdirSync(SHOTS, { recursive: true });
const BASE = `${process.env.URL || 'http://localhost:3000/'}dev/tasks.html`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const sleep = (ms) => page.waitForTimeout(ms);

async function canvasPt(x, y) {
  const c = await page.$('.task-stage canvas');
  const b = await c.boundingBox();
  const [W, H] = await c.evaluate((el) => [el.width, el.height]);
  return { x: b.x + (x / W) * b.width, y: b.y + (y / H) * b.height };
}
async function dragC(x0, y0, x1, y1, steps = 12, ms = 0) {
  const a = await canvasPt(x0, y0), b = await canvasPt(x1, y1);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps); if (ms) await sleep(ms / steps); }
  await page.mouse.up();
}
async function clickC(x, y) { const p = await canvasPt(x, y); await page.mouse.click(p.x, p.y); }

const solvers = {
  async wires(ch) {
    const ly = (i) => 75 + i * 90;
    for (let i = 0; i < 4; i++) await dragC(50, ly(i), 470, ly(ch.right.indexOf(ch.left[i])));
  },
  async card() {
    await clickC(280, 300); await sleep(200);
    await dragC(80, 135, 500, 135, 20, 800);
  },
  async manifolds(ch) {
    const btns = await page.$$('.task-stage button');
    for (let k = 1; k <= 10; k++) await btns[ch.labels.indexOf(k)].click();
  },
  async simon(ch) {
    const pads = (await page.$$('.task-stage button'));
    for (let r = 1; r <= 5; r++) {
      await sleep(600 + r * 520 + 150);
      for (let i = 0; i < r; i++) { await pads[ch.seq[i]].click(); await sleep(60); }
    }
  },
  async asteroids() {
    const t0 = Date.now();
    while (Date.now() - t0 < 30000 && !(await page.evaluate(() => window.submitted.length))) {
      const rocks = await page.$eval('.task-stage canvas', (c) => c.__debug().filter((r) => r.x < 480 && r.x > 20).map((r) => [r.x + r.vx * 0.05, r.y + r.vy * 0.05]));
      if (rocks.length) await clickC(rocks[0][0], rocks[0][1]);
      await sleep(80);
    }
  },
  async shields(ch) {
    const W = 420, H = 420;
    const centers = [[W / 2, H / 2], ...Array.from({ length: 6 }, (_, k) => { const a = (k / 6) * Math.PI * 2 - Math.PI / 2; return [W / 2 + Math.cos(a) * 118, H / 2 + Math.sin(a) * 118]; })];
    for (const i of ch.off) await clickC(...centers[i]);
  },
  async data() { await page.click('.task-stage button'); await sleep(8600); },
  async scan() { await sleep(10200); },
  async fuel() { const b = await (await page.$('.task-stage button')).boundingBox(); await page.mouse.move(b.x + 20, b.y + 20); await page.mouse.down(); await sleep(3300); await page.mouse.up(); },
  async garbage() { await this.fuel(); },
  async steering(ch) { await dragC(210 + ch.start[0] * 1.6, 210 + ch.start[1] * 1.6, 210, 210); },
  async calibrate() {
    for (let k = 0; k < 3; k++) {
      const t0 = Date.now();
      while (Date.now() - t0 < 10000) {
        const st = await page.$eval('.task-stage canvas', (c) => c.__debug());
        if (st.cur > k) break;
        const d = Math.abs(Math.atan2(Math.sin(st.ang[k] - st.zone), Math.cos(st.ang[k] - st.zone)));
        if (d < 0.18) { await clickC(430, (400 / 3) * k + 400 / 6); await sleep(100); }
        await sleep(15);
      }
    }
  },
  async align(ch) { await dragC(405, 200 + ch.start * 160, 405, 200); },
  async chart() {
    const pts = [[50, 280], [160, 200], [270, 250], [380, 120], [490, 170]];
    for (let i = 0; i < 4; i++) await dragC(...pts[i], ...pts[i + 1], 10);
  },
  async o2filter() {
    for (let i = 0; i < 6; i++) {
      const leaves = await page.$eval('.task-stage canvas', (c) => c.__debug().map((l) => [l.x, l.y]));
      if (!leaves.length) break;
      await dragC(leaves[0][0], leaves[0][1], 40, 190);
    }
  },
  async divert(ch) { const x = 40 + ch.target * 62; await dragC(x, 280, x, 40); },
  // ---- 미라 HQ
  async idcode(ch) {
    for (const d of ch.code) await page.click(`.task-stage button:text-is("${d}")`);
    await page.click('.task-stage button:text-is("✓")');
  },
  async water(ch, step) {
    if (step === 0) { await clickC(240, 170); return; }
    for (let i = 0; i < 4; i++) await clickC(75 + i * 110, 250);
    await sleep(1200);
  },
  async divertAccept() { await page.click('.task-stage button'); },
  async artifact() {
    const shapes = [
      [[0, -110], [45, -40], [0, -20], [-45, -40]], [[-45, -40], [0, -20], [0, 40], [-60, 10]], [[45, -40], [60, 10], [0, 40], [0, -20]],
      [[-60, 10], [0, 40], [0, 110]], [[60, 10], [0, 110], [0, 40]],
    ];
    const starts = [[70, 70], [120, 180], [70, 290], [190, 80], [190, 290]];
    for (let i = 0; i < 5; i++) {
      const c = shapes[i].reduce((a, [x, y]) => [a[0] + x / shapes[i].length, a[1] + y / shapes[i].length], [0, 0]);
      await dragC(...starts[i], 330 + c[0], 180 + c[1]);
    }
  },
  async samples(ch) {
    const btns = await page.$$('.task-stage button');
    for (let i = 0; i < ch.kinds.length; i++) { await btns[i].click(); await btns[ch.kinds.length + ch.kinds[i]].click(); }
  },
  async weather() { await page.click('.task-stage button'); await sleep(6600); },
  async process() { await page.click('.task-stage button'); await sleep(7600); },
  async beverage(ch) {
    await page.click(`.task-stage button:text-is("${'ABC'[Math.floor(ch.drink / 4)]}")`);
    await page.click(`.task-stage button:text-is("${(ch.drink % 4) + 1}")`);
    await page.click('.task-stage button:text-is("✓")');
  },
  async diagnostics(ch) {
    await page.click('.task-stage button:has-text("진단 시작")');
    await sleep(5400);
    const btns = await page.$$('.task-stage button');
    await btns[ch.anomaly].click();
  },
};

let fails = 0;
for (const defId of Object.keys(TASK_DEFS)) {
  // 단계마다 미니게임이 다르면 단계별로, 같은 미니게임을 쓰는 정의는 한 번만
  const steps = defId === 'data' || defId === 'water' ? [0, 1] : TASK_DEFS[defId].steps.map((_, k) => k).filter((k) => k === 0 || gameOf(defId, k) !== gameOf(defId, 0));
  if (TASK_DEFS[defId].game && steps.length === 1) continue;
  for (const step of steps) {
    const game = gameOf(defId, step);
    await page.goto(`${BASE}?game=${defId}&step=${step}`);
    await page.waitForSelector('.task-panel');
    const ch = await page.evaluate(() => window.challenge);
    const t0 = Date.now();
    try { await solvers[game](ch, step); } catch (e) { console.log(game, 'solver error', e.message); }
    await page.waitForFunction(() => window.submitted.length > 0, null, { timeout: 15000 }).catch(() => {});
    const sub = await page.evaluate(() => ({ s: window.submitted[0], openedAt: window.openedAt }));
    await page.screenshot({ path: `${SHOTS}/mg-${game}${step ? step : ''}.png` });
    if (!sub.s) { console.log(`FAIL ${game}: 제출 없음`); fails++; continue; }
    const elapsed = sub.s.at - sub.openedAt;
    const okAns = validateAnswer(game, ch, sub.s.answer);
    const okTime = elapsed >= TASK_DEFS[defId].minMs;
    console.log(`${okAns && okTime ? 'PASS' : 'FAIL'} ${game}${step ? `#${step}` : ''} answer=${JSON.stringify(sub.s.answer)} elapsed=${Math.round(elapsed)}ms (min ${TASK_DEFS[defId].minMs})`);
    if (!(okAns && okTime)) fails++;
  }
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL MINIGAMES PASSED');
process.exit(fails ? 1 : 0);
