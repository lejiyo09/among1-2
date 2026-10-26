// 방 하나의 권위 있는 게임 상태와 상태 머신
// - 모든 판정(이동, 킬, 미션, 신고, 투표, 승리)은 여기서 서버가 확정한다.
// - 클라이언트에는 "그 플레이어가 알아도 되는 정보"만 보낸다 (역할, 시야 밖 위치 등은 숨김).
// - 시간은 주입된 now() 로만 읽어서 테스트에서 시계를 조작할 수 있다.
import {
  PHASES, ROLES, DEFAULT_SETTINGS, SETTING_LIMITS, TIMINGS, COLORS, MAX_PLAYERS, MIN_PLAYERS,
  KILL_DISTANCES, REPORT_RANGE, USE_RANGE, VENT_RANGE, VISION_BASE, TICK_RATE, SNAPSHOT_RATE,
} from '../../shared/constants.js';
import { ERR, sanitizeChat } from '../../shared/protocol.js';
import { CollisionWorld } from '../../shared/map.js';
import { stepMovement, dirFacing, DIR_NONE } from '../../shared/movement.js';
import { assignRoles, tallyVotes, checkWin } from './rules.js';
import { createTaskAssigner, makeChallenge, validateAnswer, minDurationFor } from './tasks.js';
import { SabotageSystem } from './sabotage.js';

const INPUT_QUEUE_MAX = 45;      // 1.5초 분량. 이보다 많이 쌓이면(비정상) 오래된 것부터 버린다
const INPUT_CREDIT_MAX = 15;     // 지연 후 몰려온 입력을 따라잡을 수 있는 최대 틱 수 (0.5초)
const INPUTS_PER_TICK_MAX = 3;
const SNAPSHOT_EVERY = Math.round(TICK_RATE / SNAPSHOT_RATE);
const KILL_TOLERANCE = 1.1;    // 네트워크 지연 보정용 10% 여유
const CHAT_INTERVAL_MS = 700;

let playerCounter = 0;

/**
 * @typedef {ReturnType<typeof createPlayer>} Player
 */
export function createPlayer({ name, color, conn, token, now }) {
  return {
    id: `p${(++playerCounter).toString(36)}`,
    name, color, conn, token,
    connected: true,
    ready: false,
    joinedAt: now,
    disconnectedAt: 0,
    // 위치
    x: 0, y: 0, facing: 1, moving: false,
    /** @type {{seq:number, d:number}[]} */
    inputQueue: [],
    lastSeq: -1,
    queuedSeq: -1,
    // 게임
    inGame: false,
    role: null,
    alive: true,
    removed: false,
    deathKnown: false,
    /** @type {import('./tasks.js').PlayerTask[]} */
    tasks: [],
    /** @type {null|{defId:string, step:number, spotId:string, startedAt:number, challenge:any}} */
    activeTask: null,
    scanning: false,
    killReadyAt: 0,
    emergencyLeft: 0,
    inVent: null,
    lastChatAt: 0,
    // 스냅샷 델타 전송용: 마지막으로 보낸 상태
    view: { players: new Map(), bodies: new Set(), me: '', ack: -1, lastSentAt: 0 },
  };
}

export class Room {
  /**
   * @param {{code:string, maps?:Record<string,any>, map?:any, now?:()=>number, minPlayers?:number, onEmpty?:(room:Room)=>void, onPlayerRemoved?:(p:Player)=>void}} opts
   * maps: 맵 id → 맵 데이터. kind 가 'lobby' 인 맵은 대기실, 나머지는 게임 맵. (map 하나만 주면 대기실도 그 맵을 쓴다)
   */
  constructor({ code, maps, map, now = Date.now, minPlayers = MIN_PLAYERS, onEmpty = () => {}, onPlayerRemoved = () => {} }) {
    this.code = code;
    this.maps = maps ?? { [map.id ?? 'skeld']: map };
    /** 맵마다 충돌 세계(닫힌 문 상태 포함)를 따로 둔다 */
    this.worlds = new Map(Object.entries(this.maps).map(([id, m]) => [id, new CollisionWorld(m)]));
    this.gameMapIds = Object.keys(this.maps).filter((id) => this.maps[id].kind !== 'lobby');
    this.lobbyMapId = Object.keys(this.maps).find((id) => this.maps[id].kind === 'lobby') ?? null;
    this.now = now;
    this.minPlayers = minPlayers;
    this.onEmpty = onEmpty;
    this.onPlayerRemoved = onPlayerRemoved;
    /** @type {Map<string, Player>} */
    this.players = new Map();
    this.hostId = null;
    this.settings = { ...DEFAULT_SETTINGS, map: this.gameMapIds.includes(DEFAULT_SETTINGS.map) ? DEFAULT_SETTINGS.map : this.gameMapIds[0] };
    this.phase = PHASES.LOBBY;
    this.phaseEndsAt = 0;
    this.gameId = 0;
    /** @type {Map<string, {id:string, playerId:string, x:number, y:number, color:number}>} */
    this.bodies = new Map();
    this.meeting = null;
    this.endInfo = null;
    this.sabotage = new SabotageSystem(this);
    this.tickCount = 0;
    this.dirty = true;
    this.closed = false;
  }

  // ---------------------------------------------------------------- 공통 유틸
  /** 지금 플레이어들이 있는 맵: 대기실 단계에는 대기실, 그 밖에는 고른 게임 맵 */
  get mapId() {
    return this.phase === PHASES.LOBBY && this.lobbyMapId ? this.lobbyMapId : this.settings.map;
  }

  get map() { return this.maps[this.mapId]; }

  get world() { return this.worlds.get(this.mapId); }

  markDirty() { this.dirty = true; }

  send(p, msg) {
    if (p.conn && p.connected) p.conn.send(msg);
  }

  /** 연출/효과음용 이벤트. filter 로 받을 사람을 고른다 */
  fx(kind, data, filter = () => true) {
    for (const p of this.players.values()) if (!p.removed && filter(p)) this.send(p, { t: 'fx', ...data, kind });
  }

  get inGamePlayers() {
    return [...this.players.values()].filter((p) => p.inGame);
  }

  get isPlaying() {
    return this.phase === PHASES.PLAYING;
  }

  get isMeeting() {
    return this.phase === PHASES.DISCUSSION || this.phase === PHASES.VOTING || this.phase === PHASES.RESULT;
  }

  setPhase(phase, durationMs = 0) {
    this.phase = phase;
    this.phaseEndsAt = durationMs ? this.now() + durationMs : 0;
    this.markDirty();
  }

  spawnPoint(i) {
    const s = this.map.spawn;
    return s[i % s.length];
  }

  placeAtSpawns(list) {
    list.forEach((p, i) => {
      const s = this.spawnPoint(i);
      p.x = s.x; p.y = s.y; p.moving = false; p.inputQueue = []; p.queuedSeq = p.lastSeq;
    });
  }

  visionRadius(p) {
    if (p.role === ROLES.IMPOSTOR) return VISION_BASE * this.settings.impostorVision;
    const base = VISION_BASE * this.settings.crewVision;
    return this.sabotage.lightsOut ? Math.max(VISION_BASE * 0.25, base * 0.25) : base;
  }

  // ---------------------------------------------------------------- 입장/퇴장
  freeColor(preferred) {
    const used = new Set([...this.players.values()].filter((p) => !p.removed).map((p) => p.color));
    if (Number.isInteger(preferred) && !used.has(preferred)) return preferred;
    for (let c = 0; c < COLORS.length; c++) if (!used.has(c)) return c;
    return -1;
  }

  /** @returns {{player?:Player, error?:string}} */
  addPlayer({ name, color, conn, token }) {
    if (this.phase !== PHASES.LOBBY) return { error: ERR.GAME_IN_PROGRESS };
    const active = [...this.players.values()].filter((p) => !p.removed);
    if (active.length >= MAX_PLAYERS) return { error: ERR.ROOM_FULL };
    const p = createPlayer({ name, color: this.freeColor(color), conn, token, now: this.now() });
    if (p.color < 0) return { error: ERR.ROOM_FULL };
    const s = this.spawnPoint(active.length);
    p.x = s.x; p.y = s.y;
    this.players.set(p.id, p);
    if (!this.hostId) { this.hostId = p.id; p.ready = true; }
    this.chatSystem(`${p.name} 님이 들어왔습니다.`);
    this.markDirty();
    return { player: p };
  }

  /** 재접속: 기존 플레이어 객체에 새 연결을 붙인다 */
  reattach(p, conn) {
    p.conn = conn;
    p.connected = true;
    p.disconnectedAt = 0;
    p.inputQueue = [];
    p.queuedSeq = p.lastSeq;
    p.view = { players: new Map(), bodies: new Set(), me: '', ack: -1, lastSentAt: 0 };
    if (!this.hostId || !this.players.get(this.hostId)?.connected) this.hostId = p.id;
    this.chatSystem(`${p.name} 님이 다시 연결되었습니다.`);
    this.markDirty();
  }

  /** 비정상 종료: 유예 시간 동안 자리를 유지한다 */
  onDisconnect(p) {
    if (p.removed || !p.connected) return;
    p.connected = false;
    p.conn = null;
    p.disconnectedAt = this.now();
    p.inputQueue = [];
    p.activeTask = null;
    p.scanning = false;
    if (this.hostId === p.id) this.transferHost();
    this.chatSystem(`${p.name} 님의 연결이 끊어졌습니다.`);
    this.markDirty();
    if (this.phase === PHASES.VOTING) this.maybeEndVotingEarly();
  }

  transferHost() {
    const next = [...this.players.values()]
      .filter((p) => p.connected && !p.removed)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    this.hostId = next?.id ?? null;
    if (next) next.ready = true;
    this.markDirty();
  }

  /** 정상 퇴장 또는 유예 시간 초과 */
  removePlayer(p, reason) {
    if (p.removed) return;
    const wasHost = this.hostId === p.id;
    p.connected = false;
    p.conn = null;
    if (this.phase === PHASES.LOBBY || !p.inGame) {
      this.players.delete(p.id);
    } else {
      // 게임 중 이탈: 원작처럼 시체 없이 제거되고, 그 승무원의 미션은 전체 진행률에서 빠진다
      p.removed = true;
      p.alive = false;
      p.deathKnown = true;
      p.inVent = null;
      p.activeTask = null;
      if (this.meeting) this.meeting.votes.delete(p.id);
    }
    this.onPlayerRemoved(p);
    if (wasHost) this.transferHost();
    this.chatSystem(`${p.name} 님이 나갔습니다.${reason === 'timeout' ? ' (연결 시간 초과)' : ''}`);
    this.markDirty();
    if (this.isEmpty()) { this.close(); return; }
    if (this.phase === PHASES.VOTING) this.maybeEndVotingEarly();
    if (this.inGamePhase()) this.checkWinNow();
  }

  isEmpty() {
    return ![...this.players.values()].some((p) => !p.removed);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.onEmpty(this);
  }

  inGamePhase() {
    return this.phase !== PHASES.LOBBY && this.phase !== PHASES.ENDED;
  }

  // ---------------------------------------------------------------- 메시지 처리
  /**
   * @param {Player} p
   * @param {any} msg 스키마 검증을 통과한 메시지
   * @returns {string|null} 오류 코드
   */
  handle(p, msg) {
    if (p.removed) return ERR.NOT_IN_ROOM;
    switch (msg.t) {
      case 'input': return this.onInput(p, msg);
      case 'chat': return this.onChat(p, msg.text);
      case 'setColor': return this.onSetColor(p, msg.color);
      case 'setSettings': return this.onSetSettings(p, msg.settings);
      case 'ready': return this.onReady(p, msg.ready);
      case 'start': return this.onStart(p);
      case 'kick': return this.onKick(p, msg.playerId);
      case 'taskStart': return this.onTaskStart(p, msg.taskId);
      case 'taskComplete': return this.onTaskComplete(p, msg.taskId, msg.answer);
      case 'taskCancel': return this.onTaskCancel(p);
      case 'kill': return this.onKill(p, msg.targetId);
      case 'report': return this.onReport(p, msg.bodyId);
      case 'emergency': return this.onEmergency(p);
      case 'vent': return this.onVent(p, msg.action, msg.to);
      case 'sabotage': return this.onSabotage(p, msg.kind, msg.room);
      case 'fix': return this.onFix(p, msg);
      case 'vote': return this.onVote(p, msg.target);
      default: return ERR.BAD_MESSAGE;
    }
  }

  onInput(p, msg) {
    // 이미 받은 입력(재전송)은 무시하고 새 입력만 큐에 넣는다
    msg.d.forEach((d, i) => {
      const seq = msg.seq + i;
      if (seq <= p.queuedSeq) return;
      p.queuedSeq = seq;
      p.inputQueue.push({ seq, d });
    });
    // 비정상적으로 많이 쌓인 입력은 버린다 → 클라이언트는 서버 위치로 보정된다
    if (p.inputQueue.length > INPUT_QUEUE_MAX) p.inputQueue.splice(0, p.inputQueue.length - INPUT_QUEUE_MAX);
    return null;
  }

  canMove(p) {
    if (!(this.phase === PHASES.LOBBY || this.phase === PHASES.PLAYING)) return false;
    if (p.removed || p.inVent || p.activeTask) return false;
    return true;
  }

  // ---- 채팅
  chatSystem(text) {
    this.fx('chat', { from: null, text, dead: false }, () => true);
  }

  onChat(p, raw) {
    const text = sanitizeChat(raw);
    if (!text) return ERR.BAD_MESSAGE;
    const now = this.now();
    if (now - p.lastChatAt < CHAT_INTERVAL_MS) return ERR.RATE_LIMITED;
    const meetingOrLobby = this.phase === PHASES.LOBBY || this.phase === PHASES.ENDED || this.isMeeting;
    const ghost = p.inGame && !p.alive && this.inGamePhase();
    // 원작: 게임 중 생존자는 회의 때만 채팅, 유령 채팅은 유령끼리만
    if (!meetingOrLobby && !ghost) return ERR.WRONG_PHASE;
    p.lastChatAt = now;
    const msg = { from: p.id, name: p.name, color: p.color, text, dead: ghost };
    this.fx('chat', msg, (r) => !ghost || !r.inGame || !r.alive);
    return null;
  }

  // ---- 로비
  onSetColor(p, color) {
    if (this.phase !== PHASES.LOBBY) return ERR.WRONG_PHASE;
    if (this.freeColor(color) !== color && p.color !== color) return ERR.COLOR_TAKEN;
    p.color = color;
    this.markDirty();
    return null;
  }

  onSetSettings(p, incoming) {
    if (this.phase !== PHASES.LOBBY) return ERR.WRONG_PHASE;
    if (p.id !== this.hostId) return ERR.NOT_HOST;
    const next = { ...this.settings };
    for (const [key, value] of Object.entries(incoming)) {
      if (!(key in DEFAULT_SETTINGS)) continue;
      const def = DEFAULT_SETTINGS[key];
      if (key === 'killDistance') { if (value in KILL_DISTANCES) next[key] = value; continue; }
      if (key === 'map') { if (this.gameMapIds.includes(value)) next[key] = value; continue; }
      if (key === 'taskBarUpdates') { if (['always', 'meetings', 'never'].includes(value)) next[key] = value; continue; }
      if (typeof def === 'boolean') { if (typeof value === 'boolean') next[key] = value; continue; }
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const [lo, hi] = SETTING_LIMITS[key] ?? [0, 999];
      next[key] = Math.min(hi, Math.max(lo, Number.isInteger(def) ? Math.round(value) : Math.round(value * 100) / 100));
    }
    this.settings = next;
    // 설정이 바뀌면 준비 상태를 초기화 (원작에는 없지만 실수 방지)
    for (const o of this.players.values()) if (o.id !== this.hostId) o.ready = false;
    this.markDirty();
    return null;
  }

  onReady(p, ready) {
    if (this.phase !== PHASES.LOBBY) return ERR.WRONG_PHASE;
    p.ready = p.id === this.hostId ? true : ready;
    this.markDirty();
    return null;
  }

  onKick(p, targetId) {
    if (this.phase !== PHASES.LOBBY) return ERR.WRONG_PHASE;
    if (p.id !== this.hostId) return ERR.NOT_HOST;
    const t = this.players.get(targetId);
    if (!t || t.id === p.id) return ERR.INVALID_TARGET;
    this.send(t, { t: 'kicked' });
    t.conn?.detach?.();
    this.removePlayer(t, 'kicked');
    return null;
  }

  onStart(p) {
    if (this.phase !== PHASES.LOBBY) return ERR.WRONG_PHASE;
    if (p.id !== this.hostId) return ERR.NOT_HOST;
    const list = [...this.players.values()];
    if (list.length < this.minPlayers) return ERR.NOT_ENOUGH_PLAYERS;
    if (list.some((o) => !o.connected || !o.ready)) return ERR.NOT_READY;
    this.startGame();
    return null;
  }

  startGame() {
    const now = this.now();
    const list = [...this.players.values()];
    this.gameId++;
    const roles = assignRoles(list.map((o) => o.id), this.settings.impostors);
    const assign = createTaskAssigner(this.maps[this.settings.map], this.settings);
    this.bodies.clear();
    this.meeting = null;
    this.endInfo = null;
    this.sabotage.onGameStart(now);
    for (const o of list) {
      o.inGame = true;
      o.role = roles.get(o.id);
      o.alive = true;
      o.removed = false;
      o.deathKnown = false;
      o.tasks = assign(o.id); // 임포스터도 "가짜 미션" 목록을 받는다 (원작과 동일, 완료 불가)
      o.activeTask = null;
      o.scanning = false;
      o.inVent = null;
      o.killReadyAt = now + TIMINGS.firstKillCooldown * 1000;
      o.emergencyLeft = this.settings.emergencyMeetings;
    }
    this.emergencyReadyAt = now + this.settings.emergencyCooldown * 1000;
    this.setPhase(PHASES.STARTING, TIMINGS.roleRevealMs); // 이 시점부터 this.map 은 게임 맵
    for (const d of this.map.doors) this.world.setDoorClosed(d.id, false);
    this.placeAtSpawns(list);
    for (const o of list) {
      const team = o.role === ROLES.IMPOSTOR ? list.filter((x) => x.role === ROLES.IMPOSTOR).map((x) => x.id) : [o.id];
      this.send(o, { t: 'fx', kind: 'roleReveal', role: o.role, team, impostorCount: [...roles.values()].filter((r) => r === ROLES.IMPOSTOR).length });
    }
  }

  // ---- 미션
  taskProgress() {
    let done = 0, total = 0;
    for (const p of this.players.values()) {
      if (!p.inGame || p.removed || p.role !== ROLES.CREWMATE) continue;
      total += p.tasks.length;
      done += p.tasks.filter((t) => t.done).length;
    }
    return { done, total };
  }

  onTaskStart(p, defId) {
    if (!this.isPlaying || !p.inGame) return ERR.WRONG_PHASE;
    if (p.role !== ROLES.CREWMATE) return ERR.NOT_ALLOWED;
    if (p.inVent) return ERR.NOT_ALLOWED;
    const task = p.tasks.find((t) => t.defId === defId);
    if (!task) return ERR.INVALID_TARGET;
    if (task.done) return ERR.ALREADY_DONE;
    const spotId = task.spots[task.step];
    const spot = this.map.tasks.find((s) => s.id === spotId);
    if (Math.hypot(p.x - spot.x, p.y - spot.y) > USE_RANGE) return ERR.OUT_OF_RANGE;
    const challenge = makeChallenge(defId);
    p.activeTask = { defId, step: task.step, spotId, startedAt: this.now(), challenge };
    p.inputQueue = [];
    if (defId === 'scan' && this.settings.visualTasks && p.alive) p.scanning = true;
    this.send(p, { t: 'task', defId, step: task.step, spotId, challenge });
    return null;
  }

  onTaskComplete(p, defId, answer) {
    const a = p.activeTask;
    if (!a || a.defId !== defId) return ERR.INVALID_TARGET;
    const now = this.now();
    if (now - a.startedAt < minDurationFor(defId, answer)) return ERR.TOO_FAST;
    const spot = this.map.tasks.find((s) => s.id === a.spotId);
    if (Math.hypot(p.x - spot.x, p.y - spot.y) > USE_RANGE * 1.25) return ERR.OUT_OF_RANGE;
    if (!validateAnswer(defId, a.challenge, answer)) {
      p.activeTask = null;
      p.scanning = false;
      return ERR.WRONG_ANSWER;
    }
    const task = p.tasks.find((t) => t.defId === defId);
    if (!task || task.done || task.step !== a.step) return ERR.ALREADY_DONE;
    task.step++;
    if (task.step >= task.spots.length) task.done = true;
    p.activeTask = null;
    p.scanning = false;
    this.send(p, { t: 'fx', kind: 'taskDone', defId, finished: task.done });
    this.markDirty();
    this.checkWinNow();
    return null;
  }

  onTaskCancel(p) {
    p.activeTask = null;
    p.scanning = false;
    return null;
  }

  // ---- 킬
  onKill(p, targetId) {
    if (!this.isPlaying) return ERR.WRONG_PHASE;
    if (p.role !== ROLES.IMPOSTOR || !p.alive || p.inVent) return ERR.NOT_ALLOWED;
    const now = this.now();
    if (now < p.killReadyAt) return ERR.COOLDOWN;
    const t = this.players.get(targetId);
    if (!t || !t.inGame || !t.alive || t.removed || t.role === ROLES.IMPOSTOR || t.inVent) return ERR.INVALID_TARGET;
    const range = KILL_DISTANCES[this.settings.killDistance] * KILL_TOLERANCE;
    if (Math.hypot(p.x - t.x, p.y - t.y) > range) return ERR.OUT_OF_RANGE;
    if (this.world.lineBlocked(p.x, p.y, t.x, t.y)) return ERR.OUT_OF_RANGE;

    t.alive = false;
    t.activeTask = null;
    t.scanning = false;
    t.inputQueue = [];
    const body = { id: `b${t.id}`, playerId: t.id, x: t.x, y: t.y, color: t.color };
    this.bodies.set(body.id, body);
    // 원작: 임포스터가 피해자 자리로 순간이동
    p.x = t.x; p.y = t.y;
    p.inputQueue = [];
    p.killReadyAt = now + this.settings.killCooldown * 1000;
    this.send(p, { t: 'fx', kind: 'kill', victimId: t.id });
    this.send(t, { t: 'fx', kind: 'killed', killerColor: p.color });
    this.markDirty();
    this.checkWinNow();
    return null;
  }

  // ---- 신고 / 회의 / 투표
  onReport(p, bodyId) {
    if (!this.isPlaying) return ERR.WRONG_PHASE;
    if (!p.alive || p.inVent) return ERR.NOT_ALLOWED;
    const b = this.bodies.get(bodyId);
    if (!b) return ERR.INVALID_TARGET;
    if (Math.hypot(p.x - b.x, p.y - b.y) > REPORT_RANGE || this.world.lineBlocked(p.x, p.y, b.x, b.y)) return ERR.OUT_OF_RANGE;
    this.startMeeting(p, 'report', b);
    return null;
  }

  onEmergency(p) {
    if (!this.isPlaying) return ERR.WRONG_PHASE;
    if (!p.alive || p.inVent) return ERR.NOT_ALLOWED;
    if (p.emergencyLeft <= 0) return ERR.NOT_ALLOWED;
    if (this.now() < this.emergencyReadyAt) return ERR.COOLDOWN;
    if (this.sabotage.critical) return ERR.NOT_ALLOWED; // 원작: 위급 사보타주 중 비상 버튼 불가
    const e = this.map.emergency;
    if (Math.hypot(p.x - e.x, p.y - e.y) > e.range) return ERR.OUT_OF_RANGE;
    p.emergencyLeft--;
    this.startMeeting(p, 'emergency', null);
    return null;
  }

  startMeeting(caller, reason, body) {
    const now = this.now();
    this.sabotage.onMeeting(now);
    const list = this.inGamePlayers;
    for (const o of list) {
      o.activeTask = null;
      o.scanning = false;
      o.inVent = null;
      if (!o.alive) o.deathKnown = true;
    }
    this.placeAtSpawns(list.filter((o) => !o.removed));
    this.bodies.clear();
    this.meeting = {
      callerId: caller.id, reason, bodyColor: body ? body.color : null, bodyPlayerId: body ? body.playerId : null,
      votes: new Map(), result: null,
    };
    this.setPhase(PHASES.DISCUSSION, TIMINGS.meetingIntroMs + this.settings.discussionTime * 1000);
    this.fx('meeting', { reason, callerId: caller.id, bodyColor: this.meeting.bodyColor });
  }

  eligibleVoters() {
    return this.inGamePlayers.filter((o) => o.alive && !o.removed && o.connected);
  }

  onVote(p, target) {
    if (this.phase !== PHASES.VOTING) return ERR.WRONG_PHASE;
    if (!p.inGame || !p.alive || p.removed) return ERR.NOT_ALLOWED;
    if (this.meeting.votes.has(p.id)) return ERR.ALREADY_DONE;
    if (target !== 'skip') {
      const t = this.players.get(target);
      if (!t || !t.inGame || !t.alive || t.removed) return ERR.INVALID_TARGET;
    }
    this.meeting.votes.set(p.id, target);
    this.fx('voted', { voterId: p.id });
    this.markDirty();
    this.maybeEndVotingEarly();
    return null;
  }

  maybeEndVotingEarly() {
    if (this.phase !== PHASES.VOTING) return;
    const voters = this.eligibleVoters();
    if (voters.every((o) => this.meeting.votes.has(o.id))) this.endVoting();
  }

  endVoting() {
    const m = this.meeting;
    // 유효하지 않게 된 표(투표 후 접속 종료된 사람)는 제외
    for (const [voter, target] of m.votes) {
      const v = this.players.get(voter);
      if (!v || v.removed || !v.alive) m.votes.delete(voter);
      else if (target !== 'skip' && !this.players.get(target)?.alive) m.votes.set(voter, 'skip');
    }
    const tally = tallyVotes(m.votes);
    let text;
    const ejected = tally.ejectedId ? this.players.get(tally.ejectedId) : null;
    if (ejected) {
      ejected.alive = false;
      ejected.deathKnown = true;
      const n = ejected.name;
      if (this.settings.confirmEjects) {
        text = ejected.role === ROLES.IMPOSTOR ? `${n}${josa(n, '은', '는')} 임포스터였습니다.` : `${n}${josa(n, '은', '는')} 임포스터가 아니었습니다.`;
      } else {
        text = `${n}${josa(n, '이', '가')} 추방되었습니다.`;
      }
    } else {
      text = tally.tie ? '아무도 추방되지 않았습니다. (동점)' : '아무도 추방되지 않았습니다. (건너뜀)';
    }
    const impLeft = this.inGamePlayers.filter((o) => o.alive && !o.removed && o.role === ROLES.IMPOSTOR).length;
    m.result = {
      ejectedId: ejected?.id ?? null,
      ejectedColor: ejected?.color ?? null,
      tie: tally.tie,
      skipped: tally.skipped,
      text,
      sub: this.settings.confirmEjects ? `임포스터 ${impLeft}명 남음` : '',
      counts: tally.counts,
      votes: this.settings.anonymousVotes ? null : Object.fromEntries(m.votes),
    };
    this.setPhase(PHASES.RESULT, TIMINGS.ejectMs);
    this.fx('voteResult', { result: m.result });
  }

  resumePlaying() {
    const now = this.now();
    for (const o of this.inGamePlayers) {
      if (o.role === ROLES.IMPOSTOR) o.killReadyAt = now + this.settings.killCooldown * 1000;
    }
    this.emergencyReadyAt = now + this.settings.emergencyCooldown * 1000;
    this.meeting = null;
    this.setPhase(PHASES.PLAYING);
  }

  // ---- 벤트
  onVent(p, action, to) {
    if (!this.isPlaying) return ERR.WRONG_PHASE;
    if (p.role !== ROLES.IMPOSTOR || !p.alive) return ERR.NOT_ALLOWED;
    if (action === 'enter') {
      if (p.inVent) return ERR.ALREADY_DONE;
      const vent = this.map.vents
        .map((v) => ({ v, d: Math.hypot(p.x - v.x, p.y - v.y) }))
        .filter((o) => o.d <= VENT_RANGE)
        .sort((a, b) => a.d - b.d)[0]?.v;
      if (!vent) return ERR.OUT_OF_RANGE;
      this.fx('vent', { x: vent.x, y: vent.y, enter: true }, (r) => r.id !== p.id && this.canSeePoint(r, vent.x, vent.y));
      p.inVent = vent.id;
      p.x = vent.x; p.y = vent.y; p.inputQueue = [];
    } else if (action === 'move') {
      const cur = this.map.vents.find((v) => v.id === p.inVent);
      if (!cur || !cur.links.includes(to)) return ERR.INVALID_TARGET;
      const v = this.map.vents.find((x) => x.id === to);
      p.inVent = v.id; p.x = v.x; p.y = v.y;
    } else {
      if (!p.inVent) return ERR.NOT_ALLOWED;
      const v = this.map.vents.find((x) => x.id === p.inVent);
      p.inVent = null;
      this.fx('vent', { x: v.x, y: v.y, enter: false }, (r) => r.id !== p.id && this.canSeePoint(r, v.x, v.y));
    }
    this.markDirty();
    return null;
  }

  // ---- 사보타주
  onSabotage(p, kind, roomName) {
    if (!this.isPlaying) return ERR.WRONG_PHASE;
    if (p.role !== ROLES.IMPOSTOR) return ERR.NOT_ALLOWED;
    return this.sabotage.start(p, kind, roomName, this.now());
  }

  onFix(p, msg) {
    if (!this.isPlaying) return ERR.WRONG_PHASE;
    if (p.inVent) return ERR.NOT_ALLOWED;
    return this.sabotage.fix(p, msg.consoleId, msg.action, msg.value, this.now());
  }

  // ---------------------------------------------------------------- 승패
  checkWinNow() {
    if (!this.inGamePhase() || this.phase === PHASES.RESULT || this.phase === PHASES.STARTING) return;
    const win = checkWin(this.inGamePlayers, this.taskProgress());
    if (win) this.endGame(win.winner, win.reason);
  }

  endGame(winner, reason) {
    if (this.phase === PHASES.ENDED || this.phase === PHASES.LOBBY) return;
    this.endInfo = {
      winner, reason,
      roles: this.inGamePlayers.map((o) => ({ id: o.id, name: o.name, color: o.color, role: o.role, alive: o.alive, removed: o.removed })),
    };
    this.sabotage.reset();
    for (const d of this.map.doors) this.world.setDoorClosed(d.id, false);
    this.setPhase(PHASES.ENDED, TIMINGS.endScreenMs);
    this.fx('gameOver', { winner, reason });
  }

  backToLobby() {
    for (const p of [...this.players.values()]) {
      if (p.removed || !p.connected) { this.players.delete(p.id); this.onPlayerRemoved(p); continue; }
      Object.assign(p, {
        inGame: false, role: null, alive: true, deathKnown: false, tasks: [], activeTask: null, scanning: false,
        inVent: null, ready: p.id === this.hostId,
      });
    }
    if (!this.players.get(this.hostId)) this.transferHost();
    this.bodies.clear();
    this.meeting = null;
    this.endInfo = null;
    this.setPhase(PHASES.LOBBY); // 이 시점부터 this.map 은 대기실
    this.placeAtSpawns([...this.players.values()]);
    if (this.isEmpty()) this.close();
  }

  // ---------------------------------------------------------------- 틱
  tick() {
    if (this.closed) return;
    const now = this.now();
    this.tickCount++;

    // 1) 단계 타이머
    if (this.phaseEndsAt && now >= this.phaseEndsAt) {
      switch (this.phase) {
        case PHASES.STARTING: this.setPhase(PHASES.PLAYING); break;
        case PHASES.DISCUSSION: this.setPhase(PHASES.VOTING, this.settings.votingTime * 1000); break;
        case PHASES.VOTING: this.endVoting(); break;
        case PHASES.RESULT: {
          const win = checkWin(this.inGamePlayers, this.taskProgress());
          if (win) this.endGame(win.winner, win.reason); else this.resumePlaying();
          break;
        }
        case PHASES.ENDED: this.backToLobby(); break;
      }
    }

    // 2) 이동: 입력 1개 = 1틱 이동. 틱마다 크레딧이 1씩 쌓이고(최대 15) 입력 하나에 1씩 쓴다.
    //    지연으로 몰려온 입력은 쌓인 크레딧만큼 따라잡지만, 장기적으로는 실제 시간보다 빨리 움직일 수 없다 (스피드핵 방지)
    for (const p of this.players.values()) {
      p.inputCredit = Math.min(INPUT_CREDIT_MAX, (p.inputCredit ?? 0) + 1);
      let processed = 0;
      while (p.inputQueue.length && p.inputCredit >= 1 && processed < INPUTS_PER_TICK_MAX) {
        const input = p.inputQueue.shift();
        p.inputCredit--;
        processed++;
        p.lastSeq = input.seq;
        if (!this.canMove(p) || input.d === DIR_NONE) { p.moving = false; continue; }
        const ghost = p.inGame && !p.alive && this.phase === PHASES.PLAYING;
        stepMovement(p, input.d, { world: this.world, speedMul: this.settings.playerSpeed, ghost });
        p.moving = true;
        const f = dirFacing(input.d);
        if (f) p.facing = f;
      }
      if (!processed) p.moving = false;
    }

    // 3) 사보타주 타이머
    if (this.isPlaying) this.sabotage.tick(now);

    // 4) 연결 끊긴 플레이어 정리
    const grace = this.phase === PHASES.LOBBY ? TIMINGS.disconnectGraceLobbyMs : TIMINGS.disconnectGraceGameMs;
    for (const p of [...this.players.values()]) {
      if (!p.connected && !p.removed && now - p.disconnectedAt > grace) this.removePlayer(p, 'timeout');
    }
    if (this.closed) return;

    // 5) 상태/스냅샷 전송
    if (this.dirty) { this.dirty = false; this.broadcastState(); }
    if (this.tickCount % SNAPSHOT_EVERY === 0) this.broadcastSnapshots(now);
  }

  // ---------------------------------------------------------------- 시야와 전송
  canSeePoint(viewer, x, y) {
    if (!viewer.inGame || !viewer.alive || !this.inGamePhase()) return true;
    const r = this.visionRadius(viewer) + 40;
    if (Math.hypot(viewer.x - x, viewer.y - y) > r) return false;
    return !this.world.lineBlocked(viewer.x, viewer.y, x, y);
  }

  /** viewer 가 target 의 위치를 받아도 되는가 (월핵 방지) */
  canSee(viewer, target) {
    if (target.removed) return false;
    if (!this.inGamePhase()) return true;
    if (target.inVent) return false;
    const viewerGhost = viewer.inGame && !viewer.alive;
    if (target.inGame && !target.alive) return viewerGhost; // 유령은 유령에게만 보인다
    if (viewerGhost || this.isMeeting) return true;
    return this.canSeePoint(viewer, target.x, target.y);
  }

  broadcastSnapshots(now) {
    for (const viewer of this.players.values()) {
      if (!viewer.connected || viewer.removed) continue;
      const v = viewer.view;
      const changed = [];
      const visible = new Set();
      for (const o of this.players.values()) {
        if (o === viewer || !this.canSee(viewer, o)) continue;
        visible.add(o.id);
        const flags = (o.facing < 0 ? 1 : 0) | (o.moving ? 2 : 0) | (o.inGame && !o.alive ? 4 : 0) | (o.scanning ? 8 : 0);
        const entry = [o.id, Math.round(o.x), Math.round(o.y), flags];
        const key = entry.join(',');
        if (v.players.get(o.id) !== key) { v.players.set(o.id, key); changed.push(entry); }
      }
      const gone = [];
      for (const id of v.players.keys()) if (!visible.has(id)) { v.players.delete(id); gone.push(id); }

      const newBodies = [];
      const seenBodies = new Set();
      for (const b of this.bodies.values()) {
        if (!(viewer.inGame && !viewer.alive) && !this.canSeePoint(viewer, b.x, b.y)) continue;
        seenBodies.add(b.id);
        if (!v.bodies.has(b.id)) { v.bodies.add(b.id); newBodies.push([b.id, Math.round(b.x), Math.round(b.y), b.color, b.playerId]); }
      }
      const goneBodies = [];
      for (const id of v.bodies) if (!seenBodies.has(id)) { v.bodies.delete(id); goneBodies.push(id); }

      const meFlags = (viewer.facing < 0 ? 1 : 0) | (viewer.moving ? 2 : 0) | (viewer.inGame && !viewer.alive ? 4 : 0) | (viewer.scanning ? 8 : 0) | (viewer.inVent ? 16 : 0);
      const me = [viewer.x, viewer.y, meFlags];
      const meKey = me.join(',');
      const ackChanged = v.ack !== viewer.lastSeq;
      if (!changed.length && !gone.length && !newBodies.length && !goneBodies.length && meKey === v.me && !ackChanged && now - v.lastSentAt < 1000) continue;
      v.me = meKey; v.ack = viewer.lastSeq; v.lastSentAt = now;
      const msg = { t: 's', k: this.tickCount, a: viewer.lastSeq, me };
      if (changed.length) msg.p = changed;
      if (gone.length) msg.g = gone;
      if (newBodies.length) msg.b = newBodies;
      if (goneBodies.length) msg.bg = goneBodies;
      this.send(viewer, msg);
    }
  }

  broadcastState() {
    for (const p of this.players.values()) {
      if (p.connected && !p.removed) this.send(p, this.stateFor(p));
    }
  }

  /** 플레이어별 상태. 다른 사람의 역할 등 비공개 정보는 넣지 않는다 */
  stateFor(p) {
    const now = this.now();
    const ghostView = p.inGame && !p.alive;
    const ended = this.phase === PHASES.ENDED;
    const players = [...this.players.values()].map((o) => ({
      id: o.id, name: o.name, color: o.color,
      host: o.id === this.hostId, ready: o.ready, connected: o.connected, left: o.removed,
      inGame: o.inGame,
      dead: o.inGame && !o.alive && (o.deathKnown || ghostView || o.id === p.id || ended),
    }));
    const msg = {
      t: 'state', code: this.code, now, gameId: this.gameId,
      phase: this.phase, endsAt: this.phaseEndsAt, hostId: this.hostId, mapId: this.mapId, maps: this.gameMapIds,
      settings: this.settings, minPlayers: this.minPlayers,
      players,
    };
    if (p.inGame) {
      const commsDown = this.sabotage.commsDown;
      msg.you = {
        id: p.id, role: p.role, alive: p.alive,
        killReadyAt: p.role === ROLES.IMPOSTOR ? p.killReadyAt : 0,
        emergencyLeft: p.emergencyLeft, emergencyReadyAt: this.emergencyReadyAt ?? 0,
        inVent: p.inVent,
        activeTask: p.activeTask ? { defId: p.activeTask.defId, spotId: p.activeTask.spotId } : null,
        // 통신 방해 중에는 원작처럼 미션 목록을 숨긴다
        tasks: commsDown ? null : p.tasks.map((t) => ({ defId: t.defId, step: t.step, steps: t.spots.length, spot: t.done ? null : t.spots[t.step], done: t.done })),
        fake: p.role === ROLES.IMPOSTOR,
      };
      if (p.role === ROLES.IMPOSTOR || ended) {
        msg.impostors = this.inGamePlayers.filter((o) => o.role === ROLES.IMPOSTOR).map((o) => o.id);
      }
      const showBar = this.settings.taskBarUpdates === 'always' || (this.settings.taskBarUpdates === 'meetings' && this.isMeeting);
      msg.taskBar = commsDown || this.settings.taskBarUpdates === 'never' ? null : (showBar ? this.taskProgress() : this.lastBar ?? null);
      if (showBar && !commsDown) this.lastBar = this.taskProgress();
      msg.sabotage = this.sabotage.publicState();
      if (this.meeting) {
        msg.meeting = {
          callerId: this.meeting.callerId, reason: this.meeting.reason, bodyColor: this.meeting.bodyColor,
          voted: [...this.meeting.votes.keys()],
          myVote: this.meeting.votes.get(p.id) ?? null,
          result: this.meeting.result,
        };
      }
    }
    if (ended) msg.end = this.endInfo;
    return msg;
  }
}

/** 한국어 조사: 마지막 글자에 받침이 있으면 withFinal, 없으면 without. 한글이 아니면 둘 다 표기 */
export function josa(word, withFinal, without) {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return `${withFinal}(${without})`;
  return (last - 0xac00) % 28 ? withFinal : without;
}
