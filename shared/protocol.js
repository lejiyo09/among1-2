// WebSocket 메시지 규격과 런타임 검증
// 모든 메시지는 JSON 객체이며 `t` 필드가 종류를 나타낸다.
// 클라이언트 → 서버 메시지는 서버가 이 스키마로 검증한 뒤에만 처리한다.
// 자세한 설명: docs/protocol.md

import { NAME_MAX, ROOM_CODE_LENGTH, COLORS } from './constants.js';
import { TASK_IDS } from './tasks.js';

export const MAX_MESSAGE_BYTES = 4096;
export const MAX_CHAT = 100;
export const MAX_INPUT_BATCH = 8;

/** 오류 코드 (서버 → 클라이언트 `error` 메시지의 code) */
export const ERR = Object.freeze({
  BAD_MESSAGE: 'BAD_MESSAGE',           // JSON 아님 / 스키마 불일치
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  GAME_IN_PROGRESS: 'GAME_IN_PROGRESS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  NOT_HOST: 'NOT_HOST',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  NOT_READY: 'NOT_READY',
  COLOR_TAKEN: 'COLOR_TAKEN',
  BAD_NAME: 'BAD_NAME',
  WRONG_PHASE: 'WRONG_PHASE',
  NOT_ALLOWED: 'NOT_ALLOWED',           // 역할/생존 상태상 불가
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  COOLDOWN: 'COOLDOWN',
  INVALID_TARGET: 'INVALID_TARGET',
  ALREADY_DONE: 'ALREADY_DONE',         // 이미 투표함 / 이미 완료한 미션
  TOO_FAST: 'TOO_FAST',
  WRONG_ANSWER: 'WRONG_ANSWER',
  SERVER_FULL: 'SERVER_FULL',
  INTERNAL: 'INTERNAL',
});

// ---- 아주 작은 스키마 검증기 -------------------------------------------------
const str = (min, max, re) => (v) => typeof v === 'string' && v.length >= min && v.length <= max && (!re || re.test(v));
const int = (min, max) => (v) => Number.isInteger(v) && v >= min && v <= max;
const num = (min, max) => (v) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const bool = () => (v) => typeof v === 'boolean';
const oneOf = (...vals) => (v) => vals.includes(v);
const arr = (item, max) => (v) => Array.isArray(v) && v.length <= max && v.every(item);
const opt = (f) => Object.assign((v) => v === undefined || f(v), { optional: true });
const obj = (shape) => (v) => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.entries(shape).every(([k, f]) => f(v[k]));
const any = () => () => true;

const ID = str(1, 32, /^[A-Za-z0-9_-]+$/);
const CODE = str(ROOM_CODE_LENGTH, ROOM_CODE_LENGTH, /^[A-Z]+$/);
const NAME = str(1, NAME_MAX * 2); // 정규화 전 길이. 서버가 다시 다듬는다.
const COLOR = int(0, COLORS.length - 1);
const RID = opt(int(0, 2 ** 31)); // 요청 ID (중복 처리 방지/응답 매칭)

/** 클라이언트 → 서버 메시지 스키마 */
export const C2S = {
  hello: { v: int(0, 1000) },
  create: { name: NAME, color: opt(COLOR), practice: opt(bool()), rid: RID },
  join: { code: CODE, name: NAME, color: opt(COLOR), rid: RID },
  resume: { token: str(32, 64, /^[a-f0-9]+$/), rid: RID },
  leave: { rid: RID },
  setColor: { color: COLOR, rid: RID },
  setSettings: { settings: obj({}), rid: RID },
  ready: { ready: bool(), rid: RID },
  start: { rid: RID },
  endPractice: { rid: RID }, // 연습 모드: 게임을 끝내고 대기실로
  kick: { playerId: ID, rid: RID },
  chat: { text: str(1, MAX_CHAT), rid: RID },
  input: { seq: int(0, 2 ** 31), d: arr(int(-1, 15), MAX_INPUT_BATCH) },
  taskStart: { taskId: oneOf(...TASK_IDS), rid: RID },
  taskComplete: { taskId: oneOf(...TASK_IDS), answer: opt(any()), rid: RID },
  taskCancel: { rid: RID },
  kill: { targetId: ID, rid: RID },
  report: { bodyId: ID, rid: RID },
  emergency: { rid: RID },
  vent: { action: oneOf('enter', 'exit', 'move'), to: opt(ID), rid: RID },
  sabotage: { kind: oneOf('reactor', 'o2', 'lights', 'comms', 'doors'), room: opt(ID), rid: RID },
  fix: { consoleId: ID, action: oneOf('hold', 'release', 'code', 'switch', 'dial'), value: opt(num(-1e6, 1e6)), rid: RID },
  vote: { target: ID, rid: RID }, // 플레이어 id 또는 'skip'
  ping: { ts: num(0, 1e15) },
};

/**
 * 원시 문자열을 파싱하고 검증한다.
 * @returns {{ok:true, msg:any} | {ok:false, error:string}}
 */
export function parseClientMessage(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return { ok: false, error: 'too large' };
  let msg;
  try { msg = JSON.parse(raw); } catch { return { ok: false, error: 'invalid json' }; }
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) return { ok: false, error: 'not an object' };
  const schema = Object.prototype.hasOwnProperty.call(C2S, msg.t) ? C2S[msg.t] : null;
  if (!schema) return { ok: false, error: `unknown type ${String(msg.t).slice(0, 20)}` };
  for (const key of Object.keys(msg)) {
    if (key !== 't' && !(key in schema)) return { ok: false, error: `unexpected field ${key.slice(0, 20)}` };
  }
  for (const [key, check] of Object.entries(schema)) {
    if (!check(msg[key])) return { ok: false, error: `invalid ${key}` };
  }
  return { ok: true, msg };
}

/** 닉네임 정리: 제어문자 제거, 공백 정리, 최대 길이 */
export function sanitizeName(name) {
  const cleaned = String(name).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  return [...cleaned].slice(0, NAME_MAX).join('');
}

export function sanitizeChat(text) {
  return String(text).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_CHAT);
}
