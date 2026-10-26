// WebSocket 클라이언트: 자동 재접속, 재접속 토큰, 요청-응답(rid), 핑
const TOKEN_KEY = 'au_token';
const REQUEST_TIMEOUT_MS = 6000;

/** 서버 주소: 기본은 이 페이지를 준 서버. ?server=wss://... 또는 config.js 의 window.GAME_SERVER 로 바꿀 수 있다 */
export function serverUrl() {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  if (window.GAME_SERVER) return window.GAME_SERVER;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

export class Net {
  constructor(url = serverUrl()) {
    this.url = url;
    this.ws = null;
    this.handlers = new Map();
    this.pending = new Map();
    this.rid = 1;
    this.status = 'connecting';
    this.retry = 0;
    this.rtt = 0;
    this.clockOffset = 0; // serverNow ≈ Date.now() + clockOffset
    this.wantResume = !!this.token;
    this.closedByUser = false;
    setInterval(() => this.ping(), 2000);
  }

  get token() {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  }

  set token(v) {
    try { if (v) sessionStorage.setItem(TOKEN_KEY, v); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* 저장소 사용 불가 */ }
  }

  serverNow() {
    return Date.now() + this.clockOffset;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }

  emit(type, data) {
    for (const fn of this.handlers.get(type) ?? []) {
      try { fn(data); } catch (err) { console.error(`handler for ${type} failed`, err); }
    }
  }

  setStatus(s) {
    this.status = s;
    this.emit('status', s);
  }

  connect() {
    this.closedByUser = false;
    this.setStatus(this.retry ? 'reconnecting' : 'connecting');
    let ws;
    try { ws = new WebSocket(this.url); } catch (err) { console.error(err); this.scheduleReconnect(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus('online');
      this.send({ t: 'hello', v: 1 });
      if (this.token) {
        this.request('resume', { token: this.token }).then((r) => {
          // 연결이 잠깐 끊겨 응답을 못 받은 경우(DISCONNECTED/TIMEOUT)는 토큰을 지우지 않고 다음 연결에서 다시 시도한다
          if (!r.ok && !['DISCONNECTED', 'TIMEOUT', 'OFFLINE', 'RATE_LIMITED'].includes(r.error)) {
            this.token = null;
            this.emit('resumeFailed', r.error);
          }
        });
      }
      this.ping();
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === 'ack') {
        const p = this.pending.get(msg.rid);
        if (p) { this.pending.delete(msg.rid); clearTimeout(p.timer); p.resolve(msg); }
        return;
      }
      if (msg.t === 'pong') {
        this.rtt = Date.now() - msg.ts;
        // 서버 시계와의 차이 (지연의 절반을 보정)
        const offset = msg.now - (msg.ts + this.rtt / 2);
        this.clockOffset = this.clockOffset ? this.clockOffset * 0.8 + offset * 0.2 : offset;
        this.emit('rtt', this.rtt);
        return;
      }
      if (msg.t === 'joined') this.token = msg.token;
      if (msg.t === 'left' || msg.t === 'kicked') this.token = null;
      if (msg.t === 'state' && msg.now) {
        // 핑 측정 전에도 대략적인 시계 차이를 잡아 둔다
        if (!this.clockOffset) this.clockOffset = msg.now - Date.now();
      }
      this.emit(msg.t, msg);
    };
    ws.onclose = () => {
      for (const [, p] of this.pending) { clearTimeout(p.timer); p.resolve({ ok: false, error: 'DISCONNECTED' }); }
      this.pending.clear();
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closedByUser) { this.setStatus('offline'); return; }
      this.setStatus('reconnecting');
      this.scheduleReconnect();
    };
    ws.onerror = () => { /* onclose 에서 처리 */ };
  }

  scheduleReconnect() {
    const delay = Math.min(5000, 400 * 2 ** this.retry++);
    setTimeout(() => this.connect(), delay);
  }

  get online() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(obj) {
    if (this.online) this.ws.send(JSON.stringify(obj));
  }

  /** 응답(ack)을 기다리는 요청. 항상 {ok, error?} 로 resolve 된다 */
  request(t, data = {}) {
    return new Promise((resolve) => {
      if (!this.online) { resolve({ ok: false, error: 'OFFLINE' }); return; }
      const rid = this.rid++;
      const timer = setTimeout(() => { this.pending.delete(rid); resolve({ ok: false, error: 'TIMEOUT' }); }, REQUEST_TIMEOUT_MS);
      this.pending.set(rid, { resolve, timer });
      this.ws.send(JSON.stringify({ t, ...data, rid }));
    });
  }

  ping() {
    if (this.online) this.send({ t: 'ping', ts: Date.now() });
  }

  /** 정상 퇴장 */
  async leave() {
    await this.request('leave');
    this.token = null;
  }
}
