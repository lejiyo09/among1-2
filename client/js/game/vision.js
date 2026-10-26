// 시야 다각형: 플레이어 중심에서 광선을 쏘아 벽(충돌 격자)에 막히는 지점을 찾는다.
// 원작처럼 벽 너머는 어둡게 가려진다.

const RAY_COUNT = 120;
const STEP = 4;
const WALL_PEEK = 14;     // 벽 표면이 약간 보이도록 광선을 조금 더 뻗는다
const WALL_PEEK_UP = 60;  // 위쪽 벽은 원근 때문에 벽면이 높게 그려져 있어 더 많이 보이게 한다

const COS = Array.from({ length: RAY_COUNT }, (_, i) => Math.cos((i / RAY_COUNT) * Math.PI * 2));
const SIN = Array.from({ length: RAY_COUNT }, (_, i) => Math.sin((i / RAY_COUNT) * Math.PI * 2));

/**
 * @param {import('../../shared/map.js').CollisionWorld} world
 * @returns {{x:number,y:number}[]}
 */
export function visibilityPolygon(world, cx, cy, radius) {
  const { cell } = world.map;
  const pts = new Array(RAY_COUNT);
  for (let i = 0; i < RAY_COUNT; i++) {
    let d = 0;
    let hit = false;
    while (d < radius) {
      d += STEP;
      const x = cx + COS[i] * d, y = cy + SIN[i] * d;
      if (world.opaqueCell(Math.floor(x / cell), Math.floor(y / cell))) { hit = true; break; }
    }
    const peek = SIN[i] < -0.3 ? WALL_PEEK_UP : WALL_PEEK;
    const len = hit ? Math.min(radius, d + peek) : radius;
    pts[i] = { x: cx + COS[i] * len, y: cy + SIN[i] * len };
  }
  return pts;
}
