// 사보타주 시스템 (원작 스켈드: 원자로, 산소, 전등, 통신, 문)
import { SABOTAGES, CRITICAL_SABOTAGES, TIMINGS, USE_RANGE } from '../../shared/constants.js';
import { ERR } from '../../shared/protocol.js';
import { randInt } from '../util/random.js';

export class SabotageSystem {
  /** @param {import('./Room.js').Room} room */
  constructor(room) {
    this.room = room;
    this.reset();
  }

  reset() {
    /** @type {null|{kind:string, endsAt?:number, holders?:Map<string,string>, code?:string, fixed?:Set<string>, switches?:boolean[], target?:number}} */
    this.active = null;
    this.cooldownUntil = 0;
    /** room name → {closedUntil, cooldownUntil} */
    this.doors = new Map();
  }

  /** 게임 시작: 원작처럼 시작 직후 잠깐은 사보타주 불가 */
  onGameStart(now) {
    this.reset();
    this.cooldownUntil = now + 10_000;
  }

  get critical() {
    return !!this.active && CRITICAL_SABOTAGES.has(this.active.kind);
  }

  get lightsOut() {
    return this.active?.kind === SABOTAGES.LIGHTS;
  }

  get commsDown() {
    return this.active?.kind === SABOTAGES.COMMS;
  }

  /** @returns {string|null} 오류 코드 */
  start(player, kind, roomName, now) {
    if (kind === 'doors') return this.closeDoors(roomName, now);
    if (this.active) return ERR.NOT_ALLOWED;
    if (now < this.cooldownUntil) return ERR.COOLDOWN;
    switch (kind) {
      case SABOTAGES.REACTOR:
        this.active = { kind, endsAt: now + TIMINGS.reactorTime * 1000, holders: new Map() };
        break;
      case SABOTAGES.O2:
        this.active = { kind, endsAt: now + TIMINGS.o2Time * 1000, code: String(randInt(100000)).padStart(5, '0'), fixed: new Set() };
        break;
      case SABOTAGES.LIGHTS: {
        // 원작: 스위치 5개 중 일부가 내려감. 최소 1개는 꺼져 있어야 한다
        const switches = Array.from({ length: 5 }, () => randInt(2) === 1);
        if (switches.every(Boolean)) switches[randInt(5)] = false;
        this.active = { kind, switches };
        break;
      }
      case SABOTAGES.COMMS:
        this.active = { kind, target: randInt(360), dial: (randInt(360) + 180) % 360 };
        break;
      default:
        return ERR.BAD_MESSAGE;
    }
    this.room.fx('sabotage', { sabotage: kind }, () => true);
    this.room.markDirty();
    return null;
  }

  closeDoors(roomName, now) {
    const doors = this.room.map.doors.filter((d) => d.room === roomName);
    if (!doors.length) return ERR.INVALID_TARGET;
    const state = this.doors.get(roomName) ?? { closedUntil: 0, cooldownUntil: 0 };
    if (now < state.cooldownUntil) return ERR.COOLDOWN;
    state.closedUntil = now + TIMINGS.doorCloseMs;
    state.cooldownUntil = now + TIMINGS.doorCooldown * 1000;
    this.doors.set(roomName, state);
    for (const d of doors) this.room.world.setDoorClosed(d.id, true);
    this.room.fx('doors', { room: roomName, closed: true }, () => true);
    this.room.markDirty();
    return null;
  }

  openAllDoors() {
    for (const [roomName, state] of this.doors) {
      if (state.closedUntil) {
        state.closedUntil = 0;
        for (const d of this.room.map.doors.filter((x) => x.room === roomName)) this.room.world.setDoorClosed(d.id, false);
      }
    }
  }

  /** 수리 요청 */
  fix(player, consoleId, action, value, now) {
    const a = this.active;
    const con = this.room.map.consoles.find((c) => c.id === consoleId);
    if (!a || !con || con.sabotage !== a.kind) return ERR.INVALID_TARGET;
    if (!player.alive) return ERR.NOT_ALLOWED; // 원작: 유령은 사보타주를 고칠 수 없다
    if (Math.hypot(player.x - con.x, player.y - con.y) > USE_RANGE) return ERR.OUT_OF_RANGE;

    switch (a.kind) {
      case SABOTAGES.REACTOR:
        if (action === 'hold') {
          // 한 사람이 두 장치를 동시에 누를 수 없다
          for (const [cid, pid] of a.holders) if (pid === player.id && cid !== consoleId) a.holders.delete(cid);
          a.holders.set(consoleId, player.id);
        } else if (action === 'release') {
          if (a.holders.get(consoleId) === player.id) a.holders.delete(consoleId);
        } else return ERR.BAD_MESSAGE;
        break;
      case SABOTAGES.O2:
        if (action !== 'code') return ERR.BAD_MESSAGE;
        if (String(Math.trunc(value ?? -1)).padStart(5, '0') !== a.code) return ERR.WRONG_ANSWER;
        a.fixed.add(consoleId);
        if (a.fixed.size >= 2) this.resolve(now);
        break;
      case SABOTAGES.LIGHTS: {
        if (action !== 'switch' || !Number.isInteger(value) || value < 0 || value >= a.switches.length) return ERR.BAD_MESSAGE;
        a.switches[value] = !a.switches[value];
        if (a.switches.every(Boolean)) this.resolve(now);
        break;
      }
      case SABOTAGES.COMMS: {
        if (action !== 'dial' || typeof value !== 'number') return ERR.BAD_MESSAGE;
        a.dial = ((Math.round(value) % 360) + 360) % 360;
        const diff = Math.abs(((a.dial - a.target + 540) % 360) - 180);
        if (diff <= 8) this.resolve(now);
        break;
      }
      default:
        return ERR.BAD_MESSAGE;
    }
    this.room.markDirty();
    return null;
  }

  resolve(now) {
    if (!this.active) return;
    const kind = this.active.kind;
    this.active = null;
    this.cooldownUntil = now + TIMINGS.sabotageCooldown * 1000;
    this.room.fx('sabotageFixed', { sabotage: kind }, () => true);
    this.room.markDirty();
  }

  /** 회의 시작: 원자로/산소는 해결된 것으로 처리 (원작 동일), 문은 열린다 */
  onMeeting(now) {
    if (this.critical) this.resolve(now);
    this.openAllDoors();
  }

  tick(now) {
    // 문 자동 열림
    for (const [roomName, state] of this.doors) {
      if (state.closedUntil && now >= state.closedUntil) {
        state.closedUntil = 0;
        for (const d of this.room.map.doors.filter((x) => x.room === roomName)) this.room.world.setDoorClosed(d.id, false);
        this.room.fx('doors', { room: roomName, closed: false }, () => true);
        this.room.markDirty();
      }
    }
    const a = this.active;
    if (!a) return;
    if (a.kind === SABOTAGES.REACTOR) {
      // 손을 대고 있는 사람이 자리를 벗어나거나 죽으면 해제
      for (const [cid, pid] of a.holders) {
        const p = this.room.players.get(pid);
        const con = this.room.map.consoles.find((c) => c.id === cid);
        if (!p || !p.alive || !p.connected || Math.hypot(p.x - con.x, p.y - con.y) > USE_RANGE * 1.2) {
          a.holders.delete(cid);
          this.room.markDirty();
        }
      }
      const ids = new Set(a.holders.values());
      if (a.holders.size >= 2 && ids.size >= 2) { this.resolve(now); return; }
    }
    if (a.endsAt && now >= a.endsAt) {
      this.room.endGame('impostor', 'sabotage');
    }
  }

  /** 클라이언트에 보낼 공개 상태 */
  publicState() {
    const a = this.active;
    const doorsClosed = [...this.room.world.closedDoors];
    const doorCooldowns = Object.fromEntries([...this.doors].map(([r, s]) => [r, s.cooldownUntil]));
    if (!a) return { active: null, cooldownUntil: this.cooldownUntil, doorsClosed, doorCooldowns };
    const base = { kind: a.kind, endsAt: a.endsAt ?? null };
    if (a.kind === SABOTAGES.REACTOR) base.held = [...a.holders.keys()];
    if (a.kind === SABOTAGES.O2) { base.code = a.code; base.fixed = [...a.fixed]; }
    if (a.kind === SABOTAGES.LIGHTS) base.switches = [...a.switches];
    if (a.kind === SABOTAGES.COMMS) { base.target = a.target; base.dial = a.dial; }
    return { active: base, cooldownUntil: this.cooldownUntil, doorsClosed, doorCooldowns };
  }
}
