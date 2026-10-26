// 방 목록, 방 코드, 재접속 토큰을 관리하고 메시지를 방으로 전달한다
import { ROOM_CODE_LENGTH, MIN_PLAYERS, PROTOCOL_VERSION, TICK_MS } from '../shared/constants.js';
import { ERR, sanitizeName } from '../shared/protocol.js';
import { Room } from './game/Room.js';
import { roomCode, token as newToken } from './util/random.js';
import { log } from './util/log.js';

export class RoomManager {
  /**
   * @param {{maps:Record<string,any>, maxRooms?:number, minPlayers?:number, now?:()=>number}} opts
   */
  constructor({ maps, map, maxRooms = 100, minPlayers = MIN_PLAYERS, now = Date.now }) {
    this.maps = maps ?? { [map.id ?? 'skeld']: map };
    this.maxRooms = maxRooms;
    this.minPlayers = minPlayers;
    this.now = now;
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    /** @type {Map<string, {code:string, playerId:string}>} 재접속 토큰 */
    this.sessions = new Map();
    this.timer = null;
    this.tickStats = { avg: 0, max: 0 };
  }

  // ------------------------------------------------------------- 틱 루프
  start() {
    // setInterval 은 밀리므로, 목표 시각 기준으로 다음 틱을 예약해 평균 30Hz 를 지킨다
    let next = Date.now();
    const loop = () => {
      const now = Date.now();
      let guard = 0;
      while (now >= next && guard++ < 5) {
        this.tickAll();
        next += TICK_MS;
      }
      if (now - next > 1000) next = now; // 서버가 오래 멈췄다면 따라잡지 않는다
      this.timer = setTimeout(loop, Math.max(0, next - Date.now()));
    };
    loop();
  }

  stop() {
    clearTimeout(this.timer);
  }

  tickAll() {
    const t0 = performance.now();
    for (const room of this.rooms.values()) {
      try {
        room.tick();
      } catch (err) {
        log.error(`room ${room.code} tick failed`, err.stack);
      }
    }
    // 틱 처리 시간 통계 (/healthz 에 노출). 33ms 를 넘으면 서버가 버거운 것
    const dt = performance.now() - t0;
    this.tickStats.avg = this.tickStats.avg * 0.98 + dt * 0.02;
    this.tickStats.max = Math.max(this.tickStats.max * 0.999, dt);
  }

  stats() {
    let players = 0;
    for (const r of this.rooms.values()) players += [...r.players.values()].filter((p) => p.connected).length;
    return { rooms: this.rooms.size, players, tickMsAvg: +this.tickStats.avg.toFixed(2), tickMsMax: +this.tickStats.max.toFixed(2) };
  }

  // ------------------------------------------------------------- 방
  createRoom() {
    if (this.rooms.size >= this.maxRooms) return null;
    let code;
    do code = roomCode(ROOM_CODE_LENGTH); while (this.rooms.has(code));
    const room = new Room({
      code, maps: this.maps, now: this.now, minPlayers: this.minPlayers,
      onEmpty: (r) => { this.rooms.delete(r.code); log.info(`room ${r.code} closed`); },
      onPlayerRemoved: (p) => { if (p.token) this.sessions.delete(p.token); },
    });
    this.rooms.set(code, room);
    log.info(`room ${code} created`);
    return room;
  }

  bind(conn, room, player) {
    conn.room = room;
    conn.player = player;
  }

  // ------------------------------------------------------------- 메시지
  /**
   * @param {import('./net/Connection.js').Connection} conn
   * @param {any} msg 스키마 검증을 통과한 메시지
   * @returns {string|null} 오류 코드
   */
  handle(conn, msg) {
    switch (msg.t) {
      case 'hello':
        conn.send({ t: 'welcome', protocol: PROTOCOL_VERSION, now: this.now(), minPlayers: this.minPlayers });
        return null;
      case 'ping':
        conn.send({ t: 'pong', ts: msg.ts, now: this.now() });
        return null;
      case 'create': return this.onCreate(conn, msg);
      case 'join': return this.onJoin(conn, msg);
      case 'resume': return this.onResume(conn, msg);
      case 'leave': return this.onLeave(conn);
      default:
        if (!conn.player || !conn.room) return ERR.NOT_IN_ROOM;
        return conn.room.handle(conn.player, msg);
    }
  }

  onCreate(conn, msg) {
    if (conn.player) return ERR.ALREADY_IN_ROOM;
    const name = sanitizeName(msg.name);
    if (!name) return ERR.BAD_NAME;
    const room = this.createRoom();
    if (!room) return ERR.SERVER_FULL;
    return this.enter(conn, room, name, msg.color);
  }

  onJoin(conn, msg) {
    if (conn.player) return ERR.ALREADY_IN_ROOM;
    const name = sanitizeName(msg.name);
    if (!name) return ERR.BAD_NAME;
    const room = this.rooms.get(msg.code);
    if (!room) return ERR.ROOM_NOT_FOUND;
    return this.enter(conn, room, name, msg.color);
  }

  enter(conn, room, name, color) {
    const token = newToken();
    const { player, error } = room.addPlayer({ name, color, conn, token });
    if (error) {
      if (room.isEmpty()) this.rooms.delete(room.code);
      return error;
    }
    this.sessions.set(token, { code: room.code, playerId: player.id });
    this.bind(conn, room, player);
    conn.send({ t: 'joined', code: room.code, playerId: player.id, token });
    log.info(`player ${player.id} (${name}) joined ${room.code}`);
    return null;
  }

  onResume(conn, msg) {
    if (conn.player) return ERR.ALREADY_IN_ROOM;
    const s = this.sessions.get(msg.token);
    const room = s && this.rooms.get(s.code);
    const player = room?.players.get(s.playerId);
    if (!room || !player || player.removed || player.token !== msg.token) {
      this.sessions.delete(msg.token);
      return ERR.SESSION_EXPIRED;
    }
    // 같은 토큰으로 다른 탭이 이미 접속해 있으면 이전 연결을 끊는다
    if (player.connected && player.conn && player.conn !== conn) {
      player.conn.send({ t: 'replaced' });
      player.conn.detach();
    }
    room.reattach(player, conn);
    this.bind(conn, room, player);
    conn.send({ t: 'joined', code: room.code, playerId: player.id, token: msg.token, resumed: true });
    log.info(`player ${player.id} resumed in ${room.code}`);
    return null;
  }

  onLeave(conn) {
    const { room, player } = conn;
    if (!room || !player) return ERR.NOT_IN_ROOM;
    conn.player = null;
    conn.room = null;
    room.removePlayer(player, 'left');
    this.sessions.delete(player.token);
    conn.send({ t: 'left' });
    return null;
  }

  /** 소켓이 닫힘: 정상 퇴장(leave)이 아니었다면 유예 시간 동안 자리를 유지 */
  onClose(conn) {
    if (conn.room && conn.player && conn.player.conn === conn) conn.room.onDisconnect(conn.player);
    conn.room = null;
    conn.player = null;
  }
}
