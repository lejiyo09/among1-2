// 테스트용: 가짜 시계와 가짜 연결로 Room 을 직접 조작한다
import { Room } from '../server/game/Room.js';
import { loadMap } from '../server/mapLoader.js';
import { TICK_MS, PHASES } from '../shared/constants.js';

export const map = loadMap('skeld');

export function fakeConn() {
  return {
    msgs: [],
    send(m) { this.msgs.push(m); },
    detach() {},
    last(pred) { for (let i = this.msgs.length - 1; i >= 0; i--) if (pred(this.msgs[i])) return this.msgs[i]; return null; },
    clear() { this.msgs.length = 0; },
  };
}

export function setupRoom(n = 4, { settings = {}, minPlayers = 2 } = {}) {
  const clock = { t: 1_000_000 };
  const room = new Room({ code: 'TESTAA', map, now: () => clock.t, minPlayers });
  const players = [];
  for (let i = 0; i < n; i++) {
    const conn = fakeConn();
    const { player, error } = room.addPlayer({ name: `P${i}`, color: i, conn, token: `tok${i}` });
    if (error) throw new Error(error);
    player.ready = true;
    players.push(player);
  }
  Object.assign(room.settings, settings);
  const advance = (ms) => {
    const end = clock.t + ms;
    while (clock.t < end) { clock.t = Math.min(end, clock.t + TICK_MS); room.tick(); }
  };
  return { room, players, clock, advance };
}

/** 게임을 시작하고 역할 공개 연출이 끝날 때까지 진행 */
export function startGame(ctx) {
  const err = ctx.room.handle(ctx.room.players.get(ctx.room.hostId), { t: 'start' });
  if (err) throw new Error(err);
  ctx.advance(6000);
  if (ctx.room.phase !== PHASES.PLAYING) throw new Error(`phase ${ctx.room.phase}`);
  const impostors = ctx.players.filter((p) => p.role === 'impostor');
  const crew = ctx.players.filter((p) => p.role === 'crewmate');
  return { impostors, crew };
}

/** 플레이어를 지점으로 순간이동 (테스트 전용) */
export function teleport(p, x, y) {
  p.x = x; p.y = y; p.inputQueue = [];
}
