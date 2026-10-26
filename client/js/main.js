// 진입점: 네트워크, 상태, Phaser, DOM UI 연결
import { Net } from './net/Net.js';
import { loadAllMaps } from './net/mapLoader.js';
import { Store } from './store.js';
import { loadCrewAtlas } from './game/recolor.js';
import { GameScene } from './game/GameScene.js';
import { Menu } from './ui/menu.js';
import { Lobby } from './ui/lobby.js';
import { Chat, isTyping } from './ui/chat.js';
import { Hud } from './ui/hud.js';
import { Meeting } from './ui/meeting.js';
import { Overlays } from './ui/overlays.js';
import { h, toast, errorText } from './ui/dom.js';
import { unlockAudio } from './audio.js';

async function boot() {
  const ui = document.getElementById('ui');
  const loading = h('div', { class: 'menu' }, h('div', { class: 'panel menu-card', style: { textAlign: 'center' } }, '불러오는 중…'));
  ui.append(loading);

  const [maps] = await Promise.all([loadAllMaps(), loadCrewAtlas()]);
  const net = new Net();
  const store = new Store(net, maps);
  const chat = new Chat({ net, store });
  loading.remove();

  const menu = new Menu({ net, root: ui });
  const lobby = new Lobby({ net, store, chat, root: ui });
  const overlays = new Overlays({ net, store, root: ui });
  const hud = new Hud({ net, store, chat, root: ui, overlays });
  const meeting = new Meeting({ net, store, chat, root: ui });
  hud.typing = isTyping;

  // 화면 전환: 방에 있으면 메뉴 숨김
  store.subscribe(() => menu.show(!store.inRoom));
  menu.show(true);

  // 연결 상태 표시
  const connEl = document.getElementById('conn');
  const connText = connEl.querySelector('.text');
  let offlineBanner = null;
  const LABEL = { connecting: '연결 중…', online: '연결됨', reconnecting: '재연결 중…', offline: '연결 끊김' };
  net.on('status', (s) => {
    connEl.className = `conn ${s}`;
    connText.textContent = LABEL[s] ?? s;
    if (s !== 'online' && store.inRoom && !offlineBanner) {
      offlineBanner = h('div', { class: 'banner-offline' }, '서버와 연결이 끊어졌습니다. 다시 연결하는 중…');
      document.body.append(offlineBanner);
    }
    if (s === 'online' && offlineBanner) { offlineBanner.remove(); offlineBanner = null; }
  });
  net.on('rtt', (ms) => { if (net.status === 'online') connText.textContent = `연결됨 · ${ms}ms`; });
  net.on('resumeFailed', (code) => toast(code === 'SESSION_EXPIRED' ? '이전 방이 사라졌습니다. (서버 재시작 또는 시간 초과)' : errorText(code), 'error', 4000));
  net.on('kicked', () => toast('방장이 방에서 내보냈습니다.', 'error', 4000));
  net.on('replaced', () => toast('다른 탭에서 같은 플레이어로 접속했습니다.', 'error', 4000));
  net.on('error', (m) => { if (m.code !== 'RATE_LIMITED') console.warn('server error', m); });

  // Phaser
  const scene = new GameScene({ store, net, hud, lobby });
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#000000',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    render: { antialias: true, powerPreference: 'high-performance' },
    input: { activePointers: 4 },
    scene: [scene],
    banner: false,
  });
  hud.scene = scene;
  window.__game = { net, store, scene, hud, meeting, overlays }; // 디버깅·자동 테스트용

  // 첫 입력에서 소리 켜기
  const unlock = () => { unlockAudio(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  net.connect();
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('ui').replaceChildren(h('div', { class: 'menu' }, h('div', { class: 'panel menu-card' }, `시작 오류: ${err.message}`)));
});
