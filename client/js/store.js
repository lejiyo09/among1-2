// 클라이언트 게임 상태: 서버 상태 보관, 내 위치 예측/보정, 다른 플레이어 보간
import { CollisionWorld } from '../shared/map.js';
import { stepMovement, DIR_NONE, dirFacing } from '../shared/movement.js';
import { TICK_MS, INTERP_DELAY_MS, PHASES, ROLES } from '../shared/constants.js';

const SEND_EVERY_TICKS = 2; // 입력 2틱(약 66ms)마다 묶어서 전송

export class Store {
  /**
   * @param {import('./net/Net.js').Net} net
   * @param {Record<string, any>} maps 맵 id → 맵 데이터 (대기실 포함)
   */
  constructor(net, maps) {
    this.net = net;
    this.maps = maps;
    this.worlds = new Map(Object.entries(maps).map(([id, m]) => [id, new CollisionWorld(m)]));
    this.lobbyMapId = Object.keys(maps).find((id) => maps[id].kind === 'lobby') ?? Object.keys(maps)[0];
    this.playerId = null;
    this.code = null;
    /** 서버의 마지막 state 메시지 */
    this.state = null;
    this.listeners = new Set();
    this.resetGameView();

    net.on('joined', (m) => { this.playerId = m.playerId; this.code = m.code; this.resetGameView(); });
    net.on('left', () => this.clearRoom());
    net.on('kicked', () => this.clearRoom());
    net.on('resumeFailed', () => this.clearRoom());
    net.on('state', (m) => this.onState(m));
    net.on('s', (m) => this.onSnapshot(m));
  }

  resetGameView() {
    this.me = { x: 0, y: 0, flags: 0, facing: 1, moving: false, known: false };
    this.render = { x: 0, y: 0 };
    /** @type {{seq:number,d:number}[]} 서버가 아직 확인하지 않은 입력 */
    this.pendingInputs = [];
    this.outbox = [];
    this.seq = 0;
    this.lastDir = DIR_NONE;
    this.acc = 0;
    this.tickCounter = 0;
    /** @type {Map<string, {samples:{t:number,x:number,y:number,f:number}[], x:number, y:number, f:number}>} */
    this.remotes = new Map();
    /** @type {Map<string, {id:string,x:number,y:number,color:number,playerId:string}>} */
    this.bodies = new Map();
    this.lastSnapTime = 0;
    /** 예측 검증: seq → 그 입력 직후 예측 위치 */
    this.predHistory = new Map();
    this.stats = { mispredicts: 0, lastError: 0, snapshots: 0 };
  }

  clearRoom() {
    this.playerId = null;
    this.code = null;
    this.state = null;
    this.resetGameView();
    this.changed();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  changed() {
    for (const fn of this.listeners) fn(this.state);
  }

  // ---------------------------------------------------------------- 파생 정보
  /** 지금 있는 맵 (서버가 state.mapId 로 알려 준다) */
  get mapId() { return this.maps[this.state?.mapId] ? this.state.mapId : this.lobbyMapId; }
  get map() { return this.maps[this.mapId]; }
  get world() { return this.worlds.get(this.mapId); }
  get phase() { return this.state?.phase ?? null; }
  get you() { return this.state?.you ?? null; }
  get inRoom() { return !!this.state && !!this.playerId; }
  get isHost() { return this.state?.hostId === this.playerId; }
  get isImpostor() { return this.you?.role === ROLES.IMPOSTOR; }
  get alive() { return !this.you || this.you.alive; }
  get isGhost() { return !!this.you && !this.you.alive; }

  player(id) {
    return this.state?.players.find((p) => p.id === id) ?? null;
  }

  canMove() {
    const ph = this.phase;
    if (ph !== PHASES.LOBBY && ph !== PHASES.PLAYING) return false;
    if (this.you?.inVent || this.you?.activeTask || this.localBusy) return false;
    return true;
  }

  // ---------------------------------------------------------------- 서버 메시지
  onState(m) {
    const prevPhase = this.state?.phase;
    const prevMap = this.state?.mapId;
    this.state = m;
    if (prevMap && prevMap !== m.mapId) {
      // 맵이 바뀜(대기실 ↔ 게임): 예측 기록과 다른 플레이어 기록을 버리고 다음 스냅샷 위치로 바로 이동
      this.pendingInputs = [];
      this.outbox = [];
      this.remotes.clear();
      this.me.known = false;
    }
    // 닫힌 문을 예측용 충돌 세계에도 반영
    const closed = new Set(m.sabotage?.doorsClosed ?? []);
    for (const d of this.map.doors) this.world.setDoorClosed(d.id, closed.has(d.id));
    if (prevPhase !== m.phase && (m.phase === PHASES.DISCUSSION || m.phase === PHASES.LOBBY || m.phase === PHASES.STARTING)) {
      // 회의/로비 전환 시 시체 표시 정리
      this.bodies.clear();
      this.pendingInputs = [];
      this.outbox = [];
    }
    this.changed();
  }

  onSnapshot(m) {
    const now = performance.now();
    this.lastSnapTime = now;
    const sTime = m.k * TICK_MS;
    // 내 위치 보정: 서버 확정 위치에서 아직 처리되지 않은 입력을 다시 적용
    const [sx, sy, sf] = m.me;
    this.me.flags = sf;
    this.stats.snapshots++;
    const predicted = this.predHistory.get(m.a);
    if (predicted) {
      const err = Math.hypot(predicted.x - sx, predicted.y - sy);
      this.stats.lastError = err;
      if (err > 0.5) this.stats.mispredicts++;
    }
    for (const seq of this.predHistory.keys()) if (seq <= m.a) this.predHistory.delete(seq);
    this.pendingInputs = this.pendingInputs.filter((i) => i.seq > m.a);
    const pos = { x: sx, y: sy };
    const ghost = this.isGhost && this.phase === PHASES.PLAYING;
    for (const i of this.pendingInputs) stepMovement(pos, i.d, this.moveOpts(ghost));
    const jump = Math.hypot(pos.x - this.me.x, pos.y - this.me.y);
    this.me.x = pos.x;
    this.me.y = pos.y;
    if (!this.me.known || jump > 120) {
      // 순간이동(킬, 벤트, 회의, 재접속): 화면도 바로 이동
      this.render.x = pos.x;
      this.render.y = pos.y;
      this.me.known = true;
    }
    // 다른 플레이어 샘플
    const updated = new Set();
    for (const [id, x, y, f] of m.p ?? []) {
      let r = this.remotes.get(id);
      if (!r) { r = { samples: [], x, y, f }; this.remotes.set(id, r); }
      r.samples.push({ t: sTime, x, y, f });
      r.x = x; r.y = y; r.f = f;
      updated.add(id);
    }
    for (const [id, r] of this.remotes) {
      // 바뀌지 않아 생략된 플레이어는 마지막 위치를 그대로 이어 붙인다
      if (!updated.has(id)) r.samples.push({ t: sTime, x: r.x, y: r.y, f: r.f & ~2 });
      if (r.samples.length > 30) r.samples.splice(0, r.samples.length - 30);
    }
    for (const id of m.g ?? []) this.remotes.delete(id);
    for (const [id, x, y, color, playerId] of m.b ?? []) this.bodies.set(id, { id, x, y, color, playerId });
    for (const id of m.bg ?? []) this.bodies.delete(id);
    this.serverTick = m.k;
    this.serverTickAt = now;
  }

  moveOpts(ghost) {
    return { world: this.world, speedMul: this.state?.settings?.playerSpeed ?? 1, ghost };
  }

  // ---------------------------------------------------------------- 프레임 처리
  /**
   * 고정 30Hz 로 내 입력을 시뮬레이션하고 서버로 보낸다.
   * @param {number} dtMs
   * @param {number} dir 현재 입력 방향
   */
  update(dtMs, dir) {
    if (!this.inRoom || !this.me.known) return;
    this.acc += Math.min(dtMs, 250);
    const ghost = this.isGhost && this.phase === PHASES.PLAYING;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      this.tickCounter++;
      const d = this.canMove() ? dir : DIR_NONE;
      // 멈춰 있는 동안에는 입력을 보내지 않는다 (서버는 입력이 없으면 정지로 처리)
      if (d !== DIR_NONE || this.lastDir !== DIR_NONE) {
        const input = { seq: this.seq++, d };
        this.pendingInputs.push(input);
        this.outbox.push(input);
        if (d !== DIR_NONE) {
          stepMovement(this.me, d, this.moveOpts(ghost));
          const f = dirFacing(d);
          if (f) this.me.facing = f;
        }
        this.predHistory.set(input.seq, { x: this.me.x, y: this.me.y });
      }
      this.me.moving = d !== DIR_NONE;
      this.lastDir = d;
      if (this.outbox.length && (this.tickCounter % SEND_EVERY_TICKS === 0 || this.outbox.length >= 4)) this.flush();
    }
    // 화면 위치는 예측 위치를 부드럽게 따라간다 (보정이 있을 때 튀지 않게)
    const k = 1 - Math.pow(0.0001, dtMs / 1000);
    this.render.x += (this.me.x - this.render.x) * Math.max(k, 0.5);
    this.render.y += (this.me.y - this.render.y) * Math.max(k, 0.5);
    if (this.pendingInputs.length > 90) this.pendingInputs.splice(0, this.pendingInputs.length - 90);
  }

  flush() {
    // 시퀀스가 연속이 아닐 수 있으므로 연속 구간별로 보낸다
    let start = 0;
    for (let i = 1; i <= this.outbox.length; i++) {
      if (i === this.outbox.length || this.outbox[i].seq !== this.outbox[i - 1].seq + 1 || i - start >= 8) {
        const chunk = this.outbox.slice(start, i);
        this.net.send({ t: 'input', seq: chunk[0].seq, d: chunk.map((c) => c.d) });
        start = i;
      }
    }
    this.outbox = [];
  }

  /**
   * 보간용 화면 시계. 서버 시각(최근 스냅샷 + 경과) - 지연 을 목표로, 실제 시간으로 흐르되 조금씩 맞춘다.
   * 네트워크가 잠깐 멈췄다가 스냅샷이 몰려와도 다른 플레이어가 순간이동하지 않고 빨리 감기로 따라잡는다.
   */
  advanceRenderClock(dtMs) {
    if (this.serverTick === undefined) return;
    const target = this.serverTick * TICK_MS + (performance.now() - this.serverTickAt) - INTERP_DELAY_MS;
    if (this.renderT === undefined || Math.abs(target - this.renderT) > 1500) { this.renderT = target; return; }
    this.renderT += dtMs;
    const diff = target - this.renderT;
    // 최대 1.6배 속도로 따라잡기 / 0.6배로 늦추기
    this.renderT += Math.max(-0.4 * dtMs, Math.min(0.6 * dtMs, diff * 0.15));
    // 받은 데이터보다 앞서 가지 않는다 (멈췄던 동안 앞서 가 있으면 데이터가 몰려올 때 순간이동처럼 보임)
    this.renderT = Math.min(this.renderT, this.serverTick * TICK_MS);
  }

  /** 다른 플레이어의 보간된 위치 */
  remotePos(id) {
    const r = this.remotes.get(id);
    if (!r || !r.samples.length) return null;
    const renderT = this.renderT ?? (this.serverTick ?? 0) * TICK_MS - INTERP_DELAY_MS;
    const s = r.samples;
    if (renderT <= s[0].t) return s[0];
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i].t <= renderT) {
        const a = s[i], b = s[i + 1];
        if (!b) return a;
        const u = (renderT - a.t) / (b.t - a.t || 1);
        // 순간이동은 보간하지 않는다
        if (Math.hypot(b.x - a.x, b.y - a.y) > 150) return u < 0.5 ? a : b;
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, f: b.f };
      }
    }
    return s[s.length - 1];
  }
}
