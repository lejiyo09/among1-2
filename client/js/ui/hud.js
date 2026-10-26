// 게임 HUD: 미션 목록/진행률, 행동 버튼, 쿨다운, 사보타주 경보, 지도, 벤트 이동, 단축키
import { h, toast, errorText, secondsLeft } from './dom.js';
import { PHASES, ROLES } from '../../shared/constants.js';
import { TASK_DEFS, ROOM_NAMES_KO } from '../../shared/tasks.js';
import { play, loop } from '../audio.js';
import { openTask, closeTaskPanel, taskPanelOpen } from '../tasks/index.js';
import { openFix, closeFixPanel } from '../sabotage/index.js';
import { MapView } from './mapview.js';

const SABO_NAMES = { reactor: '원자로 붕괴', o2: '산소 고갈', lights: '전등 고장', comms: '통신 방해' };

export class Hud {
  constructor({ net, store, chat, root, overlays }) {
    this.net = net;
    this.store = store;
    this.chat = chat;
    this.overlays = overlays;
    this.scene = null;
    this.targets = {};
    this.typing = () => false;

    this.barFill = h('div', { class: 'fill' });
    this.barLabel = h('div', { class: 'label' }, '전체 미션');
    this.taskbar = h('div', { class: 'taskbar' }, this.barFill, this.barLabel);
    this.tasklist = h('div', { class: 'tasklist' });

    const btn = (name, label, key, onClick) => {
      const cd = h('div', { class: 'cd' });
      const b = h('button', { class: 'action', title: `${label} (${key})`, onclick: () => onClick() },
        h('img', { src: `assets/ui/${name}.png`, alt: label }), cd,
        ['sabotage', 'vent'].includes(name) ? h('div', { class: 'lbl' }, label) : null,
        h('span', { class: 'key' }, key));
      b.cd = cd;
      return b;
    };
    this.btn = {
      kill: btn('kill', 'KILL', 'Q', () => this.doKill()),
      vent: btn('vent', 'VENT', 'V', () => this.doVent()),
      sabotage: btn('sabotage', 'SABOTAGE', 'F', () => this.mapView.open('sabotage')),
      report: btn('report', 'REPORT', 'R', () => this.doReport()),
      use: btn('use', 'USE', 'E', () => this.doUse()),
    };
    this.actions = h('div', { class: 'actions' }, ...Object.values(this.btn));
    this.saboAlert = h('div', { class: 'sabo-alert hidden' });
    this.saboTimer = h('div', { class: 'sabo-timer hidden' });
    this.ventArrows = h('div', { class: 'vent-arrows' });
    this.ghostNote = h('div', { class: 'ghost-note hidden' });
    this.chatBtn = h('button', { class: 'icon-btn hidden', title: '유령 채팅', onclick: () => this.ghostChat.classList.toggle('hidden') }, h('span', {}, '💬'));
    this.ghostChatView = chat.view({ placeholder: '유령끼리 대화…' });
    this.ghostChat = h('div', { class: 'panel chat-float hidden' }, h('div', { class: 'section-title' }, '유령 채팅'), this.ghostChatView.el);

    this.el = h('div', { class: 'hud hidden' },
      this.saboAlert,
      h('div', { class: 'taskbar-wrap' }, this.taskbar, this.tasklist),
      h('div', { class: 'top-right' },
        this.chatBtn,
        h('button', { class: 'icon-btn', title: '지도 (Tab)', onclick: () => this.mapView.toggle('map') }, h('img', { src: 'assets/ui/map.png', alt: '지도' })),
        h('button', { class: 'icon-btn', title: '나가기', onclick: () => this.leave() }, h('span', {}, '⏏')),
      ),
      this.saboTimer,
      this.ventArrows,
      this.ghostNote,
      this.actions,
      this.ghostChat,
    );
    root.append(this.el);
    root.append(h('div', { class: 'rotate-hint' }, '📱 가로 화면으로 돌리면 더 넓게 보입니다'));
    this.mapView = new MapView({ net, store, root });

    store.subscribe(() => this.render());
    net.on('task', (m) => this.onTaskBegin(m));
    net.on('fx', (m) => this.onFx(m));
    window.addEventListener('keydown', (e) => this.onKey(e));
    setInterval(() => this.tickTimers(), 200);
  }

  get visible() {
    const ph = this.store.phase;
    return this.store.inRoom && (ph === PHASES.PLAYING || ph === PHASES.STARTING);
  }

  render() {
    const st = this.store.state;
    this.el.classList.toggle('hidden', !this.visible);
    if (!st || !this.visible) {
      closeTaskPanel(); closeFixPanel(); this.mapView.close(); loop('sabotageAlarm', false);
      return;
    }
    const you = st.you;
    if (!you) return;
    const imp = you.role === ROLES.IMPOSTOR;
    const ghost = !you.alive;

    // 진행률
    const bar = st.taskBar;
    this.taskbar.parentElement.firstChild.classList.toggle('hidden', false);
    if (bar && bar.total) {
      this.barFill.style.width = `${(bar.done / bar.total) * 100}%`;
      this.barLabel.textContent = '전체 미션';
    } else {
      this.barFill.style.width = '0%';
      this.barLabel.textContent = st.sabotage?.active?.kind === 'comms' ? '통신 방해 중' : '전체 미션';
    }

    // 미션 목록
    const rows = [];
    const sab = st.sabotage?.active;
    if (sab) rows.push(h('div', { class: 'sabo' }, this.sabotageLine(sab)));
    if (imp) rows.push(h('div', { class: 'fake' }, '가짜 미션:'));
    if (you.tasks === null) {
      rows.push(h('div', { class: 't' }, '통신 방해 중 — 미션을 볼 수 없습니다.'));
    } else {
      for (const t of you.tasks) {
        const def = TASK_DEFS[t.defId];
        const spot = t.spot ? this.store.map.tasks.find((s) => s.id === t.spot) : null;
        const room = ROOM_NAMES_KO[spot?.room] ?? '';
        const partial = !t.done && t.step > 0;
        const multi = t.steps > 1 ? ` (${t.done ? t.steps : t.step}/${t.steps})` : '';
        rows.push(h('div', { class: `t${t.done ? ' done' : partial ? ' partial' : ''}` }, `${room ? `${room}: ` : ''}${def.name}${multi}`));
      }
    }
    if (imp) rows.push(h('div', { class: 'hint' }, '승무원을 처치하고 사보타주로 방해하세요.'));
    this.tasklist.replaceChildren(...rows);

    // 버튼 표시
    this.btn.kill.classList.toggle('hidden', !imp || ghost);
    this.btn.vent.classList.toggle('hidden', !imp || ghost);
    this.btn.sabotage.classList.toggle('hidden', !imp);
    this.btn.report.classList.toggle('hidden', ghost);
    this.btn.use.classList.toggle('hidden', ghost && imp);

    this.ghostNote.classList.toggle('hidden', !ghost);
    this.ghostNote.textContent = imp ? '당신은 죽었습니다. 사보타주로 동료를 도우세요.' : '당신은 죽었습니다. 미션을 끝내 승무원을 도우세요.';
    this.chatBtn.classList.toggle('hidden', !ghost);
    if (!ghost) this.ghostChat.classList.add('hidden');

    // 사보타주 경보
    const alarm = !!sab && (sab.kind === 'reactor' || sab.kind === 'o2');
    // 원작: 붉은 경보 화면은 위급 사보타주(원자로·산소)에서만
    this.saboAlert.classList.toggle('hidden', !alarm);
    loop('sabotageAlarm', alarm && st.phase === PHASES.PLAYING, 0.35);
    if (!sab) closeFixPanel();
    if (st.phase !== PHASES.PLAYING) { closeTaskPanel(); closeFixPanel(); }
    this.tickTimers();
  }

  sabotageLine(sab) {
    let s = SABO_NAMES[sab.kind];
    if (sab.endsAt) s += ` ${secondsLeft(sab.endsAt, this.net)}초`;
    if (sab.kind === 'reactor') s += ` (${sab.held?.length ?? 0}/2)`;
    if (sab.kind === 'o2') s += ` (${sab.fixed?.length ?? 0}/2)`;
    return s;
  }

  tickTimers() {
    const st = this.store.state;
    if (!st || !this.visible || !st.you) return;
    const now = this.net.serverNow();
    const you = st.you;
    // 킬 쿨다운
    const killLeft = Math.ceil((you.killReadyAt - now) / 1000);
    this.btn.kill.cd.textContent = killLeft > 0 ? killLeft : '';
    this.btn.kill.disabled = killLeft > 0 || !this.targets.kill || st.phase !== PHASES.PLAYING;
    // 사보타주 쿨다운
    const sabLeft = Math.ceil(((st.sabotage?.cooldownUntil ?? 0) - now) / 1000);
    this.btn.sabotage.cd.textContent = sabLeft > 0 && !st.sabotage?.active ? sabLeft : '';
    this.btn.sabotage.disabled = st.phase !== PHASES.PLAYING;
    this.btn.report.disabled = !this.targets.report || st.phase !== PHASES.PLAYING;
    this.btn.vent.disabled = !this.targets.vent || st.phase !== PHASES.PLAYING;
    this.btn.use.disabled = !this.targets.use || st.phase !== PHASES.PLAYING;
    if (this.targets.use?.kind === 'emergency') {
      const left = Math.ceil(((you.emergencyReadyAt ?? 0) - now) / 1000);
      this.btn.use.cd.textContent = left > 0 ? left : '';
    } else this.btn.use.cd.textContent = '';
    // 사보타주 남은 시간
    const sab = st.sabotage?.active;
    if (sab?.endsAt) {
      this.saboTimer.classList.remove('hidden');
      this.saboTimer.textContent = this.sabotageLine(sab);
      const first = this.tasklist.querySelector('.sabo');
      if (first) first.textContent = this.sabotageLine(sab);
    } else this.saboTimer.classList.add('hidden');
  }

  /** GameScene 이 매 프레임 알려 주는 상호작용 대상 */
  setTargets(t) {
    const prevVent = this.targets.vent?.vent?.id;
    this.targets = t;
    this.scene?.highlight(t.kill?.id ?? null);
    if (this.visible) {
      this.btn.report.disabled = !t.report;
      this.btn.vent.disabled = !t.vent;
      this.btn.use.disabled = !t.use;
    }
    if (t.vent?.kind === 'exit' && (prevVent !== t.vent.vent?.id || !this.ventArrows.childElementCount)) this.renderVentArrows(t);
    if (t.vent?.kind !== 'exit' && this.ventArrows.childElementCount) this.ventArrows.replaceChildren();
    if (t.vent?.kind === 'exit') this.positionVentArrows();
  }

  renderVentArrows(t) {
    this.ventArrows.replaceChildren(...t.ventLinks.map((v) => {
      const b = h('button', { class: 'vent-arrow', title: '벤트 이동', onclick: () => this.moveVent(v.id) }, '➜');
      b.dataset.x = v.x; b.dataset.y = v.y;
      return b;
    }));
  }

  positionVentArrows() {
    const me = this.store.me;
    const cx = innerWidth / 2, cy = innerHeight / 2;
    for (const b of this.ventArrows.children) {
      const a = Math.atan2(b.dataset.y - me.y, b.dataset.x - me.x);
      const r = Math.min(innerWidth, innerHeight) * 0.28;
      b.style.left = `${cx + Math.cos(a) * r}px`;
      b.style.top = `${cy + Math.sin(a) * r}px`;
      b.style.transform = `rotate(${a}rad)`;
    }
  }

  // ------------------------------------------------------------- 행동
  async act(t, data, okSound) {
    const r = await this.net.request(t, data);
    if (!r.ok) toast(errorText(r.error), 'error');
    else if (okSound) play(okSound);
    return r;
  }

  doKill() {
    if (this.targets.kill) this.act('kill', { targetId: this.targets.kill.id });
  }

  doReport() {
    if (this.targets.report) this.act('report', { bodyId: this.targets.report.id });
  }

  doVent() {
    const v = this.targets.vent;
    if (!v) return;
    this.act('vent', { action: v.kind === 'enter' ? 'enter' : 'exit' }, 'vent');
  }

  moveVent(to) {
    this.act('vent', { action: 'move', to }, 'ventMove');
  }

  doUse() {
    const u = this.targets.use;
    if (!u || taskPanelOpen()) return;
    if (u.kind === 'emergency') {
      if (!confirm('긴급 회의를 소집할까요?')) return;
      this.act('emergency', {}, 'emergencyButton');
    } else if (u.kind === 'task') {
      this.net.request('taskStart', { taskId: u.task.defId }).then((r) => { if (!r.ok) toast(errorText(r.error), 'error'); });
    } else if (u.kind === 'fix') {
      openFix({ net: this.net, store: this.store, console: u.console });
    }
  }

  onTaskBegin(m) {
    openTask({ net: this.net, store: this.store, ...m });
  }

  onFx(m) {
    if (m.kind === 'taskDone') {
      // 서버가 완료를 확정하면 창을 닫는다 (창 안에서 완료 처리 중이면 그쪽이 먼저 닫음)
      setTimeout(() => closeTaskPanel(false), 700);
      play('taskComplete');
      if (m.finished) toast(`${TASK_DEFS[m.defId].name} 완료!`);
    }
    if (m.kind === 'sabotage') toast(`${SABO_NAMES[m.sabotage] ?? '사보타주'} 발생!`, 'error');
    if (m.kind === 'sabotageFixed') toast('사보타주가 해결되었습니다.');
    if (m.kind === 'doors' && m.closed) play('doorClose', { vol: 0.5 });
    if (m.kind === 'vent') play('vent', { vol: 0.6 });
  }

  onKey(e) {
    if (this.typing() || !this.visible) return;
    const k = e.key.toLowerCase();
    if (k === 'tab') { e.preventDefault(); this.mapView.toggle('map'); return; }
    if (k === 'escape') { this.mapView.close(); return; }
    if (taskPanelOpen()) return;
    if (k === 'e' || k === ' ') { e.preventDefault(); if (!this.btn.use.disabled) this.doUse(); }
    else if (k === 'r') this.doReport();
    else if (k === 'q') this.doKill();
    else if (k === 'v') this.doVent();
    else if (k === 'f' && this.store.isImpostor) this.mapView.open('sabotage');
  }

  async leave() {
    if (!confirm('게임에서 나갈까요? 진행 중인 게임에서는 다시 들어올 수 없습니다.')) return;
    await this.net.leave();
    this.store.clearRoom();
  }
}
