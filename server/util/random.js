// 서버 전용 난수. 역할 배정·방 코드·토큰은 예측할 수 없어야 하므로 crypto 를 쓴다.
import crypto from 'node:crypto';

export function randInt(n) {
  return crypto.randomInt(n);
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(list) {
  return list[crypto.randomInt(list.length)];
}

/** 원작처럼 영문 대문자 6글자 방 코드 */
export function roomCode(length) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < length; i++) s += letters[crypto.randomInt(letters.length)];
  return s;
}

/** 재접속 토큰 (128비트, hex 32자) */
export function token() {
  return crypto.randomBytes(16).toString('hex');
}
