// 미라 HQ 출입 기록(Door Log)과 생체 신호(Vitals) 창.
// 장치 앞에 있는 동안 1초마다 서버에 물어 본다 (서버는 장치 앞 사람에게만 답한다). 멀어지거나 통신 방해가 오면 닫는다.
import { h, toast, errorText } from './dom.js';
import { crewIcon } from '../game/recolor.js';
import { USE_RANGE, COLORS } from '../../shared/constants.js';
import { play } from '../audio.js';

const SENSOR_KO = { north: '북쪽', southeast: '남동쪽', southwest: '남서쪽' };
const TITLES = { doorlog: '출입 기록', vitals: '생체 신호' };

export class Monitors {
  constructor({ net, store, root }) {
    this.net = net;
    this.store = store;
    this.kind = null;
    this.body = h('div', { class: 'monitor-body' });
    this.title = h('h3', {});
    this.el = h('div', { class: 'modal hidden' },
      h('div', { class: 'panel task-panel monitor-panel' },
        h('button', { class: 'close', title: '닫기 (Esc)', onclick: () => this.close() }, h('img', { src: 'assets/ui/close.png', alt: '닫기' })),
        this.title, this.body));
    root.append(this.el);
    net.on('doorLog', (m) => { if (this.kind === 'doorlog') this.renderDoorLog(m.entries); });
    net.on('vitals', (m) => { if (this.kind === 'vitals') this.renderVitals(m.players); });
    window.addEventListener('keydown', (e) => { if (this.kind && e.key === 'Escape') this.close(); });
    store.subscribe(() => this.check());
  }

  get isOpen() { return !!this.kind; }

  open(kind, spot) {
    this.close();
    this.kind = kind;
    this.spot = spot;
    this.title.textContent = TITLES[kind];
    this.body.replaceChildren(h('div', { class: 'muted' }, '불러오는 중…'));
    this.el.classList.remove('hidden');
    play('uiSelect');
    const poll = async () => {
      const r = await this.net.request(kind, {});
      if (!r.ok && this.kind === kind) {
        if (r.error === 'COMMS_DOWN') this.renderComms(); else { toast(errorText(r.error), 'error'); this.close(); }
      }
    };
    poll();
    this.timer = setInterval(poll, 1000);
  }

  /** 장치에서 멀어지거나 게임 단계가 바뀌면 닫는다 */
  check() {
    if (!this.kind) return;
    const st = this.store.state;
    const me = this.store.me;
    if (!st || st.phase !== 'playing' || !st.you?.alive || Math.hypot(me.x - this.spot.x, me.y - this.spot.y) > USE_RANGE * 1.3) this.close();
  }

  close() {
    clearInterval(this.timer);
    this.kind = null;
    this.el.classList.add('hidden');
  }

  renderComms() {
    this.body.replaceChildren(h('div', { class: 'monitor-static' }, '통신 방해 중'));
  }

  renderDoorLog(entries) {
    if (!entries.length) { this.body.replaceChildren(h('div', { class: 'muted', style: { textAlign: 'center', padding: '20px' } }, '기록이 없습니다.')); return; }
    this.body.replaceChildren(h('div', { class: 'doorlog' }, ...entries.map((e) => h('div', { class: 'row' },
      h('img', { src: crewIcon(e.color), alt: COLORS[e.color]?.[0] ?? '' }),
      h('span', {}, `${SENSOR_KO[e.sensor] ?? e.sensor} 센서 통과`),
      h('span', { class: 'muted' }, `${Math.max(0, Math.round(e.ago / 1000))}초 전`)))));
  }

  renderVitals(players) {
    this.body.replaceChildren(h('div', { class: 'vitals' }, ...players.map((p) => h('div', { class: `vital ${p.state}` },
      h('img', { src: crewIcon(p.color), alt: COLORS[p.color]?.[0] ?? '' }),
      h('div', { class: 'ecg' }),
      h('div', { class: 'label' }, p.state === 'alive' ? '' : p.state === 'dead' ? 'DEAD' : 'D/C')))));
  }
}
