// 메인 메뉴: 닉네임, 색, 방 만들기, 코드로 참가
import { h, errorText } from './dom.js';
import { crewIcon } from '../game/recolor.js';
import { COLORS, NAME_MAX, ROOM_CODE_LENGTH } from '../../shared/constants.js';
import { play, unlockAudio } from '../audio.js';

const PREF_KEY = 'au_prefs';

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) ?? {}; } catch { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* 무시 */ }
}

export class Menu {
  constructor({ net, root }) {
    this.net = net;
    this.prefs = { name: '', color: 0, ...loadPrefs() };
    const initialCode = (new URLSearchParams(location.search).get('room') ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, ROOM_CODE_LENGTH);

    this.nameInput = h('input', { class: 'input', maxlength: NAME_MAX, placeholder: '닉네임 (최대 10자)', value: this.prefs.name, autocomplete: 'off' });
    this.codeInput = h('input', { class: 'input code-input', maxlength: ROOM_CODE_LENGTH, placeholder: 'ABCDEF', value: initialCode, autocomplete: 'off' });
    this.codeInput.addEventListener('input', () => { this.codeInput.value = this.codeInput.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    this.error = h('div', { class: 'error-text' });
    this.colorGrid = h('div', { class: 'color-grid' });
    this.createBtn = h('button', { class: 'btn primary', onclick: () => this.create() }, '방 만들기');
    this.joinBtn = h('button', { class: 'btn blue', onclick: () => this.join() }, '코드로 참가');
    this.codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.join(); });

    this.el = h('div', { class: 'menu' },
      h('div', { class: 'panel menu-card' },
        h('img', { class: 'menu-logo', src: 'assets/ui/logo.png', alt: 'AMONG US' }),
        h('div', { class: 'menu-sub' }, '웹 멀티플레이 · 비상업 팬 프로젝트'),
        h('label', { class: 'section-title' }, '닉네임'),
        this.nameInput,
        h('label', { class: 'section-title' }, '색'),
        this.colorGrid,
        this.createBtn,
        h('div', { class: 'menu-row' }, this.codeInput, this.joinBtn),
        this.error,
        h('div', { class: 'menu-foot' },
          '이동: WASD/방향키 · 사용: E/스페이스 · 신고: R · 킬: Q · 벤트: V · 지도: Tab',
          h('br'),
          'Among Us™ 와 원작 그래픽·사운드는 Innersloth LLC 의 저작물입니다. 이 프로젝트는 비상업 팬 제작물입니다. ',
          h('a', { href: 'https://github.com/lejiyo09/among1-2', target: '_blank', rel: 'noopener' }, '소스 코드'),
        ),
      ),
    );
    root.append(this.el);
    this.renderColors();
    if (initialCode) this.joinBtn.focus();
  }

  renderColors() {
    this.colorGrid.replaceChildren(...COLORS.map((c, i) => h('button', {
      class: `color-cell${i === this.prefs.color ? ' selected' : ''}`, title: c[0],
      onclick: () => { this.prefs.color = i; savePrefs(this.prefs); play('uiSelect'); this.renderColors(); },
    }, h('img', { src: crewIcon(i), alt: c[0] }))));
  }

  show(on) {
    this.el.classList.toggle('hidden', !on);
    if (on) this.setBusy(false);
  }

  setBusy(b) {
    this.createBtn.disabled = b;
    this.joinBtn.disabled = b;
  }

  readName() {
    const name = this.nameInput.value.trim();
    if (!name) { this.error.textContent = '닉네임을 입력하세요.'; this.nameInput.focus(); return null; }
    this.prefs.name = name;
    savePrefs(this.prefs);
    return name;
  }

  async create() {
    unlockAudio();
    const name = this.readName();
    if (!name) return;
    this.error.textContent = '';
    this.setBusy(true);
    const r = await this.net.request('create', { name, color: this.prefs.color });
    this.setBusy(false);
    if (!r.ok) this.error.textContent = errorText(r.error);
    else play('uiSelect');
  }

  async join() {
    unlockAudio();
    const name = this.readName();
    if (!name) return;
    const code = this.codeInput.value.trim().toUpperCase();
    if (code.length !== ROOM_CODE_LENGTH) { this.error.textContent = `방 코드는 영문 ${ROOM_CODE_LENGTH}글자입니다.`; return; }
    this.error.textContent = '';
    this.setBusy(true);
    const r = await this.net.request('join', { code, name, color: this.prefs.color });
    this.setBusy(false);
    if (!r.ok) this.error.textContent = errorText(r.error);
    else play('uiSelect');
  }
}
