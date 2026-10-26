// 지도: 원작 스켈드 미니맵 위에 내 위치·미션 표시. 임포스터는 사보타주 지도로 사용
import { h, toast, errorText } from './dom.js';
import { PHASES, ROLES, COLORS } from '../../shared/constants.js';
import { ROOM_NAMES_KO } from '../../shared/tasks.js';
import { play } from '../audio.js';

// 월드(skeld.png 3587×2064) → 미니맵(980×561) 변환. 방 경계를 비교해 구한 값
const SX = 0.273, SY = 0.2726, OX = -3, OY = 3;
const MW = 980, MH = 561;
const toMap = (x, y) => ({ left: `${((x * SX + OX) / MW) * 100}%`, top: `${((y * SY + OY) / MH) * 100}%` });

const SABOTAGES = [
  { kind: 'reactor', room: 'Reactor', icon: '☢', title: '원자로 붕괴' },
  { kind: 'o2', room: 'O2', icon: '🫧', title: '산소 고갈' },
  { kind: 'lights', room: 'Electrical', icon: '💡', title: '전등 고장' },
  { kind: 'comms', room: 'Communications', icon: '📡', title: '통신 방해' },
];
const DOOR_ROOMS = ['Cafeteria', 'Storage', 'UpperEngine', 'LowerEngine', 'Security', 'Electrical', 'MedBay'];

export class MapView {
  constructor({ net, store, root }) {
    this.net = net;
    this.store = store;
    this.mode = null;
    this.layer = h('div', {});
    this.img = h('img', { src: 'assets/map/minimap.png', alt: '스켈드 지도', draggable: false });
    this.wrap = h('div', { class: 'wrap' }, this.img, this.layer,
      h('button', { class: 'icon-btn map-close', title: '닫기', onclick: () => this.close() }, h('img', { src: 'assets/ui/close.png', alt: '닫기' })));
    this.el = h('div', { class: 'mapview hidden', onclick: (e) => { if (e.target === this.el) this.close(); } }, this.wrap);
    root.append(this.el);
    this.timer = null;
    store.subscribe(() => { if (this.mode) this.render(); });
  }

  open(mode) {
    const st = this.store.state;
    if (!st || st.phase !== PHASES.PLAYING) return;
    if (mode === 'sabotage' && st.you?.role !== ROLES.IMPOSTOR) return;
    this.mode = mode;
    this.el.classList.remove('hidden');
    this.el.classList.toggle('sabotage', mode === 'sabotage');
    this.render();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.render(), 250);
  }

  toggle(mode) {
    if (this.mode) this.close(); else this.open(this.store.isImpostor && mode === 'map' ? 'sabotage' : mode);
  }

  close() {
    this.mode = null;
    clearInterval(this.timer);
    this.el.classList.add('hidden');
  }

  render() {
    const st = this.store.state;
    if (!st || st.phase !== PHASES.PLAYING) { this.close(); return; }
    const items = [];
    for (const r of this.store.map.rooms) {
      const [x0, y0, x1, y1] = r.rect;
      items.push(h('div', { class: 'map-label', style: toMap((x0 + x1) / 2, (y0 + y1) / 2 - 40) }, ROOM_NAMES_KO[r.name]));
    }
    const you = st.you;
    const commsDown = st.sabotage?.active?.kind === 'comms';
    if (this.mode === 'map' && you?.tasks && !commsDown && !you.fake) {
      for (const t of you.tasks) {
        if (t.done || !t.spot) continue;
        const s = this.store.map.tasks.find((x) => x.id === t.spot);
        if (s) items.push(h('div', { class: 'map-task', style: toMap(s.x, s.y) }, '!'));
      }
    }
    const sab = st.sabotage?.active;
    if (sab) {
      for (const c of this.store.map.consoles.filter((x) => x.sabotage === sab.kind)) {
        items.push(h('div', { class: 'map-task', style: { ...toMap(c.x, c.y), color: '#ff3030' } }, '⚠'));
      }
    }
    if (this.mode === 'sabotage') {
      const now = this.net.serverNow();
      const busy = !!sab || now < (st.sabotage?.cooldownUntil ?? 0);
      for (const s of SABOTAGES) {
        const r = this.store.map.rooms.find((x) => x.name === s.room);
        const [x0, y0, x1, y1] = r.rect;
        items.push(h('button', { class: 'map-sabo', title: s.title, disabled: busy, style: toMap((x0 + x1) / 2, (y0 + y1) / 2 + 30), onclick: () => this.sabotage(s.kind) }, s.icon));
      }
      for (const room of DOOR_ROOMS) {
        const r = this.store.map.rooms.find((x) => x.name === room);
        const [x0, y0, x1, y1] = r.rect;
        const cd = (st.sabotage?.doorCooldowns?.[room] ?? 0) > now;
        items.push(h('button', { class: 'map-sabo door', title: `${ROOM_NAMES_KO[room]} 문 닫기`, disabled: cd, style: toMap((x0 + x1) / 2 + 70, (y0 + y1) / 2 + 30), onclick: () => this.sabotage('doors', room) }, '🚪'));
      }
    }
    // 내 위치
    const me = this.store.player(this.store.playerId);
    if (me) items.push(h('div', { class: 'map-dot', style: { ...toMap(this.store.me.x, this.store.me.y), background: getComputedColor(me.color) } }));
    this.layer.replaceChildren(...items);
  }

  async sabotage(kind, room) {
    const r = await this.net.request('sabotage', room ? { kind, room } : { kind });
    if (!r.ok) toast(errorText(r.error), 'error');
    else { play('uiSelect'); if (kind !== 'doors') this.close(); }
  }
}

function getComputedColor(c) {
  return COLORS[c]?.[1] ?? '#fff';
}
