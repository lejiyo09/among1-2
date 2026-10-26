// 로비: 방 코드, 플레이어 목록, 준비, 설정(방장), 시작, 채팅
import { h, toast, errorText } from './dom.js';
import { crewIcon } from '../game/recolor.js';
import { COLORS, PHASES, DEFAULT_SETTINGS, SETTING_LIMITS, maxImpostorsFor } from '../../shared/constants.js';
import { play } from '../audio.js';

/** 설정 항목: [키, 라벨, 종류, 옵션] */
const SETTING_FIELDS = [
  ['map', '맵', 'map'],
  ['impostors', '임포스터 수', 'int'],
  ['killCooldown', '킬 쿨다운(초)', 'num', 2.5],
  ['killDistance', '킬 거리', 'enum', { short: '짧음', medium: '보통', long: '김' }],
  ['emergencyMeetings', '긴급 회의 횟수', 'int'],
  ['emergencyCooldown', '긴급 회의 쿨다운(초)', 'int'],
  ['discussionTime', '토론 시간(초)', 'int'],
  ['votingTime', '투표 시간(초)', 'int'],
  ['confirmEjects', '추방 시 역할 공개', 'bool'],
  ['anonymousVotes', '익명 투표', 'bool'],
  ['playerSpeed', '이동 속도', 'num', 0.25],
  ['crewVision', '승무원 시야', 'num', 0.25],
  ['impostorVision', '임포스터 시야', 'num', 0.25],
  ['commonTasks', '공통 미션', 'int'],
  ['longTasks', '긴 미션', 'int'],
  ['shortTasks', '짧은 미션', 'int'],
  ['visualTasks', '시각 미션 표시', 'bool'],
  ['taskBarUpdates', '미션 바 갱신', 'enum', { always: '항상', meetings: '회의 때', never: '안 함' }],
];

export class Lobby {
  constructor({ net, store, chat, root }) {
    this.net = net;
    this.store = store;
    this.codeEl = h('span', { class: 'code' });
    this.countEl = h('span', { class: 'muted' });
    this.playerList = h('div', { class: 'player-list' });
    this.colorGrid = h('div', { class: 'lobby-colors' });
    this.settingsEl = h('div', { class: 'settings' });
    this.readyBtn = h('button', { class: 'btn primary', onclick: () => this.toggleReady() }, '준비');
    this.startBtn = h('button', { class: 'btn primary start-btn', onclick: () => this.start() }, 'START');
    this.startHint = h('div', { class: 'muted', style: { fontWeight: 700, textShadow: '0 1px 2px #000' } });
    this.useBtn = h('button', { class: 'action lobby-use', title: '노트북 (E)', disabled: true, onclick: () => this.openCustomize() },
      h('img', { src: 'assets/ui/use.png', alt: 'USE' }), h('span', { class: 'key' }, 'E'));
    window.addEventListener('keydown', (e) => {
      const a = document.activeElement;
      if (this.el.classList.contains('hidden') || (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT'))) return;
      if ((e.key === 'e' || e.key === ' ') && !this.useBtn.disabled) { e.preventDefault(); this.openCustomize(); }
      if (e.key === 'Escape') this.closeCustomize();
    });
    this.chatView = chat.view();
    this.chatPanel = h('div', { class: 'panel chat-float' }, h('div', { class: 'section-title' }, '채팅'), this.chatView.el);

    const inviteUrl = () => `${location.origin}${location.pathname}?room=${this.store.code}`;
    this.el = h('div', { class: 'lobby hidden' },
      h('div', { class: 'lobby-top' },
        h('div', { class: 'panel room-code' },
          h('span', { class: 'muted' }, '방 코드'), this.codeEl,
          h('button', { class: 'btn small', title: '초대 링크 복사', onclick: async () => {
            try { await navigator.clipboard.writeText(inviteUrl()); toast('초대 링크를 복사했습니다.'); } catch { toast(inviteUrl()); }
          } }, '링크 복사'),
        ),
        h('div', { class: 'panel room-code' }, this.countEl),
        h('button', { class: 'btn small chat-toggle', onclick: () => this.chatPanel.classList.toggle('open') }, '채팅'),
        h('button', { class: 'btn small danger', onclick: () => this.leave() }, '나가기'),
      ),
      h('div', { class: 'panel lobby-side' },
        h('div', { class: 'section-title' }, '플레이어'), this.playerList,
        h('div', { class: 'section-title' }, '내 색'), this.colorGrid,
        h('div', { class: 'section-title' }, '게임 설정'), this.settingsEl,
      ),
      this.chatPanel,
      h('div', { class: 'lobby-bottom' }, this.startHint, this.readyBtn, this.startBtn),
      this.useBtn,
    );
    root.append(this.el);
    store.subscribe(() => this.render());
  }

  render() {
    const st = this.store.state;
    const show = !!st && st.phase === PHASES.LOBBY;
    this.el.classList.toggle('hidden', !show);
    if (!show) { this.closeCustomize(); return; }
    const me = this.store.player(this.store.playerId);
    const host = this.store.isHost;
    this.codeEl.textContent = st.code;
    this.countEl.textContent = st.practice ? '연습 모드 (혼자)' : `${st.players.length} / 15명`;

    this.playerList.replaceChildren(...st.players.map((p) => h('div', { class: 'player-row' },
      h('img', { src: crewIcon(p.color), alt: '' }),
      h('span', { class: 'name' }, p.name, p.id === this.store.playerId ? ' (나)' : ''),
      p.host ? h('span', { class: 'tag host' }, '방장') : null,
      !p.connected ? h('span', { class: 'tag off' }, '연결 끊김') : p.ready ? h('span', { class: 'tag ready' }, '준비') : h('span', { class: 'tag' }, '대기'),
      host && !p.host ? h('button', { class: 'btn small danger', title: '내보내기', onclick: () => this.kick(p) }, '×') : null,
    )));

    const used = new Map(st.players.map((p) => [p.color, p.id]));
    this.colorGrid.replaceChildren(...COLORS.map((c, i) => {
      const owner = used.get(i);
      const taken = owner && owner !== this.store.playerId;
      return h('button', {
        class: `color-cell${me?.color === i ? ' selected' : ''}${taken ? ' taken' : ''}`, title: c[0], disabled: taken,
        onclick: async () => { const r = await this.net.request('setColor', { color: i }); if (!r.ok) toast(errorText(r.error), 'error'); else play('uiSelect'); },
      }, h('img', { src: crewIcon(i), alt: c[0] }));
    }));

    this.renderSettings(st.settings, host, st.players.length);

    this.readyBtn.textContent = me?.ready ? '준비 취소' : '준비';
    this.readyBtn.className = `btn ${me?.ready ? '' : 'primary'}`;
    this.readyBtn.classList.toggle('hidden', host);
    this.startBtn.classList.toggle('hidden', !host);
    const notReady = st.players.filter((p) => !p.ready || !p.connected).length;
    let hint = '';
    if (st.players.length < st.minPlayers) hint = `최소 ${st.minPlayers}명이 필요합니다. (현재 ${st.players.length}명)`;
    else if (notReady) hint = `준비하지 않은 플레이어 ${notReady}명`;
    if (!host) hint = me?.ready ? '방장이 시작하기를 기다리는 중…' : '준비 버튼을 눌러 주세요.';
    if (st.practice) hint = '혼자 연습 · 승패 없음 · 게임 중 "연습 끝내기"로 복귀';
    this.startHint.textContent = hint;
    this.startBtn.disabled = host && (st.players.length < st.minPlayers || notReady > 0);
  }

  renderSettings(s, editable, count) {
    const rows = [];
    if (this.store.state?.practice) {
      // 연습 모드: 해 볼 역할 고르기 (원작 자유 플레이의 노트북 역할 전환)
      rows.push(h('label', {}, '내 역할'), h('select', { onchange: (e) => this.set('practiceRole', e.target.value) },
        h('option', { value: 'crewmate', selected: s.practiceRole !== 'impostor' }, '승무원'),
        h('option', { value: 'impostor', selected: s.practiceRole === 'impostor' }, '임포스터')));
    }
    for (const [key, label, kind, opt] of SETTING_FIELDS) {
      if (key === 'impostors' && this.store.state?.practice) continue;
      const val = s[key];
      let ctl;
      if (kind === 'map') {
        const name = (id) => this.store.maps[id]?.displayName ?? id;
        const ids = this.store.state?.maps ?? [val];
        ctl = editable
          ? h('select', { onchange: (e) => this.set(key, e.target.value) }, ...ids.map((id) => h('option', { value: id, selected: id === val }, name(id))))
          : h('span', { class: 'val' }, name(val));
        rows.push(h('label', {}, label), ctl);
        continue;
      }
      if (!editable) {
        const text = kind === 'bool' ? (val ? '켬' : '끔') : kind === 'enum' ? opt[val] : String(val);
        ctl = h('span', { class: 'val' }, text);
      } else if (kind === 'bool') {
        ctl = h('input', { type: 'checkbox', checked: !!val, onchange: (e) => this.set(key, e.target.checked) });
      } else if (kind === 'enum') {
        ctl = h('select', { onchange: (e) => this.set(key, e.target.value) },
          ...Object.entries(opt).map(([k, v]) => h('option', { value: k, selected: k === val }, v)));
      } else {
        const [lo, hi] = SETTING_LIMITS[key];
        const max = key === 'impostors' ? Math.min(hi, maxImpostorsFor(Math.max(count, 4))) : hi;
        ctl = h('input', {
          type: 'number', min: lo, max, step: kind === 'int' ? 1 : opt, value: val, style: { width: '72px' },
          onchange: (e) => this.set(key, Number(e.target.value)),
        });
        ctl.addEventListener('keydown', (e) => e.stopPropagation());
      }
      rows.push(h('label', {}, label), ctl);
    }
    if (editable) rows.push(h('span'), h('button', { class: 'btn small', onclick: () => this.net.request('setSettings', { settings: { ...DEFAULT_SETTINGS } }) }, '원작 기본값'));
    // 포커스 중인 입력이 있으면 다시 그리지 않는다 (입력 중 깜빡임 방지)
    if (this.settingsEl.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    this.settingsEl.replaceChildren(...rows);
  }

  /** GameScene 이 매 프레임 알려 주는 상호작용 대상 (노트북 근처인지) */
  setTargets(t) {
    const on = t.use?.kind === 'laptop';
    if (this.useBtn.disabled === on) this.useBtn.disabled = !on;
  }

  /** 원작 대기실 노트북: 색 고르기 창 */
  openCustomize() {
    if (this.customize) return;
    play('uiSelect');
    const grid = h('div', { class: 'color-grid' });
    const render = () => {
      const st = this.store.state;
      if (!st) return;
      const me = this.store.player(this.store.playerId);
      const used = new Map(st.players.map((p) => [p.color, p.id]));
      grid.replaceChildren(...COLORS.map((c, i) => {
        const taken = used.has(i) && used.get(i) !== this.store.playerId;
        return h('button', {
          class: `color-cell${me?.color === i ? ' selected' : ''}${taken ? ' taken' : ''}`, title: c[0], disabled: taken,
          onclick: async () => { const r = await this.net.request('setColor', { color: i }); if (!r.ok) toast(errorText(r.error), 'error'); else play('uiSelect'); },
        }, h('img', { src: crewIcon(i), alt: c[0] }));
      }));
      preview.src = crewIcon(me?.color ?? 0);
    };
    const preview = h('img', { class: 'customize-preview', alt: '' });
    this.customize = h('div', { class: 'modal', onclick: (e) => { if (e.target === this.customize) this.closeCustomize(); } },
      h('div', { class: 'panel task-panel' },
        h('button', { class: 'close', title: '닫기 (Esc)', onclick: () => this.closeCustomize() }, h('img', { src: 'assets/ui/close.png', alt: '닫기' })),
        h('h3', {}, '꾸미기'),
        h('div', { class: 'customize-body' }, preview, grid)));
    this.unsubCustomize = this.store.subscribe(render);
    render();
    document.getElementById('ui').append(this.customize);
  }

  closeCustomize() {
    if (!this.customize) return;
    this.unsubCustomize?.();
    this.customize.remove();
    this.customize = null;
  }

  async set(key, value) {
    const r = await this.net.request('setSettings', { settings: { [key]: value } });
    if (!r.ok) toast(errorText(r.error), 'error');
  }

  async toggleReady() {
    const me = this.store.player(this.store.playerId);
    play('uiSelect');
    const r = await this.net.request('ready', { ready: !me?.ready });
    if (!r.ok) toast(errorText(r.error), 'error');
  }

  async start() {
    const r = await this.net.request('start');
    if (!r.ok) toast(errorText(r.error), 'error');
  }

  async kick(p) {
    if (!confirm(`${p.name} 님을 내보낼까요?`)) return;
    const r = await this.net.request('kick', { playerId: p.id });
    if (!r.ok) toast(errorText(r.error), 'error');
  }

  async leave() {
    await this.net.leave();
    this.store.clearRoom();
  }
}
