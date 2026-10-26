// 순수 함수로 분리한 게임 규칙 (단위 테스트 대상)
import { ROLES, maxImpostorsFor } from '../../shared/constants.js';
import { shuffle } from '../util/random.js';

/**
 * 역할 무작위 배정
 * @param {string[]} playerIds
 * @param {number} requested 설정상 임포스터 수
 * @returns {Map<string,string>} id → role
 */
export function assignRoles(playerIds, requested, shuffleFn = shuffle) {
  const count = Math.max(1, Math.min(requested, maxImpostorsFor(playerIds.length), playerIds.length - 1));
  const order = shuffleFn(playerIds);
  const roles = new Map();
  order.forEach((id, i) => roles.set(id, i < count ? ROLES.IMPOSTOR : ROLES.CREWMATE));
  return roles;
}

/**
 * 투표 집계 (원작 규칙)
 * - 최다 득표자가 1명이면 추방
 * - 동점이거나 "건너뛰기"가 최다(또는 동률)이면 아무도 추방하지 않음
 * - 투표하지 않은 사람은 집계에서 빠진다
 * @param {Map<string,string>} votes voterId → targetId | 'skip'
 * @returns {{ejectedId:string|null, tie:boolean, counts:Record<string,number>, skipped:boolean}}
 */
export function tallyVotes(votes) {
  /** @type {Record<string,number>} */
  const counts = {};
  for (const target of votes.values()) counts[target] = (counts[target] ?? 0) + 1;
  let max = 0;
  let leaders = [];
  for (const [target, n] of Object.entries(counts)) {
    if (n > max) { max = n; leaders = [target]; } else if (n === max) leaders.push(target);
  }
  if (leaders.length !== 1) return { ejectedId: null, tie: leaders.length > 1, counts, skipped: false };
  if (leaders[0] === 'skip') return { ejectedId: null, tie: false, counts, skipped: true };
  return { ejectedId: leaders[0], tie: false, counts, skipped: false };
}

/**
 * 승리 판정
 * @param {{role:string, alive:boolean, removed:boolean}[]} players 게임 참가자
 * @param {{done:number,total:number}} taskProgress 승무원 미션 진행
 * @returns {{winner:'crew'|'impostor', reason:string}|null}
 */
export function checkWin(players, taskProgress) {
  const inGame = players.filter((p) => !p.removed);
  const aliveImp = inGame.filter((p) => p.alive && p.role === ROLES.IMPOSTOR).length;
  const aliveCrew = inGame.filter((p) => p.alive && p.role === ROLES.CREWMATE).length;
  if (aliveImp === 0) return { winner: 'crew', reason: 'impostors_eliminated' };
  if (aliveImp >= aliveCrew) return { winner: 'impostor', reason: 'crew_outnumbered' };
  if (taskProgress.total > 0 && taskProgress.done >= taskProgress.total) return { winner: 'crew', reason: 'tasks' };
  return null;
}
