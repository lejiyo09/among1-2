// 채팅: 메시지 보관 + 여러 곳(로비/회의/유령)에 같은 기록을 보여 준다
import { h, errorText, toast } from './dom.js';
import { crewIcon } from '../game/recolor.js';
import { play } from '../audio.js';

const MAX_KEEP = 120;

export class Chat {
  constructor({ net, store }) {
    this.net = net;
    this.store = store;
    this.messages = [];
    this.views = new Set();
    net.on('fx', (m) => { if (m.kind === 'chat') this.add(m); });
    net.on('joined', (m) => { if (!m.resumed) this.clear(); });
  }

  add(m) {
    this.messages.push(m);
    if (this.messages.length > MAX_KEEP) this.messages.shift();
    for (const v of this.views) v.append(m);
    if (m.from && m.from !== this.store.playerId) play('notification', { vol: 0.35 });
  }

  clear() {
    this.messages = [];
    for (const v of this.views) v.log.replaceChildren();
  }

  /** 채팅 창 하나 만들기 */
  view({ placeholder = '메시지 입력…' } = {}) {
    const log = h('div', { class: 'chat-log' });
    const input = h('input', { class: 'input', maxlength: 100, placeholder, autocomplete: 'off' });
    const sendBtn = h('button', { class: 'btn small primary', type: 'submit' }, '보내기');
    const form = h('form', { class: 'chat-input', onsubmit: async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      const r = await this.net.request('chat', { text });
      if (!r.ok) toast(errorText(r.error), 'error');
    } }, input, sendBtn);
    // 채팅 입력 중에는 게임 키 입력(WASD)이 먹히지 않도록
    input.addEventListener('keydown', (e) => e.stopPropagation());
    input.addEventListener('keyup', (e) => e.stopPropagation());
    const el = h('div', { class: 'chat' }, log, form);
    const v = {
      el, log, input,
      append: (m) => {
        const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
        log.append(this.renderMsg(m));
        if (atBottom) log.scrollTop = log.scrollHeight;
      },
      destroy: () => this.views.delete(v),
    };
    for (const m of this.messages) log.append(this.renderMsg(m));
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
    this.views.add(v);
    return v;
  }

  renderMsg(m) {
    if (!m.from) return h('div', { class: 'chat-msg system' }, m.text);
    return h('div', { class: `chat-msg${m.dead ? ' dead' : ''}` },
      h('img', { src: crewIcon(m.color), alt: '' }),
      h('div', {}, h('span', { class: 'who' }, m.name), m.dead ? '👻 ' : '', m.text));
  }
}

/** 지금 채팅 입력란에 글을 쓰는 중인가 (게임 이동 입력 차단용) */
export function isTyping() {
  const a = document.activeElement;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
}
