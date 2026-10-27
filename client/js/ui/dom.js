// 작은 DOM 도우미
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

let toastWrap = null;
export function toast(text, kind = 'info', ms = 2600) {
  if (!toastWrap) { toastWrap = h('div', { class: 'toast-wrap' }); document.body.append(toastWrap); }
  const t = h('div', { class: `toast ${kind}` }, text);
  toastWrap.append(t);
  setTimeout(() => t.remove(), ms);
}

/** 서버 오류 코드 → 한국어 */
export const ERROR_TEXT = {
  COMMS_DOWN: '통신 방해 중에는 사용할 수 없습니다.',
  BAD_MESSAGE: '잘못된 요청입니다.',
  RATE_LIMITED: '너무 빠르게 요청하고 있습니다.',
  NOT_IN_ROOM: '방에 들어가 있지 않습니다.',
  ALREADY_IN_ROOM: '이미 방에 들어가 있습니다.',
  ROOM_NOT_FOUND: '방을 찾을 수 없습니다. 코드를 확인하세요.',
  ROOM_FULL: '방이 가득 찼습니다. (최대 15명)',
  GAME_IN_PROGRESS: '이미 게임이 진행 중인 방입니다.',
  SESSION_EXPIRED: '이전 접속 정보가 만료되었습니다.',
  NOT_HOST: '방장만 할 수 있습니다.',
  NOT_ENOUGH_PLAYERS: '인원이 부족합니다.',
  NOT_READY: '모든 플레이어가 준비해야 합니다.',
  COLOR_TAKEN: '다른 사람이 쓰고 있는 색입니다.',
  BAD_NAME: '닉네임을 입력하세요.',
  WRONG_PHASE: '지금은 할 수 없습니다.',
  NOT_ALLOWED: '지금은 할 수 없습니다.',
  OUT_OF_RANGE: '너무 멉니다.',
  COOLDOWN: '아직 쿨다운 중입니다.',
  INVALID_TARGET: '대상이 올바르지 않습니다.',
  ALREADY_DONE: '이미 했습니다.',
  TOO_FAST: '너무 빨리 끝냈습니다. 다시 해 보세요.',
  WRONG_ANSWER: '틀렸습니다. 다시 해 보세요.',
  SERVER_FULL: '서버에 방이 너무 많습니다. 잠시 후 다시 시도하세요.',
  INTERNAL: '서버 오류가 발생했습니다.',
  OFFLINE: '서버에 연결되어 있지 않습니다.',
  TIMEOUT: '서버 응답이 없습니다.',
  DISCONNECTED: '연결이 끊어졌습니다.',
};

export function errorText(code) {
  return ERROR_TEXT[code] ?? `오류: ${code}`;
}

/** 초 단위 남은 시간 */
export function secondsLeft(endsAt, net) {
  return Math.max(0, Math.ceil((endsAt - net.serverNow()) / 1000));
}
