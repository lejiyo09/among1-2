// 보안실 CCTV (원작 스켈드 보안실 책상): 감시 카메라 4대의 화면을 2×2 로 보여 준다.
// 화면 자체는 GameScene 이 Phaser 카메라 4대로 그리고, 여기서는 테두리·REC 표시·닫기 버튼만 덮는다.
// 서버는 보는 동안에만 카메라에 비친 사람 위치를 보내 준다. 보는 동안에는 움직일 수 없다.
import { h, toast, errorText } from './dom.js';
import { play } from '../audio.js';

export class Cams {
  constructor({ net, store, root }) {
    this.net = net;
    this.store = store;
    this.scene = null;
    this.open = false;
    this.cells = [];
    this.closeBtn = h('button', { class: 'icon-btn cams-close', title: '닫기 (Esc)', onclick: () => this.close() }, h('img', { src: 'assets/ui/close.png', alt: '닫기' }));
    this.el = h('div', { class: 'cams hidden' }, this.closeBtn);
    root.append(this.el);
    window.addEventListener('keydown', (e) => { if (this.open && (e.key === 'Escape' || e.key === 'e')) this.close(); });
    window.addEventListener('resize', () => { if (this.open) this.layout(); });
    store.subscribe(() => {
      if (!this.open) return;
      const st = store.state;
      // 서버가 보기를 끝냈거나(회의, 사망 등) 게임이 끝나면 닫는다
      if (!st || st.phase !== 'playing' || !st.you?.watchingCams) { if (!this.pending) this.close(false); return; }
      this.renderStatic();
    });
  }

  async show() {
    if (this.open || !this.scene) return;
    this.pending = true;
    const r = await this.net.request('cams', { on: true });
    this.pending = false;
    if (!r.ok) { toast(errorText(r.error), 'error'); return; }
    this.open = true;
    play('uiSelect');
    this.el.classList.remove('hidden');
    document.body.classList.add('cams-open');
    this.layout();
  }

  layout() {
    const rects = this.scene.startCams(this.store.map.cameras);
    this.cells.forEach((c) => c.remove());
    this.cells = rects.map((r) => h('div', { class: 'cell', style: { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` } }, h('span', { class: 'rec' }, '● REC')));
    this.el.prepend(...this.cells);
    const last = rects[rects.length - 1];
    Object.assign(this.closeBtn.style, { left: `${last.x + last.w - 18}px`, top: `${rects[0].y - 22}px` });
    this.renderStatic();
  }

  /** 통신 방해 중에는 화면 대신 잡음 (원작) */
  renderStatic() {
    const down = this.store.state?.sabotage?.active?.kind === 'comms';
    for (const c of this.cells) {
      c.classList.toggle('static', down);
      c.lastChild.textContent = down ? '통신 방해' : '● REC';
      if (down) c.lastChild.className = ''; else c.lastChild.className = 'rec';
    }
  }

  close(notify = true) {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    document.body.classList.remove('cams-open');
    this.scene?.stopCams();
    if (notify) this.net.request('cams', { on: false });
  }
}
