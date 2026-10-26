// 사보타주 수리 창: 원자로(두 명이 손 올리기), 산소(코드 입력), 전등(스위치), 통신(스켈드: 다이얼, 미라 HQ: 키패드 두 곳)
import { h, toast, errorText } from '../ui/dom.js';
import { play } from '../audio.js';

let current = null;

export function closeFixPanel() {
  if (!current) return;
  const c = current;
  current = null;
  c.cleanup?.();
  c.el.remove();
}

export function openFix({ net, store, console: con }) {
  closeFixPanel();
  const kind = con.sabotage;
  const body = h('div', { class: 'task-stage', style: { padding: '18px', background: '#252b33' } });
  const msg = h('div', { class: 'task-msg' });
  const TITLES = { reactor: '원자로 붕괴 막기', o2: '산소 공급 복구', lights: '전등 고치기', comms: '통신 복구' };
  const el = h('div', { class: 'modal' },
    h('div', { class: 'panel task-panel' },
      h('button', { class: 'close', title: '닫기', onclick: () => closeFixPanel() }, h('img', { src: 'assets/ui/close.png', alt: '닫기' })),
      h('h3', {}, TITLES[kind]), body, msg));
  document.getElementById('ui').append(el);
  const send = async (action, value) => {
    const r = await net.request('fix', value === undefined ? { consoleId: con.id, action } : { consoleId: con.id, action, value });
    if (!r.ok) { msg.textContent = errorText(r.error); msg.className = 'task-msg bad'; }
    return r;
  };
  const state = { el, cleanup: null };
  current = state;
  const sab = () => store.state?.sabotage?.active;

  let render = () => {};
  if (kind === 'reactor') {
    const pad = h('div', { style: {
      width: '240px', height: '260px', margin: '0 auto', borderRadius: '20px', border: '5px solid #000', background: '#0d2b3d',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '110px', touchAction: 'none', cursor: 'pointer',
    } }, '🖐');
    let holding = false;
    pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); holding = true; pad.style.background = '#1f6f9a'; play('taskStep', { vol: 0.5 }); send('hold'); });
    const release = () => { if (!holding) return; holding = false; pad.style.background = '#0d2b3d'; send('release'); };
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);
    const status = h('div', { style: { textAlign: 'center', marginTop: '10px', fontWeight: 800 } });
    body.append(pad, status);
    render = () => { status.textContent = `손을 올린 장치: ${sab()?.held?.length ?? 0}/2 — 다른 장치에서 동료도 손을 올려야 합니다.`; };
    state.cleanup = () => release();
  } else if (kind === 'o2' || (kind === 'comms' && sab()?.mode === 'keypad')) {
    // 산소: 쪽지에 적힌 오늘의 코드 5자리 / 미라 HQ 통신: 장치 화면에 뜬 4자리 코드
    const len = kind === 'o2' ? 5 : 4;
    let entry = '';
    const screen = h('div', { style: { fontFamily: 'monospace', fontSize: '34px', background: '#0b1a12', color: '#7dff9b', padding: '8px', textAlign: 'center', border: '3px solid #000', borderRadius: '8px', letterSpacing: '0.2em', minHeight: '58px' } });
    const note = h('div', { style: { background: kind === 'o2' ? '#fff7b8' : '#13202c', color: kind === 'o2' ? '#222' : '#ff5d5d', padding: '8px 12px', transform: kind === 'o2' ? 'rotate(-3deg)' : 'none', fontWeight: 900, fontSize: '20px', border: '2px solid #000', width: 'fit-content', margin: '0 auto 10px', fontFamily: kind === 'o2' ? 'inherit' : 'monospace' } });
    const key = (label, fn) => h('button', { class: 'btn', style: { height: '58px', fontSize: '22px' }, onclick: fn }, label);
    const press = (d) => { if (entry.length < len) { entry += d; play('keypad', { vol: 0.5 }); upd(); } };
    const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => key(String(n), () => press(String(n))));
    keys.push(key('✕', () => { entry = ''; upd(); }), key('0', () => press('0')), key('✓', async () => {
      const r = await send('code', Number(entry));
      if (r.ok) { play('keypadGood'); msg.textContent = '이 장치는 복구되었습니다.'; msg.className = 'task-msg ok'; setTimeout(closeFixPanel, 700); }
      entry = ''; upd();
    }));
    const upd = () => { screen.textContent = entry || ' '; };
    body.append(note, screen, h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '10px' } }, keys));
    render = () => {
      const a = sab();
      note.textContent = kind === 'o2' ? `오늘의 코드: ${a?.code ?? '-----'}` : `코드: ${a?.codes?.[con.id] ?? '----'}`;
      if (a?.fixed?.includes(con.id)) { msg.textContent = '이 장치는 이미 복구되었습니다. 다른 장치도 복구하세요.'; msg.className = 'task-msg ok'; }
    };
    upd();
  } else if (kind === 'lights') {
    const row = h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center' } });
    body.append(row);
    render = () => {
      const sw = sab()?.switches ?? [];
      row.replaceChildren(...sw.map((on, i) => h('button', {
        style: { width: '64px', height: '120px', borderRadius: '10px', border: '4px solid #000', background: on ? '#38d16a' : '#4a4f57', cursor: 'pointer', display: 'flex', alignItems: on ? 'flex-start' : 'flex-end', justifyContent: 'center', padding: '8px' },
        onclick: () => { play('lightSwitch', { vol: 0.6 }); send('switch', i); },
      }, h('div', { style: { width: '36px', height: '40px', background: '#ddd', border: '3px solid #000', borderRadius: '6px' } }))));
    };
    msg.textContent = '모든 스위치를 초록색(켜짐)으로 올리세요.';
  } else if (kind === 'comms') {
    const W = 460, H = 300;
    const canvas = h('canvas', { width: W, height: H, style: { width: '100%', touchAction: 'none', cursor: 'grab' } });
    body.append(canvas);
    const g = canvas.getContext('2d');
    let dial = sab()?.dial ?? 0, lastSent = 0, dragging = false, raf = 0;
    const toAngle = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
      return ((Math.atan2(y - 220, x - 360) * 180) / Math.PI + 360) % 360;
    };
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); dragging = true; });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      dial = toAngle(e);
      if (performance.now() - lastSent > 120) { lastSent = performance.now(); send('dial', Math.round(dial)); }
    });
    canvas.addEventListener('pointerup', () => { dragging = false; send('dial', Math.round(dial)); });
    const draw = (t) => {
      const target = sab()?.target ?? 0;
      const diff = Math.abs((((dial - target) % 360) + 540) % 360 - 180) / 180; // 0 = 일치
      g.fillStyle = '#10202a'; g.fillRect(0, 0, W, H);
      g.strokeStyle = diff < 0.05 ? '#5bff7a' : '#7fd0ff'; g.lineWidth = 3; g.beginPath();
      for (let x = 10; x < 300; x += 3) {
        const noise = diff * 40 * Math.sin(x * 0.9 + t / 60) * Math.random();
        g.lineTo(x, 110 + Math.sin(x / 18 + t / 300) * 40 * (1 - diff * 0.6) + noise);
      }
      g.stroke();
      g.fillStyle = '#9aa6b2'; g.strokeStyle = '#000'; g.lineWidth = 5; g.beginPath(); g.arc(360, 220, 62, 0, Math.PI * 2); g.fill(); g.stroke();
      const a = (dial * Math.PI) / 180;
      g.strokeStyle = '#222'; g.lineWidth = 8; g.beginPath(); g.moveTo(360, 220); g.lineTo(360 + Math.cos(a) * 52, 220 + Math.sin(a) * 52); g.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    state.cleanup = () => cancelAnimationFrame(raf);
    msg.textContent = '다이얼을 돌려 신호를 맞추세요.';
  }
  render();
  const unsub = store.subscribe(() => {
    if (!sab() || sab().kind !== kind) { toast('사보타주가 해결되었습니다.'); closeFixPanel(); return; }
    render();
  });
  const prevCleanup = state.cleanup;
  state.cleanup = () => { prevCleanup?.(); unsub(); };
}
