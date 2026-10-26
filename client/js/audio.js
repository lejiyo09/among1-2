// 효과음: Web Audio 로 미리 디코딩해 두고 즉시 재생한다.
// 브라우저 정책상 사용자가 한 번 클릭/키 입력한 뒤에야 소리가 난다.
const NAMES = [
  'kill', 'bodyReported', 'emergency', 'taskComplete', 'taskStep', 'sabotageAlarm', 'roundStart', 'roleCrew', 'roleImp',
  'voteCast', 'voteLock', 'voteTimer', 'ejectText', 'eject', 'victoryCrew', 'victoryImp', 'vent', 'ventMove', 'uiSelect', 'uiHover',
  'wire', 'cardAccept', 'cardDeny', 'manifold', 'manifoldFail', 'reactorStart', 'weaponFire', 'shieldOn', 'scan', 'fuel', 'garbage',
  'chart', 'divert', 'lightSwitch', 'keypad', 'keypadGood', 'notification', 'disconnect', 'doorClose', 'emergencyButton', 'theme',
  'step1', 'step2', 'step3', 'step4',
];

let ctx = null;
const buffers = new Map();
let master = null;
let volume = 0.7;
let loops = new Map();

try { volume = Number(localStorage.getItem('au_volume') ?? 0.7); } catch { /* 무시 */ }

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  for (const n of NAMES) {
    fetch(`assets/sounds/${n}.ogg`)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => buffers.set(n, buf))
      .catch(() => { /* 소리 하나 실패해도 게임은 계속 */ });
  }
}

export function play(name, { vol = 1, rate = 1 } = {}) {
  if (!ctx || !buffers.has(name)) return null;
  const src = ctx.createBufferSource();
  src.buffer = buffers.get(name);
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(master);
  src.start();
  return src;
}

export function loop(name, on, vol = 0.5) {
  if (on && !loops.has(name)) {
    const s = play(name, { vol });
    if (!s) return;
    s.loop = true;
    loops.set(name, s);
  } else if (!on && loops.has(name)) {
    try { loops.get(name).stop(); } catch { /* 이미 멈춤 */ }
    loops.delete(name);
  }
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = volume;
  try { localStorage.setItem('au_volume', String(volume)); } catch { /* 무시 */ }
}

export function getVolume() {
  return volume;
}
