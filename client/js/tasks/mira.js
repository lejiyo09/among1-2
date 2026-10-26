// 미라 HQ 미션 미니게임 (원작 미라 HQ 미션의 조작 방식을 따름)
// 각 함수: (stage 요소, ctx) → { destroy }. 퍼즐을 풀면 ctx.complete(답) 호출
import { h } from '../ui/dom.js';
import { canvasStage, rrect } from './index.js';
import { drag, progressTask } from './games.js';
import { BEVERAGES } from '../../shared/tasks.js';

// ----------------------------------------------------------------- 신원 확인 코드 입력 (관리실)
// 원작: 지갑 속 신분증에 적힌 5자리 코드를 키패드로 입력
function idcode(stage, ctx) {
  const me = ctx.store.player(ctx.store.playerId);
  let entry = '';
  const screen = h('div', { style: { fontFamily: 'monospace', fontSize: '30px', background: '#0b1a12', color: '#7dff9b', padding: '6px', textAlign: 'center', border: '3px solid #000', borderRadius: '8px', letterSpacing: '0.25em', minHeight: '50px' } });
  const card = h('div', { style: { background: '#f4f1e6', color: '#222', border: '3px solid #000', borderRadius: '10px', padding: '10px 14px', transform: 'rotate(-4deg)', width: 'fit-content', margin: '4px auto 12px', fontWeight: 900 } },
    h('div', { style: { fontSize: '12px', color: '#666' } }, 'MIRA 신분증'),
    h('div', { style: { fontSize: '17px' } }, me?.name ?? '???'),
    h('div', { style: { fontFamily: 'monospace', fontSize: '24px', letterSpacing: '0.15em' } }, ctx.challenge.code));
  const press = (d) => { if (entry.length < 5) { entry += d; ctx.sound('keypad', { vol: 0.5 }); upd(); } };
  const key = (label, fn) => h('button', { class: 'btn', style: { height: '54px', fontSize: '22px' }, onclick: fn }, label);
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => key(String(n), () => press(String(n))));
  keys.push(key('✕', () => { entry = ''; upd(); }), key('0', () => press('0')), key('✓', () => {
    if (entry === ctx.challenge.code) { ctx.sound('keypadGood'); ctx.complete(entry); }
    else { ctx.message('코드가 틀렸습니다.', 'bad'); entry = ''; upd(); }
  }));
  const upd = () => { screen.textContent = entry || ' '; };
  stage.append(h('div', { style: { padding: '14px', background: '#2c3440' } }, card, screen,
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '10px' } }, keys)));
  upd();
  ctx.message('신분증의 코드를 입력하세요.');
  return {};
}

// ----------------------------------------------------------------- 식물에 물 주기 (창고 → 온실)
function water(stage, ctx) {
  const W = 480, H = 320;
  const s = canvasStage(stage, W, H);
  const g = s.g;
  if (ctx.step === 0) {
    // 원작: 창고 선반에서 물뿌리개를 집는다
    let taken = false;
    s.canvas.addEventListener('pointerdown', (e) => {
      const p = s.toLocal(e);
      if (!taken && Math.abs(p.x - 240) < 90 && Math.abs(p.y - 170) < 80) { taken = true; ctx.sound('taskStep', { vol: 0.6 }); ctx.complete(true); }
    });
    s.loop((dt, t) => {
      g.fillStyle = '#4b5a63'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#6d5a43'; g.fillRect(40, 235, 400, 22);
      if (!taken) {
        const bob = Math.sin(t / 300) * 3;
        g.fillStyle = '#5fb0e0'; g.strokeStyle = '#000'; g.lineWidth = 4;
        rrect(g, 185, 130 + bob, 110, 100, 14); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(290, 160 + bob); g.lineTo(350, 120 + bob); g.lineTo(358, 132 + bob); g.lineTo(295, 185 + bob); g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.arc(240, 125 + bob, 34, Math.PI, 0); g.stroke();
      }
    });
    ctx.message('물뿌리개를 누르세요.');
    return { destroy: s.stop };
  }
  // 원작: 시든 화분 네 개를 차례로 눌러 물을 준다
  const plants = [0, 1, 2, 3].map((i) => ({ x: 75 + i * 110, k: 0, watering: false }));
  let finished = false;
  s.canvas.addEventListener('pointerdown', (e) => {
    const p = s.toLocal(e);
    const pl = plants.find((q) => Math.abs(p.x - q.x) < 50 && p.y > 90);
    if (pl && pl.k === 0 && !pl.watering) { pl.watering = true; ctx.sound('taskStep', { vol: 0.5 }); }
  });
  s.loop((dt) => {
    g.fillStyle = '#3d4d52'; g.fillRect(0, 0, W, H);
    for (const pl of plants) {
      if (pl.watering) { pl.k = Math.min(1, pl.k + dt / 700); if (pl.k >= 1) pl.watering = false; }
      g.fillStyle = '#9b5a34'; g.strokeStyle = '#000'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(pl.x - 38, 220); g.lineTo(pl.x + 38, 220); g.lineTo(pl.x + 28, 290); g.lineTo(pl.x - 28, 290); g.closePath(); g.fill(); g.stroke();
      const up = pl.k; // 0 = 시듦, 1 = 싱싱함
      g.strokeStyle = up > 0.5 ? '#3fae3f' : '#8a8a3a'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(pl.x, 220); g.quadraticCurveTo(pl.x + 30 * (1 - up), 170, pl.x + 50 * (1 - up), 150 + 70 * (1 - up)); g.stroke();
      g.fillStyle = up > 0.5 ? '#5fd35f' : '#a6a64a';
      g.beginPath(); g.ellipse(pl.x + 50 * (1 - up), 150 + 70 * (1 - up), 18, 11, 0.5, 0, Math.PI * 2); g.fill();
      if (pl.watering) { g.fillStyle = '#6fc3ff'; for (let d = 0; d < 4; d++) g.fillRect(pl.x - 20 + d * 12, 110 + ((performance.now() / 4 + d * 20) % 90), 4, 10); }
    }
    if (!finished && plants.every((q) => q.k >= 1)) { finished = true; ctx.complete(true); }
  });
  ctx.message('시든 화분을 모두 눌러 물을 주세요.');
  return { destroy: s.stop };
}

// ----------------------------------------------------------------- 전력 받기 (각 방)
function divertAccept(stage, ctx) {
  const btn = h('button', { class: 'btn primary', style: { width: '160px', height: '160px', borderRadius: '50%', fontSize: '20px', margin: '30px auto', display: 'block' } }, '전력 받기');
  btn.addEventListener('click', () => { btn.disabled = true; btn.textContent = '⚡'; ctx.sound('divert'); ctx.complete(true); });
  stage.append(h('div', { style: { background: '#2b2f36', padding: '10px' } }, btn));
  ctx.message('스위치를 눌러 우회된 전력을 받으세요.');
  return {};
}

// ----------------------------------------------------------------- 유물 조립 (연구실)
// 원작: 깨진 수정 조각을 제자리 윤곽에 끌어다 맞춘다
function artifact(stage, ctx) {
  const W = 500, H = 360;
  const s = canvasStage(stage, W, H);
  const g = s.g;
  const C = { x: 330, y: 180 };
  // 다이아몬드를 5조각으로 나눈 다각형 (중심 기준 좌표)
  const shapes = [
    [[0, -110], [45, -40], [0, -20], [-45, -40]],
    [[-45, -40], [0, -20], [0, 40], [-60, 10]],
    [[45, -40], [60, 10], [0, 40], [0, -20]],
    [[-60, 10], [0, 40], [0, 110]],
    [[60, 10], [0, 110], [0, 40]],
  ];
  const starts = [[70, 70], [120, 180], [70, 290], [190, 80], [190, 290]];
  const pieces = shapes.map((pts, i) => ({ pts, x: starts[i][0], y: starts[i][1], placed: false }));
  let held = null, off = null, finished = false;
  const center = (pc) => pc.pts.reduce((a, [x, y]) => [a[0] + x / pc.pts.length, a[1] + y / pc.pts.length], [0, 0]);
  drag(s.canvas, s.toLocal, {
    down: (p) => {
      held = [...pieces].reverse().find((pc) => !pc.placed && Math.hypot(p.x - pc.x, p.y - pc.y) < 45) ?? null;
      if (held) off = { x: held.x - p.x, y: held.y - p.y };
      return !!held;
    },
    move: (p) => { held.x = p.x + off.x; held.y = p.y + off.y; },
    up: () => {
      const [cx, cy] = center(held);
      if (Math.hypot(held.x - (C.x + cx), held.y - (C.y + cy)) < 28) { held.placed = true; held.x = C.x + cx; held.y = C.y + cy; ctx.sound('taskStep', { vol: 0.5 }); }
      held = null;
      if (!finished && pieces.every((pc) => pc.placed)) { finished = true; ctx.complete(true); }
    },
  });
  const poly = (pc, ox, oy, fill) => {
    const [cx, cy] = center(pc);
    g.beginPath();
    pc.pts.forEach(([x, y], k) => (k ? g.lineTo(ox + x - cx, oy + y - cy) : g.moveTo(ox + x - cx, oy + y - cy)));
    g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 3; g.stroke();
  };
  s.loop(() => {
    g.fillStyle = '#d9e3ea'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#b9c6cf'; g.beginPath(); g.arc(C.x, C.y, 140, 0, Math.PI * 2); g.fill();
    for (const pc of pieces) { const [cx, cy] = center(pc); poly(pc, C.x + cx, C.y + cy, 'rgba(0,0,0,0.12)'); }
    for (const pc of pieces) poly(pc, pc.x, pc.y, pc.placed ? '#7fd7ff' : '#4fb6e8');
  });
  ctx.message('조각을 끌어 유물을 맞추세요.');
  return { destroy: s.stop };
}

// ----------------------------------------------------------------- 샘플 분류 (연구실)
// 원작: 섞인 표본을 종류별 상자에 넣는다 (틀린 상자에는 들어가지 않는다)
const SAMPLE_ICONS = ['💎', '🌿', '🦴'];
const SAMPLE_BINS = ['광물', '식물', '화석'];
function samples(stage, ctx) {
  const kinds = ctx.challenge.kinds;
  const placed = kinds.map(() => -1);
  let sel = -1, finished = false;
  const itemBtns = kinds.map((k, i) => h('button', { class: 'btn', style: { fontSize: '30px', height: '64px' }, onclick: () => { if (placed[i] < 0) { sel = i; render(); } } }, SAMPLE_ICONS[k]));
  const binBtns = SAMPLE_BINS.map((name, b) => h('button', { class: 'btn', style: { height: '90px', fontSize: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }, onclick: () => {
    if (sel < 0) return;
    if (kinds[sel] !== b) { ctx.message('그 상자가 아닙니다.', 'bad'); ctx.sound('cardDeny', { vol: 0.4 }); sel = -1; render(); return; }
    placed[sel] = b; sel = -1; ctx.sound('taskStep', { vol: 0.5 }); render();
    if (!finished && placed.every((p) => p >= 0)) { finished = true; ctx.complete(placed); }
  } }, h('span', { style: { fontSize: '26px' } }, SAMPLE_ICONS[b]), name));
  const render = () => {
    itemBtns.forEach((el, i) => {
      el.style.visibility = placed[i] >= 0 ? 'hidden' : 'visible';
      el.style.outline = sel === i ? '4px solid #ffd400' : 'none';
    });
    binBtns.forEach((el, b) => { el.lastChild.textContent = `${SAMPLE_BINS[b]} (${placed.filter((p) => p === b).length})`; });
  };
  stage.append(h('div', { style: { padding: '14px', background: '#dfe8ee', display: 'flex', flexDirection: 'column', gap: '14px' } },
    h('div', { style: { display: 'grid', gridTemplateColumns: `repeat(${kinds.length}, 1fr)`, gap: '6px' } }, itemBtns),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' } }, binBtns)));
  render();
  ctx.message('표본을 누르고 맞는 상자를 누르세요.');
  return {};
}

// ----------------------------------------------------------------- 날씨 측정 (발코니), 데이터 처리 (사무실)
function weather(stage, ctx) {
  return progressTask(stage, ctx, {
    label: '기상 관측 노드', startText: '측정 시작', durationMs: 6200, sound: 'taskStep',
    lines: (k) => (k === 0 ? '대기 중' : `측정 중… ${Math.floor(k * 100)}%\n풍속: ${(12 + k * 7).toFixed(1)} m/s\n기압: ${(1003 + k * 9).toFixed(0)} hPa`),
  });
}

function process(stage, ctx) {
  return progressTask(stage, ctx, {
    label: 'MIRA 데이터 처리', startText: '처리', durationMs: 7200, sound: 'taskStep',
    lines: (k) => (k === 0 ? '대기 중' : `처리 중… ${Math.floor(k * 100)}%\n남은 시간: ${Math.ceil((1 - k) * 7)}초`),
  });
}

// ----------------------------------------------------------------- 음료 구매 (식당 자판기)
// 원작: 쪽지에 그려진 음료를 찾아 자판기 칸 번호(A1~C4)를 입력
function beverage(stage, ctx) {
  const want = ctx.challenge.drink;
  const rows = ['A', 'B', 'C'];
  let row = '', col = '';
  const screen = h('div', { style: { fontFamily: 'monospace', fontSize: '26px', background: '#0b1a12', color: '#7dff9b', padding: '4px', textAlign: 'center', border: '3px solid #000', borderRadius: '6px', minHeight: '42px' } });
  const shelf = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' } },
    BEVERAGES.map((name, i) => h('div', { style: { background: '#fff', color: '#222', border: '2px solid #000', borderRadius: '6px', padding: '4px', fontSize: '12px', fontWeight: 800, textAlign: 'center' } },
      h('div', { style: { color: '#c33' } }, `${rows[Math.floor(i / 4)]}${(i % 4) + 1}`), name)));
  const upd = () => { screen.textContent = `${row}${col}` || ' '; };
  const key = (label, fn) => h('button', { class: 'btn', style: { height: '44px', fontSize: '18px' }, onclick: fn }, label);
  const keys = [...rows.map((r) => key(r, () => { row = r; col = ''; ctx.sound('keypad', { vol: 0.4 }); upd(); })),
    ...[1, 2, 3, 4].map((n) => key(String(n), () => { if (row) { col = String(n); ctx.sound('keypad', { vol: 0.4 }); upd(); } })),
    key('✓', () => {
      const i = rows.indexOf(row) * 4 + Number(col) - 1;
      if (row && col && i === want) { ctx.sound('keypadGood'); ctx.complete(i); }
      else { ctx.message('주문한 음료가 아닙니다.', 'bad'); row = ''; col = ''; upd(); }
    })];
  const note = h('div', { style: { background: '#fff7b8', color: '#222', padding: '6px 12px', transform: 'rotate(-3deg)', fontWeight: 900, border: '2px solid #000', width: 'fit-content', margin: '0 auto' } }, `주문: ${BEVERAGES[want]}`);
  stage.append(h('div', { style: { padding: '12px', background: '#7a2e2e', display: 'flex', flexDirection: 'column', gap: '10px' } },
    note, shelf, screen, h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' } }, keys)));
  upd();
  ctx.message('쪽지의 음료 칸 번호를 누르세요.');
  return {};
}

// ----------------------------------------------------------------- 진단 실행 (발사대)
// 원작: 진단을 시작하고 기다린 뒤 이상이 생긴 부분을 고른다
function diagnostics(stage, ctx) {
  const fill = h('div', { class: 'fill' });
  const btn = h('button', { class: 'btn primary', style: { alignSelf: 'center' } }, '진단 시작');
  const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' } });
  stage.append(h('div', { style: { padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px', background: '#1d2a36' } },
    h('div', { style: { fontWeight: 900, fontSize: '18px', textAlign: 'center' } }, '로켓 진단'), h('div', { class: 'progress' }, fill), grid, btn));
  let iv = null;
  btn.addEventListener('click', () => {
    btn.remove();
    const t0 = performance.now();
    iv = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / 5000);
      fill.style.width = `${k * 100}%`;
      if (k >= 1) {
        clearInterval(iv);
        ctx.sound('taskStep', { vol: 0.5 });
        ctx.message('이상이 있는 부분을 고르세요.');
        grid.replaceChildren(...[0, 1, 2, 3].map((i) => h('button', {
          class: 'btn', style: { height: '70px', background: i === ctx.challenge.anomaly ? '#e04848' : '#3c8b4a', color: '#fff' },
          onclick: () => { if (i === ctx.challenge.anomaly) ctx.complete(i); else ctx.message('정상인 부분입니다.', 'bad'); },
        }, i === ctx.challenge.anomaly ? '⚠' : '✓')));
      }
    }, 100);
  });
  ctx.message('진단을 시작하세요.');
  return { destroy() { clearInterval(iv); } };
}

export const MIRA_GAMES = { idcode, water, divertAccept, artifact, samples, weather, process, beverage, diagnostics };
