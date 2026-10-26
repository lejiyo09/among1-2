// 연출 화면: 역할 공개, 시체 발견/긴급 회의, 추방, 게임 종료, 킬 장면
import { h } from './dom.js';
import { crewIcon } from '../game/recolor.js';
import { PHASES, ROLES } from '../../shared/constants.js';
import { play } from '../audio.js';

const REASON_TEXT = {
  tasks: '승무원이 모든 미션을 완료했습니다.',
  impostors_eliminated: '모든 임포스터가 사라졌습니다.',
  crew_outnumbered: '임포스터 수가 승무원 수와 같아졌습니다.',
  sabotage: '사보타주를 제때 해결하지 못했습니다.',
};

export class Overlays {
  constructor({ net, store, root }) {
    this.net = net;
    this.store = store;
    this.root = root;
    this.current = null;
    this.timer = null;
    net.on('fx', (m) => this.onFx(m));
    store.subscribe(() => this.onState());
    this.lastPhase = null;
  }

  show(el, ms) {
    this.hide();
    this.current = el;
    this.root.append(el);
    if (ms) this.timer = setTimeout(() => this.hide(el), ms);
  }

  hide(el) {
    if (el && el !== this.current) return;
    clearTimeout(this.timer);
    this.current?.remove();
    this.current = null;
  }

  onState() {
    const ph = this.store.phase;
    if (ph === this.lastPhase) return;
    const prev = this.lastPhase;
    this.lastPhase = ph;
    // 추방 결과 연출: 투표 결과 공개 2.5초 뒤
    if (ph === PHASES.RESULT) setTimeout(() => { if (this.store.phase === PHASES.RESULT) this.eject(); }, 2600);
    if (ph === PHASES.LOBBY && prev) this.hide();
    if (ph === PHASES.PLAYING && this.current?.classList.contains('eject')) this.hide();
    if (!this.store.inRoom) this.hide();
  }

  onFx(m) {
    switch (m.kind) {
      case 'roleReveal': return this.roleReveal(m);
      case 'meeting': return this.meetingSplash(m);
      case 'gameOver': return setTimeout(() => this.gameOver(m), 600);
      case 'killed': return this.killed(m);
      case 'kill': return play('kill');
      default: return null;
    }
  }

  lineup(ids, front) {
    const players = ids.map((id) => this.store.player(id)).filter(Boolean);
    // 나를 가운데 맨 앞에
    players.sort((a, b) => (a.id === front ? -1 : b.id === front ? 1 : 0));
    const ordered = [];
    players.forEach((p, i) => (i % 2 ? ordered.unshift(p) : ordered.push(p)));
    return h('div', { class: 'lineup' }, ordered.map((p) => h('figure', {},
      h('img', { src: crewIcon(p.color), alt: '', style: { height: p.id === front ? '' : 'clamp(56px, 11vw, 120px)' } }),
      h('figcaption', {}, p.name))));
  }

  roleReveal(m) {
    const imp = m.role === ROLES.IMPOSTOR;
    const shh = h('div', { class: 'overlay fade' }, h('h1', { class: 'reveal-title', style: { color: '#ff3b3b' } }, 'SHHHHHH!'));
    this.show(shh, 1400);
    play('roundStart', { vol: 0.8 });
    setTimeout(() => {
      const ids = imp ? m.team : (this.store.state?.players ?? []).filter((p) => p.inGame).map((p) => p.id);
      const el = h('div', { class: 'overlay fade' },
        h('h1', { class: `reveal-title ${imp ? 'imp' : 'crew'}` }, imp ? 'IMPOSTOR' : 'CREWMATE'),
        h('div', { class: 'reveal-sub' }, imp
          ? (m.team.length > 1 ? '동료 임포스터와 함께 승무원을 처치하세요.' : '승무원을 처치하세요.')
          : `우리 중에 임포스터가 ${m.impostorCount}명 있습니다.`),
        this.lineup(ids, this.store.playerId));
      play(imp ? 'roleImp' : 'roleCrew');
      this.show(el, 3900);
    }, 1400);
  }

  meetingSplash(m) {
    const report = m.reason === 'report';
    play(report ? 'bodyReported' : 'emergency');
    const caller = this.store.player(m.callerId);
    const el = h('div', { class: 'overlay splash fade' },
      h('img', { src: `assets/ui/${report ? 'bodyReported' : 'meetingCalled'}.png`, alt: '' }),
      h('div', { class: 'reveal-sub' }, report ? `${caller?.name ?? '누군가'} 님이 시체를 발견했습니다!` : `${caller?.name ?? '누군가'} 님이 긴급 회의를 소집했습니다!`));
    this.show(el, 2800);
  }

  eject() {
    const r = this.store.state?.meeting?.result;
    if (!r) return;
    const text = h('div', { class: 'text' });
    const sub = h('div', { class: 'sub' });
    const el = h('div', { class: 'overlay eject fade' },
      r.ejectedColor !== null ? h('img', { class: 'floater', src: crewIcon(r.ejectedColor), alt: '' }) : null,
      text, sub);
    this.show(el, 4600);
    play('eject', { vol: 0.7 });
    // 원작처럼 한 글자씩 나타나는 문장
    let i = 0;
    const full = r.text;
    const iv = setInterval(() => {
      if (!el.isConnected) { clearInterval(iv); return; }
      i++;
      text.textContent = full.slice(0, i);
      if (i % 2) play('ejectText', { vol: 0.4 });
      if (i >= full.length) { clearInterval(iv); sub.textContent = r.sub; }
    }, 55);
  }

  gameOver(m) {
    const you = this.store.you;
    const myTeam = you?.role === ROLES.IMPOSTOR ? 'impostor' : 'crew';
    const won = m.winner === myTeam;
    const end = this.store.state?.end;
    const winners = (end?.roles ?? []).filter((r) => (m.winner === 'impostor' ? r.role === ROLES.IMPOSTOR : r.role === ROLES.CREWMATE));
    play(m.winner === 'impostor' ? 'victoryImp' : 'victoryCrew');
    const el = h('div', { class: 'overlay gameover fade' },
      h('h1', { class: `reveal-title ${won ? 'win' : 'lose'}` }, won ? 'VICTORY' : 'DEFEAT'),
      h('div', { class: 'reveal-sub' }, `${m.winner === 'impostor' ? '임포스터' : '승무원'} 승리 — ${REASON_TEXT[m.reason] ?? ''}`),
      this.lineup(winners.map((w) => w.id), this.store.playerId),
      end ? h('div', { class: 'reveal-sub', style: { marginTop: '18px' } },
        `임포스터: ${end.roles.filter((r) => r.role === ROLES.IMPOSTOR).map((r) => r.name).join(', ')}`) : null,
      h('div', { class: 'muted', style: { marginTop: '10px' } }, '잠시 후 대기실로 돌아갑니다…'));
    this.show(el, 7600);
  }

  killed(m) {
    play('kill');
    const meColor = this.store.player(this.store.playerId)?.color ?? 0;
    const el = h('div', { class: 'overlay kill-anim fade' },
      h('div', { class: 'pair' },
        h('img', { src: crewIcon(m.killerColor), alt: '' }),
        h('img', { class: 'victim', src: crewIcon(meColor), alt: '' })),
      h('div', { class: 'reveal-sub' }, '당신은 살해당했습니다.'));
    this.show(el, 2000);
  }
}
