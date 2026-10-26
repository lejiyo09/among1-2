// 게임 전역 상수와 기본 설정. 서버와 클라이언트가 같이 쓴다.
// 기본값은 원작 Among Us 기본 게임 설정을 기준으로 했다 (리그 위키/나무위키/커뮤니티 자료 기준 고증).

export const PROTOCOL_VERSION = 1;

/** 맵 1 "원작 유닛"을 픽셀로 환산한 값 (팬아트 스켈드 기준 약 80px) */
export const UNIT = 80;

export const TICK_RATE = 30;               // 서버 시뮬레이션 Hz (입력 1개 = 1틱)
export const TICK_MS = 1000 / TICK_RATE;
export const SNAPSHOT_RATE = 15;           // 위치 스냅샷 전송 Hz
export const INTERP_DELAY_MS = 120;        // 다른 플레이어 보간 지연

export const PLAYER_RADIUS = 14;           // 발 기준 충돌 원 반지름(px)
export const BASE_SPEED = 2.5 * UNIT;      // 원작 기본 속도 1x ≈ 2.5 유닛/초 → px/s
export const USE_RANGE = 1.3 * UNIT;       // 미션·콘솔 사용 거리
export const REPORT_RANGE = 1.3 * UNIT;    // 시체 신고 거리
export const VENT_RANGE = 1.0 * UNIT;

/** 원작 킬 거리: 짧음 1.0 / 보통 1.8 / 김 2.5 유닛 */
export const KILL_DISTANCES = { short: 1.0 * UNIT, medium: 1.8 * UNIT, long: 2.5 * UNIT };

/** 시야 반지름(px) = 배율 × 기준값 */
export const VISION_BASE = 3.5 * UNIT;

export const MIN_PLAYERS = 4;              // 원작 최소 인원
export const MAX_PLAYERS = 15;             // 원작 최대 인원
export const ROOM_CODE_LENGTH = 6;         // 원작처럼 6글자 코드
export const NAME_MAX = 10;                // 원작 닉네임 최대 10자

/** 원작 기본 설정 (방장이 로비에서 일부 변경 가능) */
export const DEFAULT_SETTINGS = Object.freeze({
  impostors: 1,               // 1~3
  killCooldown: 25,           // 초 (원작 기본 25)
  killDistance: 'medium',
  emergencyMeetings: 1,       // 플레이어당
  emergencyCooldown: 15,      // 초
  discussionTime: 15,         // 초
  votingTime: 120,            // 초
  confirmEjects: true,
  playerSpeed: 1.0,
  crewVision: 1.0,
  impostorVision: 1.5,
  commonTasks: 1,
  longTasks: 1,
  shortTasks: 2,
  visualTasks: true,
  anonymousVotes: false,
  taskBarUpdates: 'always',   // always | meetings | never
});

/** 설정 허용 범위 (서버 검증용) */
export const SETTING_LIMITS = Object.freeze({
  impostors: [1, 3],
  killCooldown: [10, 60],
  emergencyMeetings: [0, 9],
  emergencyCooldown: [0, 60],
  discussionTime: [0, 120],
  votingTime: [15, 300],
  playerSpeed: [0.5, 3],
  crewVision: [0.25, 5],
  impostorVision: [0.25, 5],
  commonTasks: [0, 2],
  longTasks: [0, 3],
  shortTasks: [0, 5],
});

/** 인원별 최대 임포스터 수 (원작 규칙) */
export function maxImpostorsFor(playerCount) {
  if (playerCount <= 6) return 1;
  if (playerCount <= 8) return 2;
  return 3;
}

export const PHASES = Object.freeze({
  LOBBY: 'lobby',
  STARTING: 'starting',     // 역할 공개 연출
  PLAYING: 'playing',       // 이동·미션·킬
  DISCUSSION: 'discussion', // 회의 토론
  VOTING: 'voting',
  RESULT: 'result',         // 추방 연출
  ENDED: 'ended',
});

export const ROLES = Object.freeze({ CREWMATE: 'crewmate', IMPOSTOR: 'impostor' });

export const TIMINGS = Object.freeze({
  roleRevealMs: 5500,
  meetingIntroMs: 3000,     // "시체 발견/긴급 회의" 연출
  ejectMs: 7000,
  endScreenMs: 8000,
  firstKillCooldown: 10,    // 원작: 게임 시작 직후 킬 쿨다운 10초
  sabotageCooldown: 30,     // 사보타주 후 다음 사보타주까지 (원작 유사)
  doorCloseMs: 10000,       // 원작 스켈드 문 닫힘 10초
  doorCooldown: 30,         // 같은 방 문 재사보타주 대기
  reactorTime: 30,          // 원작 스켈드 원자로 붕괴 30초
  o2Time: 30,               // 원작 스켈드 산소 고갈 30초
  disconnectGraceLobbyMs: 15000,
  disconnectGraceGameMs: 45000,
});

/**
 * 원작 18색 (SkeldJS ColorData 의 하이라이트/그림자 RGB 수치 참고)
 * [이름, 본체, 그림자]
 */
export const COLORS = Object.freeze([
  ['Red', '#d71e22', '#7a0838'],
  ['Blue', '#1d3ce9', '#09158e'],
  ['Green', '#1b913e', '#0a4d2e'],
  ['Pink', '#ff63d4', '#ac2bae'],
  ['Orange', '#ff8d1c', '#b43e15'],
  ['Yellow', '#f6f657', '#c38822'],
  ['Black', '#4a565e', '#1e1f26'],
  ['White', '#e9f7ff', '#8495c0'],
  ['Purple', '#783dd2', '#3b177c'],
  ['Brown', '#80582d', '#5e2615'],
  ['Cyan', '#44fff7', '#24a9bf'],
  ['Lime', '#5bff4b', '#15a842'],
  ['Maroon', '#6c2b3d', '#410f1a'],
  ['Rose', '#ffd6ec', '#de92b3'],
  ['Banana', '#ffffbe', '#d2bc89'],
  ['Gray', '#8397a7', '#465664'],
  ['Tan', '#9f9989', '#51413e'],
  ['Coral', '#ec7578', '#b44362'],
]);
export const VISOR_COLOR = '#95cadc';
export const VISOR_SHADOW = '#435a68';

/** 사보타주 종류 */
export const SABOTAGES = Object.freeze({
  REACTOR: 'reactor',
  O2: 'o2',
  LIGHTS: 'lights',
  COMMS: 'comms',
});
export const CRITICAL_SABOTAGES = new Set([SABOTAGES.REACTOR, SABOTAGES.O2]);
