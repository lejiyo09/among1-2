// WebSocket 연결 하나를 감싼다: 전송, 전송 빈도 제한, 중복 요청(rid) 처리
import { WebSocket } from 'ws';

const BUCKET_CAPACITY = 60;     // 순간 최대 메시지 수
const BUCKET_REFILL = 40;       // 초당 회복량 (입력 15회/초 + 행동 여유)
const MAX_VIOLATIONS = 200;     // 이만큼 제한에 걸리면 연결 종료
const MAX_BUFFERED = 1 << 20;   // 1MB 넘게 밀리면 느린 클라이언트로 보고 종료
const RID_CACHE = 64;

let nextConnId = 1;

export class Connection {
  /** @param {WebSocket} ws */
  constructor(ws, ip) {
    this.id = nextConnId++;
    this.ws = ws;
    this.ip = ip;
    this.tokens = BUCKET_CAPACITY;
    this.lastRefill = Date.now();
    this.violations = 0;
    /** @type {Map<number, any>} 처리한 요청 ID → 응답 (재전송 시 같은 응답을 돌려준다) */
    this.rids = new Map();
    /** @type {null|import('../game/Room.js').Player} */
    this.player = null;
    /** @type {null|import('../game/Room.js').Room} */
    this.room = null;
  }

  send(obj) {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    if (this.ws.bufferedAmount > MAX_BUFFERED) {
      this.ws.terminate();
      return;
    }
    this.ws.send(JSON.stringify(obj));
  }

  /** @returns {boolean} 처리해도 되면 true */
  takeToken() {
    const now = Date.now();
    this.tokens = Math.min(BUCKET_CAPACITY, this.tokens + ((now - this.lastRefill) / 1000) * BUCKET_REFILL);
    this.lastRefill = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    this.violations++;
    if (this.violations > MAX_VIOLATIONS) this.ws.close(1008, 'rate limit');
    return false;
  }

  rememberRid(rid, reply) {
    this.rids.set(rid, reply);
    if (this.rids.size > RID_CACHE) this.rids.delete(this.rids.keys().next().value);
  }

  /** 방과의 연결을 끊는다 (강퇴/다른 탭에서 재접속) */
  detach() {
    this.player = null;
    this.room = null;
    setTimeout(() => this.ws.close(4000, 'detached'), 50);
  }
}
