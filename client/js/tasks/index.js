// 미션 창 공통 틀: 서버가 보낸 문제(challenge)로 미니게임을 띄우고, 끝나면 답을 서버에 제출한다
import { h, errorText } from '../ui/dom.js';
import { TASK_DEFS } from '../../shared/tasks.js';
import { ROOM_NAMES_KO } from '../../shared/tasks.js';
import { play } from '../audio.js';
import { GAMES } from './games.js';

let current = null;

export function taskPanelOpen() {
  return !!current;
}

export function closeTaskPanel(sendCancel = true) {
  if (!current) return;
  const c = current;
  current = null;
  c.destroy?.();
  c.el.remove();
  if (sendCancel && !c.finished) c.net.send({ t: 'taskCancel' });
}

/**
 * @param {{net:any, store:any, defId:string, step:number, spotId:string, challenge:any}} m
 */
export function openTask({ net, store, defId, step, spotId, challenge }) {
  closeTaskPanel(false);
  const def = TASK_DEFS[defId];
  const game = GAMES[defId];
  const spot = store.map.tasks.find((s) => s.id === spotId);
  const startedAt = performance.now();
  const msg = h('div', { class: 'task-msg' });
  const stage = h('div', { class: 'task-stage' });
  const stepName = def.steps[step]?.name;
  const el = h('div', { class: 'modal' },
    h('div', { class: 'panel task-panel' },
      h('button', { class: 'close', title: '닫기 (Esc)', onclick: () => closeTaskPanel() }, h('img', { src: 'assets/ui/close.png', alt: '닫기' })),
      h('h3', {}, `${def.name}${stepName ? ` — ${stepName}` : ''}`, h('span', { class: 'muted', style: { fontSize: '13px' } }, `  ${ROOM_NAMES_KO[spot?.room] ?? ''}`)),
      stage, msg));
  document.getElementById('ui').append(el);

  const state = { net, el, finished: false, destroy: null };
  current = state;

  const onKey = (e) => { if (e.key === 'Escape') closeTaskPanel(); };
  window.addEventListener('keydown', onKey);

  const ctx = {
    challenge, step, spot, defId, store,
    message(text, kind = '') { msg.textContent = text; msg.className = `task-msg ${kind}`; },
    sound: play,
    /** 퍼즐 완료 → 최소 수행 시간을 채운 뒤 서버에 제출 */
    async complete(answer) {
      if (state.finished) return;
      state.finished = true;
      const minMs = def.minMs + (defId === 'card' && typeof answer === 'number' ? Math.max(0, answer - def.minMs) : 0);
      const wait = Math.max(0, minMs + 150 - (performance.now() - startedAt));
      if (wait > 200) ctx.message('확인 중…');
      await new Promise((r) => setTimeout(r, wait));
      const r = await net.request('taskComplete', { taskId: defId, answer });
      if (current !== state) return;
      if (r.ok) {
        ctx.message('완료!', 'ok');
        setTimeout(() => { if (current === state) closeTaskPanel(false); }, 650);
      } else {
        ctx.message(errorText(r.error), 'bad');
        setTimeout(() => { if (current === state) closeTaskPanel(false); }, 1400);
      }
    },
  };

  try {
    const inst = game ? game(stage, ctx) : null;
    state.destroy = () => { window.removeEventListener('keydown', onKey); inst?.destroy?.(); };
  } catch (err) {
    console.error(err);
    ctx.message('미션을 불러오지 못했습니다.', 'bad');
    state.destroy = () => window.removeEventListener('keydown', onKey);
  }
}

/** 캔버스 미니게임 도우미: 논리 크기 W×H, 포인터 좌표 변환, 애니메이션 루프 */
export function canvasStage(stage, W, H) {
  const canvas = h('canvas', { width: W, height: H });
  stage.append(canvas);
  const g = canvas.getContext('2d');
  const toLocal = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  let raf = 0;
  let alive = true;
  const loop = (fn) => {
    let last = performance.now();
    const frame = (t) => {
      if (!alive) return;
      fn(Math.min(50, t - last), t);
      last = t;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  };
  return { canvas, g, toLocal, loop, stop: () => { alive = false; cancelAnimationFrame(raf); } };
}

/** 둥근 사각형 */
export function rrect(g, x, y, w, hh, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + hh, r);
  g.arcTo(x + w, y + hh, x, y + hh, r);
  g.arcTo(x, y + hh, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
