// 회의 화면: 토론 → 투표(기권 포함) → 결과 공개. 채팅 포함
import { h, toast, errorText, secondsLeft } from './dom.js';
import { crewIcon } from '../game/recolor.js';
import { PHASES } from '../../shared/constants.js';
import { play } from '../audio.js';

export class Meeting {
  constructor({ net, store, chat, root }) {
    this.net = net;
    this.store = store;
    this.selected = null;
    this.title = h('h2', {}, '누가 임포스터인가?');
    this.timer = h('div', { class: 'timer' });
    this.grid = h('div', { class: 'vote-grid' });
    this.skipBtn = h('button', { class: 'btn', onclick: () => this.select('skip') }, '건너뛰기');
    this.skipConfirm = h('span', { class: 'hidden' },
      h('button', { class: 'btn small primary', onclick: () => this.vote('skip') }, '건너뛰기 확인'),
      h('button', { class: 'btn small', onclick: () => this.select(null) }, '취소'));
    this.skipVoters = h('div', { class: 'skip-voters' });
    this.status = h('div', { style: { fontWeight: 800 } });
    this.chatView = chat.view({ placeholder: '토론하기…' });
    this.el = h('div', { class: 'meeting hidden' },
      h('div', { class: 'tablet' },
        h('div', { class: 'head' }, this.title, this.timer),
        this.grid,
        this.chatView.el,
        h('div', { class: 'meeting-foot' }, this.skipBtn, this.skipConfirm, this.skipVoters, this.status),
      ));
    root.append(this.el);
    store.subscribe(() => this.render());
    net.on('fx', (m) => {
      if (m.kind === 'voted') play(m.voterId === store.playerId ? 'voteLock' : 'voteCast', { vol: 0.7 });
      if (m.kind === 'meeting') this.selected = null;
    });
    setInterval(() => this.tick(), 250);
    this.lastBeep = 0;
  }

  get phase() {
    return this.store.phase;
  }

  get visible() {
    const ph = this.phase;
    return this.store.inRoom && (ph === PHASES.DISCUSSION || ph === PHASES.VOTING || ph === PHASES.RESULT);
  }

  tick() {
    if (!this.visible) return;
    const st = this.store.state;
    const left = secondsLeft(st.endsAt, this.net);
    if (st.phase === PHASES.DISCUSSION) this.timer.textContent = `토론 종료까지 ${left}초`;
    else if (st.phase === PHASES.VOTING) {
      this.timer.textContent = `투표 종료까지 ${left}초`;
      if (left <= 10 && left !== this.lastBeep) { this.lastBeep = left; play('voteTimer', { vol: 0.5 }); }
    } else this.timer.textContent = '투표 결과';
  }

  render() {
    this.el.classList.toggle('hidden', !this.visible);
    if (!this.visible) { this.selected = null; return; }
    const st = this.store.state;
    const m = st.meeting;
    const you = st.you;
    const voting = st.phase === PHASES.VOTING;
    const result = st.phase === PHASES.RESULT ? m?.result : null;
    const canVote = voting && you?.alive && !m?.myVote;
    const voted = new Set(m?.voted ?? []);

    // 결과: 투표자 아이콘 (익명이면 회색)
    const votersFor = new Map();
    if (result?.votes) {
      for (const [voter, target] of Object.entries(result.votes)) {
        if (!votersFor.has(target)) votersFor.set(target, []);
        votersFor.get(target).push(this.store.player(voter)?.color ?? 6);
      }
    } else if (result?.counts) {
      for (const [target, n] of Object.entries(result.counts)) votersFor.set(target, Array(n).fill(15));
    }
    const voterIcons = (target) => (votersFor.get(target) ?? []).map((c, i) => h('img', { src: crewIcon(c), alt: '', style: { animationDelay: `${i * 0.15}s` } }));

    const players = st.players.filter((p) => p.inGame);
    this.grid.replaceChildren(...players.map((p) => {
      const dead = p.dead || p.left;
      const selectable = canVote && !dead;
      const isSel = this.selected === p.id;
      const card = h('button', {
        class: `vote-card${dead ? ' dead' : ''}${isSel ? ' selected' : ''}`,
        disabled: !selectable,
        onclick: () => { if (selectable && !isSel) this.select(p.id); },
      },
        h('img', { class: 'crew', src: crewIcon(p.color, dead ? 'dead42' : 'idle'), alt: '' }),
        dead ? h('span', { class: 'x' }, '✕') : null,
        h('span', { class: 'nm' }, p.name, p.left ? ' (나감)' : '', !p.connected && !p.left ? ' 📶' : ''),
        h('span', { class: 'badges' },
          m?.callerId === p.id ? h('span', { class: 'speaker', title: '회의 소집' }, '📢') : null,
          voting && voted.has(p.id) ? h('img', { class: 'voted-badge', src: 'assets/ui/ivoted.png', alt: '투표함' }) : null),
        result ? h('span', { class: 'voters' }, voterIcons(p.id)) : null,
        isSel && canVote ? h('span', { class: 'confirm' },
          h('button', { title: '투표', onclick: (e) => { e.stopPropagation(); this.vote(p.id); } }, h('img', { src: 'assets/ui/confirm.png', alt: '투표' })),
          h('button', { title: '취소', onclick: (e) => { e.stopPropagation(); this.select(null); } }, h('img', { src: 'assets/ui/cancel.png', alt: '취소' }))) : null,
      );
      return card;
    }));

    this.skipBtn.disabled = !canVote;
    this.skipBtn.classList.toggle('hidden', this.selected === 'skip' && canVote);
    this.skipConfirm.classList.toggle('hidden', !(this.selected === 'skip' && canVote));
    this.skipVoters.replaceChildren(...(result ? voterIcons('skip') : []));
    if (st.phase === PHASES.DISCUSSION) this.status.textContent = '토론 중입니다. 곧 투표가 시작됩니다.';
    else if (voting) this.status.textContent = !you?.alive ? '죽은 플레이어는 투표할 수 없습니다.' : m?.myVote ? '투표했습니다. 다른 사람을 기다리는 중…' : '투표할 사람을 고르세요.';
    else this.status.textContent = result?.text ?? '';
    this.tick();
  }

  select(id) {
    this.selected = id;
    play('uiSelect', { vol: 0.5 });
    this.render();
  }

  async vote(target) {
    this.selected = null;
    const r = await this.net.request('vote', { target });
    if (!r.ok) toast(errorText(r.error), 'error');
    this.render();
  }
}
