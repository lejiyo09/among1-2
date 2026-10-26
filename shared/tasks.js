// 미션 정의 (원작 스켈드·미라 HQ 미션 목록 기준)
// - length: common(공통) / long(긴) / short(짧은) — 원작 분류 (같은 미션이라도 맵마다 분류가 다르면 정의를 따로 둔다)
// - maps: 이 미션이 나오는 맵. 없으면 단계별 지점이 모두 있는 맵에서 나온다
// - game: 미니게임 이름 (없으면 id). 단계마다 다르면 steps[].game
// - steps: 단계별로 사용할 수 있는 미션 지점(맵 tasks 레이어의 taskType) 목록
// - minMs: 서버가 인정하는 최소 수행 시간. 이보다 빨리 완료 요청이 오면 거부한다.
// - visual: 원작의 "시각 미션" (다른 플레이어에게도 보이는 연출이 있음)

/**
 * @typedef {{
 *   id:string, name:string, length:'common'|'long'|'short',
 *   steps:{spotType:string, pick?:string, name?:string, game?:string}[],
 *   minMs:number, visual?:boolean, maps?:string[], game?:string
 * }} TaskDef
 */

/** @type {Record<string, TaskDef>} */
export const TASK_DEFS = {
  wires: {
    id: 'wires', name: '배선 수리', length: 'common', minMs: 1500,
    // 원작: 6곳 중 3곳을 정해진 순서로
    steps: [{ spotType: 'wires' }, { spotType: 'wires' }, { spotType: 'wires' }],
  },
  card: { id: 'card', maps: ['skeld'], name: '카드 긁기', length: 'common', minMs: 900, steps: [{ spotType: 'card' }] },

  asteroids: { id: 'asteroids', name: '소행성 파괴', length: 'long', minMs: 7000, visual: true, steps: [{ spotType: 'asteroids' }] },
  align: { id: 'align', maps: ['skeld'], name: '엔진 출력 정렬', length: 'long', minMs: 900, steps: [{ spotType: 'align', pick: 'upper' }, { spotType: 'align', pick: 'lower' }] },
  fuel: {
    id: 'fuel', name: '엔진 연료 주입', length: 'long', minMs: 2800, maps: ['skeld'],
    steps: [
      { spotType: 'fuel', pick: 'storage', name: '연료 채우기' }, { spotType: 'fuel', pick: 'upper', name: '상부 엔진 주입' },
      { spotType: 'fuel', pick: 'storage', name: '연료 채우기' }, { spotType: 'fuel', pick: 'lower', name: '하부 엔진 주입' },
    ],
  },
  scan: { id: 'scan', name: '스캔 제출', length: 'long', minMs: 9500, visual: true, steps: [{ spotType: 'scan' }] },
  simon: { id: 'simon', name: '원자로 가동', length: 'long', minMs: 6000, steps: [{ spotType: 'simon' }] },
  garbage: {
    id: 'garbage', name: '쓰레기 비우기', length: 'long', minMs: 2200, visual: true, maps: ['skeld'],
    steps: [{ spotType: 'garbage', pick: 'cafeteria', name: '식당' }, { spotType: 'garbage', pick: 'storage', name: '창고' }],
  },

  manifolds: { id: 'manifolds', name: '매니폴드 잠금 해제', length: 'short', minMs: 2500, steps: [{ spotType: 'manifolds' }] },
  shields: { id: 'shields', name: '방어막 작동', length: 'short', minMs: 1200, visual: true, steps: [{ spotType: 'shields' }] },
  steering: { id: 'steering', maps: ['skeld'], name: '조종 안정화', length: 'short', minMs: 800, steps: [{ spotType: 'steering' }] },
  calibrate: { id: 'calibrate', maps: ['skeld'], name: '분배기 보정', length: 'short', minMs: 2000, steps: [{ spotType: 'calibrate' }] },
  data: {
    id: 'data', name: '데이터 다운로드/업로드', length: 'short', minMs: 8000, maps: ['skeld'],
    steps: [{ spotType: 'download', pick: 'random', name: '다운로드' }, { spotType: 'upload', pick: 'admin', name: '업로드' }],
  },
  chart: { id: 'chart', name: '항로 설정', length: 'short', minMs: 1500, steps: [{ spotType: 'chart' }] },
  o2filter: { id: 'o2filter', name: '산소 필터 청소', length: 'short', minMs: 2000, steps: [{ spotType: 'o2filter' }] },
  divert: { id: 'divert', name: '전력 우회', length: 'short', minMs: 800, maps: ['skeld'], steps: [{ spotType: 'divert' }] },

  // ---- 미라 HQ 전용 (원작 미라 HQ 미션 목록, 지점 좌표는 SkeldJS mapTasksData 참고)
  idcode: { id: 'idcode', name: '신원 확인 코드 입력', length: 'common', minMs: 1500, maps: ['mira'], steps: [{ spotType: 'idcode' }] },
  water: {
    id: 'water', name: '식물에 물 주기', length: 'long', minMs: 1800, maps: ['mira'],
    steps: [{ spotType: 'water', pick: 'storage', name: '물뿌리개 챙기기' }, { spotType: 'water', pick: 'greenhouse', name: '식물에 물 주기' }],
  },
  divertMira: {
    id: 'divertMira', name: '전력 우회', length: 'long', minMs: 800, maps: ['mira'], game: 'divert',
    steps: [{ spotType: 'divert', name: '전력 보내기' }, { spotType: 'divertAccept', pick: 'random', name: '전력 받기', game: 'divertAccept' }],
  },
  fuelMira: {
    id: 'fuelMira', name: '엔진 연료 주입', length: 'short', minMs: 2800, maps: ['mira'], game: 'fuel',
    steps: [{ spotType: 'gascan', name: '연료 채우기' }, { spotType: 'rocket', name: '로켓에 연료 넣기' }],
  },
  garbageMira: { id: 'garbageMira', name: '쓰레기 비우기', length: 'short', minMs: 2200, maps: ['mira'], game: 'garbage', steps: [{ spotType: 'garbage' }] },
  artifact: { id: 'artifact', name: '유물 조립', length: 'short', minMs: 1500, maps: ['mira'], steps: [{ spotType: 'artifact' }] },
  samples: { id: 'samples', name: '샘플 분류', length: 'short', minMs: 1500, maps: ['mira'], steps: [{ spotType: 'samples' }] },
  weather: { id: 'weather', name: '날씨 측정', length: 'short', minMs: 6000, maps: ['mira'], steps: [{ spotType: 'weather' }] },
  beverage: { id: 'beverage', name: '음료 구매', length: 'short', minMs: 1200, maps: ['mira'], steps: [{ spotType: 'beverage' }] },
  process: { id: 'process', name: '데이터 처리', length: 'short', minMs: 7000, maps: ['mira'], steps: [{ spotType: 'process' }] },
  diagnostics: { id: 'diagnostics', name: '진단 실행', length: 'short', minMs: 5000, maps: ['mira'], steps: [{ spotType: 'diagnostics' }] },
};

export const TASK_IDS = Object.keys(TASK_DEFS);

/** 단계에 쓰는 미니게임 이름 */
export function gameOf(defId, step = 0) {
  const def = TASK_DEFS[defId];
  return def?.steps[step]?.game ?? def?.game ?? defId;
}

/** 단계별 지점 후보를 고르는 규칙: pick 이 방 키워드면 그 방의 지점만 */
export const PICK_ROOM = { storage: 'Storage', upper: 'UpperEngine', lower: 'LowerEngine', admin: 'Admin', cafeteria: 'Cafeteria', greenhouse: 'Greenhouse' };

export function stepCandidates(map, step) {
  let c = map.tasks.filter((t) => t.taskType === step.spotType);
  if (step.pick && step.pick !== 'random') c = c.filter((t) => t.room === PICK_ROOM[step.pick]);
  return c;
}

/** 이 맵에서 나올 수 있는 미션 정의 */
export function taskDefsFor(map) {
  return Object.values(TASK_DEFS).filter((d) => (!d.maps || d.maps.includes(map.id)) && d.steps.every((s) => stepCandidates(map, s).length > 0));
}

/** 방 이름 한국어 표기 */
export const ROOM_NAMES_KO = {
  Cafeteria: '식당', Weapons: '무기고', O2: '산소', Navigation: '항해실', Shields: '방어막',
  Communications: '통신실', Storage: '창고', Admin: '관리실', Electrical: '전기실', LowerEngine: '하부 엔진',
  Security: '보안실', Reactor: '원자로', UpperEngine: '상부 엔진', MedBay: '의무실', Hallway: '복도',
  Launchpad: '발사대', LockerRoom: '탈의실', Decontamination: '오염 제거실', Laboratory: '연구실', Greenhouse: '온실',
  Office: '사무실', Balcony: '발코니',
};

/** 카드 긁기 허용 속도 범위(ms). 원작처럼 너무 빠르거나 느리면 실패 */
export const CARD_SWIPE_MS = [450, 1500];
export const SIMON_ROUNDS = 5;
export const ASTEROIDS_TARGET = 20;
export const MANIFOLD_COUNT = 10;
export const SHIELD_COUNT = 7;
export const WIRE_COLORS = ['red', 'blue', 'yellow', 'magenta'];

/** 미라 HQ 음료 자판기: 원작처럼 쪽지에 적힌 음료의 칸 번호(행 A~C, 열 1~4)를 누른다 */
export const BEVERAGES = ['콜라', '사이다', '오렌지', '포도', '커피', '우유', '물', '레몬', '복숭아', '녹차', '자몽', '에너지'];
export const SAMPLE_KINDS = 3;
/** 전력 우회 스위치 8개가 가리키는 곳. 미라 HQ 는 "전력 받기" 지점이 있는 방 순서와 같다 */
export const DIVERT_TARGETS = {
  skeld: ['무기', '산소', '항해', '방어막', '통신', '조종', '원자로', '보안'],
  mira: ['Launchpad', 'Cafeteria', 'Laboratory', 'Communications', 'MedBay', 'Admin', 'Office', 'Greenhouse'],
};
