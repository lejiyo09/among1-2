// 결정적(deterministic) 이동 시뮬레이션. 서버와 클라이언트가 같은 함수를 실행하므로
// 클라이언트 예측 결과와 서버 확정 결과가 정확히 일치한다.
import { BASE_SPEED, PLAYER_RADIUS, TICK_RATE } from './constants.js';

/** 입력 방향: -1 = 정지, 0..15 = 22.5° 간격 (0 = 오른쪽, 4 = 아래, 8 = 왼쪽, 12 = 위) */
export const DIR_NONE = -1;
const VEC = Array.from({ length: 16 }, (_, i) => {
  const a = (i * Math.PI) / 8;
  // 부동소수 오차를 없애기 위해 소수 6자리로 고정
  return [Math.round(Math.cos(a) * 1e6) / 1e6, Math.round(Math.sin(a) * 1e6) / 1e6];
});

export function isValidDir(d) {
  return Number.isInteger(d) && d >= -1 && d <= 15;
}

/** 키보드 입력(상하좌우)을 방향 번호로 */
export function dirFromKeys(left, right, up, down) {
  const x = (right ? 1 : 0) - (left ? 1 : 0);
  const y = (down ? 1 : 0) - (up ? 1 : 0);
  if (!x && !y) return DIR_NONE;
  return dirFromVector(x, y);
}

/** 임의의 벡터(조이스틱)를 가장 가까운 16방향으로 */
export function dirFromVector(x, y) {
  if (Math.hypot(x, y) < 1e-6) return DIR_NONE;
  const a = Math.atan2(y, x);
  return ((Math.round(a / (Math.PI / 8)) % 16) + 16) % 16;
}

/**
 * 한 틱 이동을 적용한다.
 * @param {{x:number,y:number}} pos 변경됨
 * @param {number} dir
 * @param {{world:import('./map.js').CollisionWorld, speedMul:number, ghost:boolean}} opts
 */
export function stepMovement(pos, dir, { world, speedMul, ghost }) {
  if (dir === DIR_NONE) return pos;
  const [vx, vy] = VEC[dir];
  const dist = (BASE_SPEED * speedMul) / TICK_RATE;
  if (ghost) {
    // 유령은 벽을 통과하지만 맵 밖으로는 못 나간다
    pos.x = Math.min(world.map.width - 10, Math.max(10, pos.x + vx * dist));
    pos.y = Math.min(world.map.height - 10, Math.max(10, pos.y + vy * dist));
    return pos;
  }
  const r = world.moveCircle(pos.x, pos.y, vx * dist, vy * dist, PLAYER_RADIUS);
  pos.x = r.x;
  pos.y = r.y;
  return pos;
}

/** 방향의 좌우 성분 (스프라이트 좌우 반전용): -1 왼쪽, 1 오른쪽, 0 수직 */
export function dirFacing(dir) {
  if (dir === DIR_NONE) return 0;
  const vx = VEC[dir][0];
  return vx < -1e-3 ? -1 : vx > 1e-3 ? 1 : 0;
}
