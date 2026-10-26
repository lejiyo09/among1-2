// 미션 미니게임 모음 (원작 스켈드 미션의 조작 방식을 따름)
// 각 함수: (stage 요소, ctx) → { destroy }. 퍼즐을 풀면 ctx.complete(답) 호출
import { h } from '../ui/dom.js';
import { canvasStage, rrect } from './index.js';
import { CARD_SWIPE_MS, MANIFOLD_COUNT, SIMON_ROUNDS, ASTEROIDS_TARGET, SHIELD_COUNT } from '../../shared/tasks.js';

const WIRE_HEX = { red: '#ff1d1d', blue: '#2a4dff', yellow: '#ffeb04', magenta: '#ff00ff' };

/** 포인터 드래그 공통 처리 */
function drag(canvas, toLocal, { down, move, up }) {
  let active = false;
  const onDown = (e) => { active = down(toLocal(e)) !== false; if (active) canvas.setPointerCapture(e.pointerId); };
  const onMove = (e) => { if (active) move?.(toLocal(e)); };
  const onUp = (e) => { if (active) { active = false; up?.(toLocal(e)); } };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
}

// ----------------------------------------------------------------- 배선 수리
function wires(stage, ctx) {
  const W = 520, H = 420;
  const s = canvasStage(stage, W, H);
  const { left, right } = ctx.challenge;
  const ly = (i) => 75 + i * 90;
  const conn = [null, null, null, null];
  let dragging = null, pos = null;
  drag(s.canvas, s.toLocal, {
    down: (p) => {
      const i = [0, 1, 2, 3].find((k) => conn[k] === null && Math.hypot(p.x - 50, p.y - ly(k)) < 34);
      if (i === undefined) return false;
      dragging = i; pos = p; return true;
    },
    move: (p) => { pos = p; },
    up: (p) => {
      const j = [0, 1, 2, 3].find((k) => Math.hypot(p.x - 470, p.y - ly(k)) < 40 && !conn.includes(k));
      if (j !== undefined && right[j] === left[dragging]) {
        conn[dragging] = j;
        ctx.sound('wire');
        if (conn.every((c) => c !== null)) ctx.complete(conn);
      }
      dragging = null;
    },
  });
  s.loop(() => {
    const g = s.g;
    g.fillStyle = '#2b2f36'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#5a5f68'; g.fillRect(0, 0, 70, H); g.fillRect(W - 70, 0, 70, H);
    for (let i = 0; i < 4; i++) {
      for (const [x, col] of [[50, left[i]], [470, right[i]]]) {
        g.fillStyle = '#111'; g.fillRect(x - 30, ly(i) - 16, 60, 32);
        g.fillStyle = WIRE_HEX[col]; g.fillRect(x - 26, ly(i) - 12, 52, 24);
      }
      // 연결 확인등
      g.fillStyle = conn[i] !== null ? '#ffe600' : '#333'; g.beginPath(); g.arc(14, ly(i), 7, 0, Math.PI * 2); g.fill();
    }
    g.lineCap = 'round';
    const line = (i, x2, y2) => {
      g.strokeStyle = '#000'; g.lineWidth = 22; g.beginPath(); g.moveTo(70, ly(i)); g.lineTo(x2, y2); g.stroke();
      g.strokeStyle = WIRE_HEX[left[i]]; g.lineWidth = 16; g.stroke();
    };
    conn.forEach((j, i) => { if (j !== null) line(i, W - 70, ly(j)); });
    if (dragging !== null && pos) line(dragging, pos.x, pos.y);
  });
  ctx.message('같은 색 전선끼리 연결하세요.');
  return { destroy: s.stop };
}

// ----------------------------------------------------------------- 카드 긁기
function card(stage, ctx) {
  const W = 560, H = 380;
  const s = canvasStage(stage, W, H);
  let phase = 'wallet'; // wallet → ready → swiping
  let cardX = 80, t0 = 0, text = 'PLEASE INSERT CARD';
  drag(s.canvas, s.toLocal, {
    down: (p) => {
      if (phase === 'wallet') { if (p.y > 240) { phase = 'ready'; text = 'PLEASE SWIPE CARD'; } return false; }
      if (Math.abs(p.x - cardX) < 70 && p.y > 80 && p.y < 200) { phase = 'swiping'; t0 = performance.now(); return true; }
      return false;
    },
    move: (p) => { cardX = Math.max(80, Math.min(480, p.x)); },
    up: () => {
      const ms = performance.now() - t0;
      if (cardX < 470) text = 'BAD READ. TRY AGAIN.';
      else if (ms < CARD_SWIPE_MS[0]) text = 'TOO FAST. TRY AGAIN.';
      else if (ms > CARD_SWIPE_MS[1]) text = 'TOO SLOW. TRY AGAIN.';
      else { text = 'ACCEPTED. THANK YOU.'; ctx.sound('cardAccept'); ctx.complete(Math.round(ms)); phase = 'done'; return; }
      ctx.sound('cardDeny');
      phase = 'ready'; cardX = 80;
    },
  });
  s.loop(() => {
    const g = s.g;
    g.fillStyle = '#3a3f47'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#16351f'; g.fillRect(40, 20, 480, 44);
    g.fillStyle = text.startsWith('ACCEPTED') ? '#5bff7a' : '#9cff9c'; g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.fillText(text, W / 2, 50);
    g.fillStyle = '#1b1e22'; g.fillRect(30, 130, 500, 24); // 슬롯
    if (phase === 'wallet') {
      g.fillStyle = '#7a4a22'; rrect(g, 150, 250, 260, 120, 14); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif'; g.fillText('지갑을 눌러 카드를 꺼내세요', W / 2, 318);
    } else {
      g.fillStyle = '#e9e1c7'; rrect(g, cardX - 70, 90, 140, 90, 10); g.fill();
      g.fillStyle = '#c9b38a'; g.fillRect(cardX - 60, 100, 40, 50);
      g.fillStyle = '#333'; g.font = 'bold 13px sans-serif'; g.fillText('ID CARD', cardX + 22, 125);
      g.fillStyle = '#ccc'; g.font = '15px sans-serif'; g.fillText('카드를 잡고 오른쪽 끝까지 일정한 속도로 긁으세요', W / 2, 260);
    }
  });
  return { destroy: s.stop };
}

// ----------------------------------------------------------------- 매니폴드 잠금 해제
function manifolds(stage, ctx) {
  const { labels } = ctx.challenge;
  const order = [];
  const btns = labels.map((n, cell) => h('button', {
    class: 'btn', style: { fontSize: '26px', height: '72px', fontFamily: 'var(--title)' },
    onclick: () => {
      if (order.length >= MANIFOLD_COUNT) return;
      if (n === order.length + 1) {
        order.push(cell);
        btns[cell].style.background = '#2e6be6';
        ctx.sound('manifold', { vol: 0.6 });
        if (order.length === MANIFOLD_COUNT) ctx.complete(order);
      } else {
        ctx.sound('manifoldFail');
        order.length = 0;
        for (const b of btns) b.style.background = '#a42121';
        setTimeout(() => { for (const b of btns) b.style.background = ''; }, 350);
      }
    },
  }, String(n)));
  stage.append(h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', padding: '18px', background: '#3a4048' } }, btns));
  ctx.message('1부터 10까지 순서대로 누르세요.');
  return { destroy() {} };
}

// ----------------------------------------------------------------- 원자로 가동 (사이먼)
function simon(stage, ctx) {
  const { seq } = ctx.challenge;
  let round = 1, input = [], showing = false, timers = [];
  const cell = (onClick) => h('button', { class: 'btn', style: { height: '64px', background: '#1d2633' }, onclick: onClick });
  const display = Array.from({ length: 9 }, () => h('div', { style: { height: '64px', background: '#0b1018', border: '3px solid #000', borderRadius: '8px' } }));
  const pad = Array.from({ length: 9 }, (_, i) => cell(() => press(i)));
  const lights = Array.from({ length: SIMON_ROUNDS }, () => h('span', { style: { width: '22px', height: '22px', borderRadius: '50%', background: '#333', border: '2px solid #000', display: 'inline-block' } }));
  const grid = (items) => h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', flex: 1 } }, items);
  stage.append(h('div', { style: { padding: '14px', background: '#5c6470', display: 'flex', flexDirection: 'column', gap: '10px' } },
    h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center' } }, lights),
    h('div', { style: { display: 'flex', gap: '18px' } }, grid(display), grid(pad))));
  const flash = (el, color, ms) => { el.style.background = color; timers.push(setTimeout(() => { el.style.background = el.tagName === 'BUTTON' ? '#1d2633' : '#0b1018'; }, ms)); };
  const show = () => {
    showing = true; input = [];
    lights.forEach((l, i) => { l.style.background = i < round - 1 ? '#3fd16a' : '#333'; });
    for (let i = 0; i < round; i++) timers.push(setTimeout(() => { flash(display[seq[i]], '#3d8bff', 380); ctx.sound('taskStep', { vol: 0.4, rate: 1 + seq[i] * 0.05 }); }, 600 + i * 520));
    timers.push(setTimeout(() => { showing = false; }, 600 + round * 520));
  };
  const press = (i) => {
    if (showing || round > SIMON_ROUNDS) return;
    flash(pad[i], '#3d8bff', 180);
    if (seq[input.length] !== i) {
      ctx.sound('manifoldFail'); ctx.message('틀렸습니다! 처음부터 다시.', 'bad');
      round = 1; timers.push(setTimeout(() => { ctx.message(''); show(); }, 900));
      return;
    }
    input.push(i);
    if (input.length === round) {
      round++;
      if (round > SIMON_ROUNDS) { lights.forEach((l) => { l.style.background = '#3fd16a'; }); ctx.sound('reactorStart'); ctx.complete(seq.slice()); return; }
      timers.push(setTimeout(show, 500));
    }
  };
  show();
  return { destroy() { timers.forEach(clearTimeout); } };
}

// ----------------------------------------------------------------- 소행성 파괴
function asteroids(stage, ctx) {
  const W = 500, H = 500;
  const s = canvasStage(stage, W, H);
  let hits = 0, rocks = [], shots = [], spawn = 0, done = false;
  s.canvas.addEventListener('pointerdown', (e) => {
    if (done) return;
    const p = s.toLocal(e);
    shots.push({ x: p.x, y: p.y, t: 160 });
    ctx.sound('weaponFire', { vol: 0.35 });
    for (const r of rocks) {
      if (!r.dead && Math.hypot(r.x - p.x, r.y - p.y) < r.r + 8) {
        r.dead = 300; hits++;
        if (hits >= ASTEROIDS_TARGET) { done = true; ctx.complete(hits); }
        break;
      }
    }
  });
  s.canvas.__debug = () => rocks.filter((r) => !r.dead);
  s.loop((dt) => {
    spawn -= dt;
    if (spawn <= 0 && !done) { spawn = 450; rocks.push({ x: W + 30, y: 60 + Math.random() * (H - 120), vx: -(70 + Math.random() * 90), vy: (Math.random() - 0.5) * 60, r: 18 + Math.random() * 14, a: 0 }); }
    const g = s.g;
    g.fillStyle = '#05080f'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#2a8a3a'; g.lineWidth = 2;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.arc(W / 2, H / 2, i * 70, 0, Math.PI * 2); g.stroke(); }
    for (const r of rocks) {
      r.x += (r.vx * dt) / 1000; r.y += (r.vy * dt) / 1000; r.a += dt / 400;
      if (r.dead) { r.dead -= dt; g.fillStyle = `rgba(255,170,40,${Math.max(0, r.dead / 300)})`; g.beginPath(); g.arc(r.x, r.y, r.r * (1.6 - r.dead / 300), 0, Math.PI * 2); g.fill(); continue; }
      g.fillStyle = '#7d8a96'; g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath();
      for (let k = 0; k < 7; k++) { const a = r.a + (k / 7) * Math.PI * 2; const rr = r.r * (0.8 + ((k * 37) % 5) / 12); g.lineTo(r.x + Math.cos(a) * rr, r.y + Math.sin(a) * rr); }
      g.closePath(); g.fill(); g.stroke();
    }
    rocks = rocks.filter((r) => r.x > -40 && !(r.dead !== undefined && r.dead <= 0));
    for (const sh of shots) { sh.t -= dt; g.strokeStyle = `rgba(80,255,120,${sh.t / 160})`; g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2, H); g.lineTo(sh.x, sh.y); g.stroke(); }
    shots = shots.filter((x) => x.t > 0);
    g.fillStyle = '#5bff7a'; g.font = 'bold 20px monospace'; g.textAlign = 'left'; g.fillText(`파괴: ${hits}/${ASTEROIDS_TARGET}`, 12, 28);
  });
  ctx.message('소행성을 눌러 파괴하세요.');
  return { destroy: s.stop };
}

// ----------------------------------------------------------------- 방어막 작동
function shields(stage, ctx) {
  const W = 420, H = 420;
  const s = canvasStage(stage, W, H);
  const on = Array.from({ length: SHIELD_COUNT }, (_, i) => !ctx.challenge.off.includes(i));
  const clicks = [];
  const centers = [[W / 2, H / 2], ...Array.from({ length: 6 }, (_, k) => { const a = (k / 6) * Math.PI * 2 - Math.PI / 2; return [W / 2 + Math.cos(a) * 118, H / 2 + Math.sin(a) * 118]; })];
  let done = false;
  s.canvas.addEventListener('pointerdown', (e) => {
    if (done) return;
    const p = s.toLocal(e);
    const i = centers.findIndex(([x, y]) => Math.hypot(p.x - x, p.y - y) < 58);
    if (i < 0) return;
    on[i] = !on[i]; clicks.push(i);
    ctx.sound('shieldOn', { vol: 0.4 });
    if (on.every(Boolean)) { done = true; ctx.complete(clicks); }
  });
  s.loop(() => {
    const g = s.g;
    g.fillStyle = '#1b2230'; g.fillRect(0, 0, W, H);
    centers.forEach(([x, y], i) => {
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.lineTo(x + Math.cos(a) * 60, y + Math.sin(a) * 60); }
      g.closePath();
      g.fillStyle = on[i] ? (done ? '#9ad8ff' : '#e9eef4') : '#d72222'; g.fill();
      g.strokeStyle = '#000'; g.lineWidth = 5; g.stroke();
    });
  });
  ctx.message('빨간 칸을 모두 눌러 방어막을 켜세요.');
  return { destroy: s.stop };
}

// ----------------------------------------------------------------- 진행 막대형 (다운로드/업로드, 스캔)
function progressTask(stage, ctx, { label, startText, durationMs, lines, sound }) {
  const fill = h('div', { class: 'fill' });
  const info = h('div', { style: { fontFamily: 'monospace', fontSize: '15px', minHeight: '5.5em', whiteSpace: 'pre-line' } });
  const btn = h('button', { class: 'btn primary', style: { alignSelf: 'center' } }, startText);
  stage.append(h('div', { style: { padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', background: '#1d2a36' } },
    h('div', { style: { fontWeight: 900, fontSize: '18px', textAlign: 'center' } }, label), info, h('div', { class: 'progress' }, fill), btn));
  let iv = null;
  const start = () => {
    btn.disabled = true;
    if (sound) ctx.sound(sound, { vol: 0.6 });
    const t0 = performance.now();
    iv = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / durationMs);
      fill.style.width = `${k * 100}%`;
      info.textContent = lines(k);
      if (k >= 1) { clearInterval(iv); ctx.complete(true); }
    }, 100);
  };
  btn.addEventListener('click', start);
  if (!startText) { btn.remove(); start(); }
  info.textContent = lines(0);
  return { destroy() { clearInterval(iv); } };
}

function data(stage, ctx) {
  const upload = ctx.step === 1;
  return progressTask(stage, ctx, {
    label: upload ? '관리실 서버로 업로드' : `${ctx.spot?.room ?? ''} 데이터 다운로드`,
    startText: upload ? '업로드' : '다운로드',
    durationMs: 8200,
    sound: 'taskStep',
    lines: (k) => (k === 0 ? '대기 중' : `${upload ? '업로드' : '다운로드'} 중… ${Math.floor(k * 100)}%\n남은 시간: ${Math.ceil((1 - k) * 8)}초`),
  });
}

function scan(stage, ctx) {
  const me = ctx.store.player(ctx.store.playerId);
  return progressTask(stage, ctx, {
    label: '의무실 스캐너', startText: '', durationMs: 9800, sound: 'scan',
    lines: (k) => [
      `ID: ${me?.name ?? '???'}`, k > 0.2 ? 'HT: 3\'6"' : '', k > 0.4 ? 'WT: 92lb' : '', k > 0.6 ? 'BT: O-' : '', k > 0.85 ? '스캔 완료 중…' : '스캔 중… 움직이지 마세요',
    ].filter(Boolean).join('\n'),
  });
}

// ----------------------------------------------------------------- 누르고 있기형 (연료, 쓰레기)
function holdTask(stage, ctx, { label, hint, durationMs, sound, color }) {
  const fill = h('div', { class: 'fill', style: { background: color } });
  const btn = h('button', { class: 'btn primary', style: { height: '90px', fontSize: '20px', touchAction: 'none' } }, label);
  stage.append(h('div', { style: { padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', background: '#2c3440' } },
    h('div', { class: 'progress', style: { height: '40px' } }, fill), btn));
  let k = 0, holding = false, last = 0, raf = 0, played = false;
  const frame = (t) => {
    if (holding) {
      k = Math.min(1, k + (t - last) / durationMs);
      fill.style.width = `${k * 100}%`;
      if (k >= 1) { holding = false; ctx.complete(true); return; }
    }
    last = t;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  btn.addEventListener('pointerdown', (e) => { btn.setPointerCapture(e.pointerId); holding = true; last = performance.now(); if (!played) { ctx.sound(sound, { vol: 0.6 }); played = true; } });
  const stop = () => { holding = false; };
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointercancel', stop);
  ctx.message(hint);
  return { destroy() { cancelAnimationFrame(raf); } };
}

function fuel(stage, ctx) {
  const fill = ctx.spot?.room === 'Storage';
  return holdTask(stage, ctx, { label: fill ? '연료통 채우기' : '엔진에 연료 넣기', hint: '버튼을 누르고 있으세요.', durationMs: 2900, sound: 'fuel', color: 'linear-gradient(#ffd34d,#e69a00)' });
}

function garbage(stage, ctx) {
  return holdTask(stage, ctx, { label: '레버 당기기', hint: '레버를 끝까지 누르고 있으세요.', durationMs: 2300, sound: 'garbage', color: 'linear-gradient(#9fd06b,#5b8f2b)' });
}

// ----------------------------------------------------------------- 조종 안정화
function steering(stage, ctx) {
  const W = 420, H = 420, C = W / 2;
  const s = canvasStage(stage, W, H);
  let [x, y] = ctx.challenge.start.map((v) => C + v * 1.6);
  let done = false;
  drag(s.canvas, s.toLocal, {
    down: (p) => !done && Math.hypot(p.x - x, p.y - y) < 60,
    move: (p) => { x = p.x; y = p.y; },
    up: () => { if (Math.hypot(x - C, y - C) < 14) { done = true; x = C; y = C; ctx.complete(true); } },
  });
  s.loop(() => {
    const g = s.g;
    g.fillStyle = '#0e2a3a'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#3fb3e6'; g.lineWidth = 2;
    g.beginPath(); g.arc(C, C, 170, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(C, 30); g.lineTo(C, H - 30); g.moveTo(30, C); g.lineTo(W - 30, C); g.stroke();
    g.strokeStyle = done ? '#5bff7a' : '#fff'; g.lineWidth = 5;
    g.beginPath(); g.arc(x, y, 30, 0, Math.PI * 2); g.moveTo(x - 45, y); g.lineTo(x + 45, y); g.moveTo(x, y - 45); g.lineTo(x, y + 45); g.stroke();
  });
  ctx.message('조준점을 가운데로 끌어오세요.');
  return { destroy: s.stop };
}

// ----------------------------------------------------------------- 분배기 보정
function calibrate(stage, ctx) {
  const W = 520, H = 400;
  const s = canvasStage(stage, W, H);
  const speeds = ctx.challenge.speeds;
  const colors = ['#ffd400', '#3d8bff', '#3fd16a'];
  const ang = [Math.random() * 6, Math.random() * 6, Math.random() * 6];
  let cur = 0;
  const locked = [false, false, false];
  const zone = -Math.PI / 2;
  s.canvas.__debug = () => ({ ang, cur, zone });
  s.canvas.addEventListener('pointerdown', (e) => {
    const p = s.toLocal(e);
    if (cur > 2 || p.x < 360) return;
    const row = Math.floor(p.y / (H / 3));
    if (row !== cur) return;
    const diff = Math.abs(Math.atan2(Math.sin(ang[cur] - zone), Math.cos(ang[cur] - zone)));
    if (diff < 0.35) { locked[cur] = true; cur++; ctx.sound('taskStep', { vol: 0.5 }); if (cur > 2) ctx.complete(true); }
    else { ctx.sound('manifoldFail'); locked.fill(false); cur = 0; }
  });
  s.loop((dt) => {
    const g = s.g;
    g.fillStyle = '#2b2f36'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 3; i++) {
      if (!locked[i]) ang[i] += (dt / 1000) * speeds[i] * 2.4;
      else ang[i] = zone;
      const cy = (H / 3) * i + H / 6;
      g.strokeStyle = '#000'; g.lineWidth = 6; g.fillStyle = '#151820';
      g.beginPath(); g.arc(150, cy, 52, 0, Math.PI * 2); g.fill(); g.stroke();
      g.strokeStyle = colors[i]; g.lineWidth = 10; g.beginPath(); g.arc(150, cy, 52, zone - 0.35, zone + 0.35); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.moveTo(150, cy); g.lineTo(150 + Math.cos(ang[i]) * 46, cy + Math.sin(ang[i]) * 46); g.stroke();
      g.fillStyle = locked[i] ? '#3fd16a' : i === cur ? colors[i] : '#555'; rrect(g, 370, cy - 30, 120, 60, 10); g.fill();
      g.fillStyle = '#000'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.fillText(locked[i] ? 'OK' : 'CALIBRATE', 430, cy + 6);
    }
  });
  ctx.message('바늘이 색 구간에 들어올 때 버튼을 누르세요. (위에서부터)');
  return { destroy: s.stop };
}

// ----------------------------------------------------------------- 엔진 출력 정렬
function align(stage, ctx) {
  const W = 480, H = 400, C = H / 2;
  const s = canvasStage(stage, W, H);
  let v = ctx.challenge.start; // -1..1
  let done = false;
  drag(s.canvas, s.toLocal, {
    down: (p) => !done && p.x > 360,
    move: (p) => { v = Math.max(-1, Math.min(1, (p.y - C) / 160)); },
    up: () => { if (Math.abs(v) <= 0.06) { done = true; ctx.complete(v); } },
  });
  s.loop(() => {
    const g = s.g;
    g.fillStyle = '#1f252c'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#ffd400'; g.setLineDash([10, 8]); g.lineWidth = 3; g.beginPath(); g.moveTo(20, C); g.lineTo(340, C); g.stroke(); g.setLineDash([]);
    const a = v * 0.5;
    g.save(); g.translate(60, C); g.rotate(a);
    g.fillStyle = '#9aa6b2'; g.strokeStyle = '#000'; g.lineWidth = 4; rrect(g, 0, -28, 260, 56, 12); g.fill(); g.stroke();
    g.fillStyle = done || Math.abs(v) < 0.06 ? '#5bff7a' : '#ff6b3d'; g.fillRect(250, -18, 30, 36);
    g.restore();
    g.fillStyle = '#3a4250'; g.fillRect(390, 30, 30, H - 60);
    g.fillStyle = '#e9eef4'; g.strokeStyle = '#000'; rrect(g, 375, C + v * 160 - 18, 60, 36, 8); g.fill(); g.stroke();
  });
  ctx.message('오른쪽 레버를 끌어 엔진을 점선에 맞추세요.');
  return { destroy: s.stop };
}

// ----------------------------------------------------------------- 항로 설정
function chart(stage, ctx) {
  const W = 540, H = 360;
  const s = canvasStage(stage, W, H);
  const pts = [[50, 280], [160, 200], [270, 250], [380, 120], [490, 170]];
  let idx = 0, ship = { x: pts[0][0], y: pts[0][1] }, done = false;
  drag(s.canvas, s.toLocal, {
    down: (p) => !done && Math.hypot(p.x - ship.x, p.y - ship.y) < 40,
    move: (p) => {
      const [nx, ny] = pts[idx + 1];
      const [cx, cy] = pts[idx];
      // 다음 지점 방향으로만 움직임
      const dx = nx - cx, dy = ny - cy, len = Math.hypot(dx, dy);
      const t = Math.max(0, Math.min(1, ((p.x - cx) * dx + (p.y - cy) * dy) / (len * len)));
      ship = { x: cx + dx * t, y: cy + dy * t };
      if (t > 0.97) { idx++; ship = { x: nx, y: ny }; ctx.sound('taskStep', { vol: 0.4 }); if (idx === pts.length - 1) { done = true; ctx.sound('chart'); ctx.complete(true); } }
    },
  });
  s.loop(() => {
    const g = s.g;
    g.fillStyle = '#0c2d4a'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#7fd0ff'; g.setLineDash([8, 8]); g.lineWidth = 3; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.setLineDash([]);
    pts.forEach(([x, y], i) => { g.fillStyle = i <= idx ? '#5bff7a' : '#fff'; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = '#e9eef4'; g.strokeStyle = '#000'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(ship.x + 22, ship.y); g.lineTo(ship.x - 16, ship.y - 14); g.lineTo(ship.x - 10, ship.y); g.lineTo(ship.x - 16, ship.y + 14); g.closePath(); g.fill(); g.stroke();
  });
  ctx.message('우주선을 점선을 따라 끝까지 끌고 가세요.');
  return { destroy: s.stop };
}

// ----------------------------------------------------------------- 산소 필터 청소
function o2filter(stage, ctx) {
  const W = 480, H = 380;
  const s = canvasStage(stage, W, H);
  const leaves = Array.from({ length: 6 }, () => ({ x: 200 + Math.random() * 240, y: 50 + Math.random() * 280, a: Math.random() * 6, gone: false }));
  let held = null, done = false;
  s.canvas.__debug = () => leaves.filter((l) => !l.gone);
  drag(s.canvas, s.toLocal, {
    down: (p) => { held = leaves.find((l) => !l.gone && Math.hypot(l.x - p.x, l.y - p.y) < 34) ?? null; return !!held; },
    move: (p) => { held.x = p.x; held.y = p.y; },
    up: () => {
      if (held && held.x < 90) { held.gone = true; ctx.sound('taskStep', { vol: 0.4 }); }
      held = null;
      if (!done && leaves.every((l) => l.gone)) { done = true; ctx.complete(true); }
    },
  });
  s.loop((dt) => {
    const g = s.g;
    g.fillStyle = '#2a3a33'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#111'; rrect(g, 10, 100, 70, 180, 12); g.fill();
    g.strokeStyle = '#555'; for (let y = 115; y < 280; y += 16) { g.beginPath(); g.moveTo(18, y); g.lineTo(72, y); g.stroke(); }
    for (const l of leaves) {
      if (l.gone) continue;
      if (l !== held) { l.a += dt / 900; l.x += Math.sin(l.a) * 0.3; l.y += Math.cos(l.a * 1.3) * 0.3; }
      g.save(); g.translate(l.x, l.y); g.rotate(l.a);
      g.fillStyle = '#6fbf3a'; g.strokeStyle = '#1d3a10'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(0, 0, 26, 13, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.restore();
    }
  });
  ctx.message('나뭇잎을 왼쪽 배출구로 끌어 버리세요.');
  return { destroy: s.stop };
}

// ----------------------------------------------------------------- 전력 우회
function divert(stage, ctx) {
  const target = ctx.challenge.target;
  const names = ['무기', '산소', '항해', '방어막', '통신', '조종', '원자로', '보안'];
  const W = 520, H = 340;
  const s = canvasStage(stage, W, H);
  const vals = names.map(() => 0);
  let done = false;
  const col = (i) => 40 + i * 62;
  drag(s.canvas, s.toLocal, {
    down: (p) => !done && Math.abs(p.x - col(target)) < 28,
    move: (p) => { vals[target] = Math.max(0, Math.min(1, (280 - p.y) / 200)); },
    up: () => { if (vals[target] > 0.92) { done = true; vals[target] = 1; ctx.sound('divert'); ctx.complete(target); } },
  });
  s.loop((dt, t) => {
    const g = s.g;
    g.fillStyle = '#2b2f36'; g.fillRect(0, 0, W, H);
    names.forEach((n, i) => {
      const x = col(i);
      g.fillStyle = '#111'; g.fillRect(x - 6, 70, 12, 210);
      if (i === target && !done) { g.fillStyle = `rgba(255,220,0,${0.5 + Math.sin(t / 150) * 0.4})`; g.fillRect(x - 6, 280 - 210, 12, 210); }
      g.fillStyle = '#e9eef4'; g.strokeStyle = '#000'; g.lineWidth = 3; rrect(g, x - 22, 280 - vals[i] * 200 - 14, 44, 28, 6); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText(n, x, 310);
    });
  });
  ctx.message('깜빡이는 스위치를 끝까지 올리세요.');
  return { destroy: s.stop };
}

export const GAMES = { wires, card, manifolds, simon, asteroids, shields, data, scan, fuel, garbage, steering, calibrate, align, chart, o2filter, divert };
