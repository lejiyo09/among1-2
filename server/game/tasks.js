// 미션 배정과 서버 측 정답 검증
// 퍼즐형 미션(배선, 매니폴드, 원자로, 방어막, 전력 우회)은 서버가 문제를 만들고
// 클라이언트가 제출한 답을 서버가 다시 확인한다. 나머지는 최소 수행 시간과 거리로 검증한다.
import { TASK_DEFS, WIRE_COLORS, MANIFOLD_COUNT, SIMON_ROUNDS, SHIELD_COUNT, CARD_SWIPE_MS, ASTEROIDS_TARGET } from '../../shared/tasks.js';
import { shuffle, pick, randInt } from '../util/random.js';

const PICK_ROOM = { storage: 'Storage', upper: 'UpperEngine', lower: 'LowerEngine', admin: 'Admin', cafeteria: 'Cafeteria' };

/**
 * @typedef {{defId:string, spots:string[], step:number, done:boolean}} PlayerTask
 */

/** 한 미션의 단계별 지점을 정한다 */
export function buildTask(map, defId) {
  const def = TASK_DEFS[defId];
  const used = new Set();
  const spots = def.steps.map((step) => {
    let candidates = map.tasks.filter((t) => t.taskType === step.spotType);
    if (step.pick && step.pick !== 'random') candidates = candidates.filter((t) => t.room === PICK_ROOM[step.pick]);
    // 배선처럼 같은 종류를 여러 번 하는 미션은 다른 장소를 고른다
    const fresh = candidates.filter((t) => !used.has(t.id));
    const chosen = pick(fresh.length ? fresh : candidates);
    used.add(chosen.id);
    return chosen.id;
  });
  if (defId === 'wires') {
    // 원작: 전기실 배선이 항상 첫 단계는 아니지만 장소는 서로 달라야 한다
    return { defId, spots: shuffle(spots), step: 0, done: false };
  }
  return { defId, spots, step: 0, done: false };
}

/**
 * 게임 시작 시 미션 배정. 공통 미션은 모든 승무원이 같은 장소로 받는다(원작 규칙).
 * @returns {(playerId:string) => PlayerTask[]}
 */
export function createTaskAssigner(map, settings) {
  const byLength = (len) => Object.values(TASK_DEFS).filter((d) => d.length === len).map((d) => d.id);
  const common = shuffle(byLength('common')).slice(0, settings.commonTasks).map((id) => buildTask(map, id));
  return () => {
    const longs = shuffle(byLength('long')).slice(0, settings.longTasks);
    const shorts = shuffle(byLength('short')).slice(0, settings.shortTasks);
    return [
      ...common.map((t) => ({ ...t, spots: [...t.spots] })),
      ...longs.map((id) => buildTask(map, id)),
      ...shorts.map((id) => buildTask(map, id)),
    ];
  };
}

/** 퍼즐 문제 생성. 반환값은 그대로 클라이언트에 보낸다. */
export function makeChallenge(defId) {
  switch (defId) {
    case 'wires': return { left: shuffle(WIRE_COLORS), right: shuffle(WIRE_COLORS) };
    case 'manifolds': return { labels: shuffle(Array.from({ length: MANIFOLD_COUNT }, (_, i) => i + 1)) };
    case 'simon': return { seq: Array.from({ length: SIMON_ROUNDS }, () => randInt(9)) };
    case 'shields': {
      const off = shuffle(Array.from({ length: SHIELD_COUNT }, (_, i) => i)).slice(0, 3 + randInt(SHIELD_COUNT - 3));
      return { off: off.sort((a, b) => a - b) };
    }
    case 'divert': return { target: randInt(8) };
    case 'align': return { start: randInt(2) ? -0.6 - Math.random() * 0.3 : 0.6 + Math.random() * 0.3 };
    case 'calibrate': return { speeds: [1 + randInt(3), 1 + randInt(3), 1 + randInt(3)] };
    case 'steering': return { start: [Math.round((Math.random() * 2 - 1) * 80), Math.round((Math.random() * 2 - 1) * 80)] };
    default: return {};
  }
}

const isIntArray = (a, len) => Array.isArray(a) && a.length === len && a.every(Number.isInteger);

/** 클라이언트가 제출한 답 검증 */
export function validateAnswer(defId, challenge, answer) {
  switch (defId) {
    case 'wires': {
      // answer[i] = 왼쪽 i번 전선을 연결한 오른쪽 단자 번호
      if (!isIntArray(answer, 4) || new Set(answer).size !== 4) return false;
      return answer.every((r, i) => r >= 0 && r < 4 && challenge.right[r] === challenge.left[i]);
    }
    case 'manifolds':
      // answer = 누른 버튼 칸 번호 순서. 1부터 10까지 차례대로여야 한다
      return isIntArray(answer, MANIFOLD_COUNT) && answer.every((cell, k) => challenge.labels[cell] === k + 1);
    case 'simon':
      return isIntArray(answer, SIMON_ROUNDS) && answer.every((v, i) => v === challenge.seq[i]);
    case 'shields': {
      if (!Array.isArray(answer) || answer.length > 40 || !answer.every((i) => Number.isInteger(i) && i >= 0 && i < SHIELD_COUNT)) return false;
      const on = Array.from({ length: SHIELD_COUNT }, (_, i) => !challenge.off.includes(i));
      for (const i of answer) on[i] = !on[i];
      return on.every(Boolean);
    }
    case 'divert': return answer === challenge.target;
    case 'card': return typeof answer === 'number' && answer >= CARD_SWIPE_MS[0] && answer <= CARD_SWIPE_MS[1];
    case 'asteroids': return Number.isInteger(answer) && answer >= ASTEROIDS_TARGET && answer <= 200;
    case 'align': return typeof answer === 'number' && Math.abs(answer) <= 0.08;
    default: return true;
  }
}

/** 카드 긁기: 긁는 시간이 최소 수행 시간보다 길면 그만큼 더 기다려야 한다 */
export function minDurationFor(defId, answer) {
  const base = TASK_DEFS[defId].minMs;
  if (defId === 'card' && typeof answer === 'number') return Math.max(base, answer);
  return base;
}
