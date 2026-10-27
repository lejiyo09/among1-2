// 지도: 맵별 미니맵 위에 내 위치·미션 표시. 임포스터는 사보타주 지도로 사용.
// 관리실 탁자에서 열면(admin) 원작처럼 방마다 사람 수만큼 아이콘을 보여 준다 (서버가 1초마다 방별 인원만 보내 줌)
import { h, toast, errorText } from './dom.js';
import { PHASES, ROLES, COLORS, USE_RANGE } from '../../shared/constants.js';
import { crewIcon } from '../game/recolor.js';
import { ROOM_NAMES_KO } from '../../shared/tasks.js';
import { play } from '../audio.js';

/**
 * 맵별 미니맵 그림과 월드 → 미니맵 변환.
 * 스켈드: 원작 미니맵(980×561), 방 경계를 비교해 구한 값. 그 밖의 맵: 빌드 도구가 바닥으로 만든 그림(가로 1000px)
 */
function minimapOf(map) {
  if (map.id === 'skeld') return { src: 'assets/map/minimap.png', sx: 0.273, sy: 0.2726, ox: -3, oy: 3, w: 980, h: 561 };
  const s = 1000 / map.width;
  return { src: map.minimap, sx: s, sy: s, ox: 0, oy: 0, w: 1000, h: Math.round(map.height * s) };
}

const SABOTAGES = [
  { kind: 'reactor', icon: '☢', title: '원자로 붕괴' },
  { kind: 'o2', icon: '🫧', title: '산소 고갈' },
  { kind: 'lights', icon: '💡', title: '전등 고장' },
  { kind: 'comms', icon: '📡', title: '통신 방해' },
];

export class MapView {
  constructor({ net, store, root }) {
    this.net = net;
    this.store = store;
    this.mode = null;
    this.layer = h('div', {});
    this.img = h('img', { alt: '지도', draggable: false });
    this.wrap = h('div', { class: 'wrap' }, this.img, this.layer,
      h('button', { class: 'icon-btn map-close', title: '닫기', onclick: () => this.close() }, h('img', { src: 'assets/ui/close.png', alt: '닫기' })));
    this.el = h('div', { class: 'mapview hidden', onclick: (e) => { if (e.target === this.el) this.close(); } }, this.wrap);
    root.append(this.el);
    this.timer = null;
    this.adminRooms = null;
    net.on('adminMap', (m) => { this.adminRooms = m.rooms; if (this.mode === 'admin') this.render(); });
    store.subscribe(() => { if (this.mode) this.render(); });
  }

  open(mode) {
    const st = this.store.state;
    if (!st || st.phase !== PHASES.PLAYING) return;
    if (mode === 'sabotage' && st.you?.role !== ROLES.IMPOSTOR) return;
    if (this.mode !== mode) this.builtFor = null;
    this.mode = mode;
    this.el.classList.remove('hidden');
    this.el.classList.toggle('sabotage', mode === 'sabotage');
    this.el.classList.toggle('admin', mode === 'admin');
    this.render();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.render(), 250);
    clearInterval(this.adminTimer);
    if (mode === 'admin') {
      this.adminRooms = null;
      const poll = () => this.net.request('admin', {}).then((r) => { if (!r.ok && r.error !== 'COMMS_DOWN') { toast(errorText(r.error), 'error'); this.close(); } });
      poll();
      this.adminTimer = setInterval(poll, 1000);
    }
  }

  toggle(mode) {
    if (this.mode) this.close(); else this.open(this.store.isImpostor && mode === 'map' ? 'sabotage' : mode);
  }

  close() {
    clearInterval(this.adminTimer);
    this.mode = null;
    this.builtFor = null;
    clearInterval(this.timer);
    this.el.classList.add('hidden');
  }

  /** 방 이름과 사보타주 버튼은 열 때 한 번만 만든다 (계속 다시 만들면 클릭이 씹힌다) */
  build() {
    const map = this.store.map;
    const mm = minimapOf(map);
    if (this.img.getAttribute('src') !== mm.src) this.img.src = mm.src;
    this.img.classList.toggle('tinted', map.id === 'skeld'); // 원작 스켈드 미니맵 그림은 색을 바꿔 쓴다
    this.wrap.style.aspectRatio = `${mm.w} / ${mm.h}`;
    this.wrap.style.width = `min(980px, 96vw, calc(92vh * ${mm.w / mm.h}))`;
    this.img.alt = `${map.displayName} 지도`;
    const toMap = this.toMap = (x, y) => ({ left: `${((x * mm.sx + mm.ox) / mm.w) * 100}%`, top: `${((y * mm.sy + mm.oy) / mm.h) * 100}%` });
    const labels = this.store.map.rooms.map((r) => {
      const [x0, y0, x1, y1] = r.rect;
      return h('div', { class: 'map-label', style: toMap((x0 + x1) / 2, (y0 + y1) / 2 - 40) }, ROOM_NAMES_KO[r.name]);
    });
    this.saboButtons = [];
    if (this.mode === 'sabotage') {
      // 사보타주 버튼은 그 사보타주의 첫 수리 장치가 있는 방에 둔다 (맵에 없는 사보타주는 버튼도 없다)
      for (const s of SABOTAGES) {
        const con = map.consoles.find((c) => c.sabotage === s.kind);
        const r = con && map.rooms.find((x) => x.name === con.room);
        if (!r) continue;
        const [x0, y0, x1, y1] = r.rect;
        const b = h('button', { class: 'map-sabo', title: s.title, style: toMap((x0 + x1) / 2 - (map.doors.length ? 100 : 0), (y0 + y1) / 2 + 30), onclick: () => this.sabotage(s.kind) }, s.icon);
        b.dataset.kind = s.kind;
        this.saboButtons.push(b);
      }
      for (const room of [...new Set(map.doors.map((d) => d.room))]) {
        const r = this.store.map.rooms.find((x) => x.name === room);
        const [x0, y0, x1, y1] = r.rect;
        const b = h('button', { class: 'map-sabo door', title: `${ROOM_NAMES_KO[room]} 문 닫기`, style: toMap((x0 + x1) / 2 + 110, (y0 + y1) / 2 + 30), onclick: () => this.sabotage('doors', room) }, '🚪');
        b.dataset.room = room;
        this.saboButtons.push(b);
      }
    }
    this.dynamic = h('div', {});
    this.layer.replaceChildren(...labels, ...this.saboButtons, this.dynamic);
  }

  render() {
    const st = this.store.state;
    if (!st || st.phase !== PHASES.PLAYING) { this.close(); return; }
    if (this.builtFor !== this.mode) { this.build(); this.builtFor = this.mode; }
    const items = [];
    const toMap = this.toMap;
    const you = st.you;
    if (this.mode === 'admin') {
      // 탁자에서 멀어지면 닫는다 (원작)
      const t = this.store.map.adminTable;
      if (!t || Math.hypot(this.store.me.x - t.x, this.store.me.y - t.y) > USE_RANGE * 1.3 || !you?.alive) { this.close(); return; }
      if (st.sabotage?.active?.kind === 'comms') {
        items.push(h('div', { class: 'admin-static' }, '통신 방해 중'));
      } else {
        for (const r of this.store.map.rooms) {
          const n = this.adminRooms?.[r.name] ?? 0;
          if (!n) continue;
          const [x0, y0, x1, y1] = r.rect;
          const icons = Array.from({ length: n }, () => h('img', { src: crewIcon(7), alt: '' }));
          items.push(h('div', { class: 'admin-icons', style: toMap((x0 + x1) / 2, (y0 + y1) / 2 + 10) }, ...icons));
        }
      }
      this.dynamic.replaceChildren(...items);
      return;
    }
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
    // 버튼 활성 상태만 갱신
    const now = this.net.serverNow();
    const busy = !!sab || now < (st.sabotage?.cooldownUntil ?? 0);
    for (const b of this.saboButtons) {
      b.disabled = b.dataset.room ? (st.sabotage?.doorCooldowns?.[b.dataset.room] ?? 0) > now : busy;
    }
    // 내 위치
    const me = this.store.player(this.store.playerId);
    if (me) items.push(h('div', { class: 'map-dot', style: { ...toMap(this.store.me.x, this.store.me.y), background: getComputedColor(me.color) } }));
    this.dynamic.replaceChildren(...items);
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
