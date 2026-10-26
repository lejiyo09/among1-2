// 미션 정의 (원작 스켈드 미션 목록 기준)
// - length: common(공통) / long(긴) / short(짧은) — 원작 분류
// - steps: 단계별로 사용할 수 있는 미션 지점(맵 tasks 레이어의 taskType) 목록
// - minMs: 서버가 인정하는 최소 수행 시간. 이보다 빨리 완료 요청이 오면 거부한다.
// - visual: 원작의 "시각 미션" (다른 플레이어에게도 보이는 연출이 있음)

/**
 * @typedef {{
 *   id:string, name:string, length:'common'|'long'|'short',
 *   steps:{spotType:string, pick?:'random'|'storage'|'upper'|'lower'|'admin'|'cafeteria', name?:string}[],
 *   minMs:number, visual?:boolean, wiresSteps?:number
 * }} TaskDef
 */

/** @type {Record<string, TaskDef>} */
export const TASK_DEFS = {
  wires: {
    id: 'wires', name: '배선 수리', length: 'common', minMs: 1500,
    // 원작: 6곳 중 3곳을 정해진 순서로
    steps: [{ spotType: 'wires' }, { spotType: 'wires' }, { spotType: 'wires' }],
  },
  card: { id: 'card', name: '카드 긁기', length: 'common', minMs: 900, steps: [{ spotType: 'card' }] },

  asteroids: { id: 'asteroids', name: '소행성 파괴', length: 'long', minMs: 7000, visual: true, steps: [{ spotType: 'asteroids' }] },
  align: { id: 'align', name: '엔진 출력 정렬', length: 'long', minMs: 900, steps: [{ spotType: 'align', pick: 'upper' }, { spotType: 'align', pick: 'lower' }] },
  fuel: {
    id: 'fuel', name: '엔진 연료 주입', length: 'long', minMs: 2800,
    steps: [
      { spotType: 'fuel', pick: 'storage', name: '연료 채우기' }, { spotType: 'fuel', pick: 'upper', name: '상부 엔진 주입' },
      { spotType: 'fuel', pick: 'storage', name: '연료 채우기' }, { spotType: 'fuel', pick: 'lower', name: '하부 엔진 주입' },
    ],
  },
  scan: { id: 'scan', name: '스캔 제출', length: 'long', minMs: 9500, visual: true, steps: [{ spotType: 'scan' }] },
  simon: { id: 'simon', name: '원자로 가동', length: 'long', minMs: 6000, steps: [{ spotType: 'simon' }] },
  garbage: {
    id: 'garbage', name: '쓰레기 비우기', length: 'long', minMs: 2200, visual: true,
    steps: [{ spotType: 'garbage', pick: 'cafeteria', name: '식당' }, { spotType: 'garbage', pick: 'storage', name: '창고' }],
  },

  manifolds: { id: 'manifolds', name: '매니폴드 잠금 해제', length: 'short', minMs: 2500, steps: [{ spotType: 'manifolds' }] },
  shields: { id: 'shields', name: '방어막 작동', length: 'short', minMs: 1200, visual: true, steps: [{ spotType: 'shields' }] },
  steering: { id: 'steering', name: '조종 안정화', length: 'short', minMs: 800, steps: [{ spotType: 'steering' }] },
  calibrate: { id: 'calibrate', name: '분배기 보정', length: 'short', minMs: 2000, steps: [{ spotType: 'calibrate' }] },
  data: {
    id: 'data', name: '데이터 다운로드/업로드', length: 'short', minMs: 8000,
    steps: [{ spotType: 'download', pick: 'random', name: '다운로드' }, { spotType: 'upload', pick: 'admin', name: '업로드' }],
  },
  chart: { id: 'chart', name: '항로 설정', length: 'short', minMs: 1500, steps: [{ spotType: 'chart' }] },
  o2filter: { id: 'o2filter', name: '산소 필터 청소', length: 'short', minMs: 2000, steps: [{ spotType: 'o2filter' }] },
  divert: { id: 'divert', name: '전력 우회', length: 'short', minMs: 800, steps: [{ spotType: 'divert' }] },
};

export const TASK_IDS = Object.keys(TASK_DEFS);

/** 방 이름 한국어 표기 */
export const ROOM_NAMES_KO = {
  Cafeteria: '식당', Weapons: '무기고', O2: '산소', Navigation: '항해실', Shields: '방어막',
  Communications: '통신실', Storage: '창고', Admin: '관리실', Electrical: '전기실', LowerEngine: '하부 엔진',
  Security: '보안실', Reactor: '원자로', UpperEngine: '상부 엔진', MedBay: '의무실', Hallway: '복도',
};

/** 카드 긁기 허용 속도 범위(ms). 원작처럼 너무 빠르거나 느리면 실패 */
export const CARD_SWIPE_MS = [450, 1500];
export const SIMON_ROUNDS = 5;
export const ASTEROIDS_TARGET = 20;
export const MANIFOLD_COUNT = 10;
export const SHIELD_COUNT = 7;
export const WIRE_COLORS = ['red', 'blue', 'yellow', 'magenta'];
