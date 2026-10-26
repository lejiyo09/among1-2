// 실제 WebSocket 연결로 서버 전체를 검증한다
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createServer, config } from '../server/index.js';
import { RoomManager } from '../server/RoomManager.js';
import { map } from './helpers.js';

let server, wss, manager, url;

before(async () => {
  manager = new RoomManager({ map, minPlayers: 2 });
  manager.start();
  ({ server, wss } = createServer(manager));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `ws://127.0.0.1:${server.address().port}/ws`;
});

after(() => {
  manager.stop();
  for (const ws of wss.clients) ws.terminate();
  server.closeAllConnections?.();
  server.close();
});

/** 메시지를 기다릴 수 있는 테스트 클라이언트 */
function client(headers = {}) {
  const ws = new WebSocket(url, { headers });
  const msgs = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    const w = waiters.find((x) => x.pred(m));
    if (w) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); } else msgs.push(m);
  });
  const c = {
    ws, msgs,
    open: () => new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); }),
    send: (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)),
    wait: (pred, ms = 3000) => new Promise((resolve, reject) => {
      const found = msgs.find(pred);
      if (found) { msgs.splice(msgs.indexOf(found), 1); return resolve(found); }
      const w = { pred, resolve };
      waiters.push(w);
      setTimeout(() => { if (waiters.includes(w)) { waiters.splice(waiters.indexOf(w), 1); reject(new Error('timeout')); } }, ms);
    }),
    close: () => ws.close(),
  };
  return c;
}

test('방 생성 → 코드로 입장 → 상태 동기화', async () => {
  const a = client(); await a.open();
  a.send({ t: 'hello', v: 1 });
  await a.wait((m) => m.t === 'welcome');
  a.send({ t: 'create', name: 'Alice', color: 0, rid: 1 });
  const joined = await a.wait((m) => m.t === 'joined');
  assert.match(joined.code, /^[A-Z]{6}$/);
  assert.match(joined.token, /^[a-f0-9]{32}$/);
  await a.wait((m) => m.t === 'ack' && m.rid === 1 && m.ok);

  const b = client(); await b.open();
  b.send({ t: 'join', code: joined.code, name: 'Bob', color: 0, rid: 1 });
  const jb = await b.wait((m) => m.t === 'joined');
  assert.equal(jb.code, joined.code);
  const st = await a.wait((m) => m.t === 'state' && m.players.length === 2);
  const bob = st.players.find((p) => p.name === 'Bob');
  assert.notEqual(bob.color, 0, '이미 쓰는 색은 자동으로 다른 색');
  a.close(); b.close();
});

test('잘못된 방 코드, 잘못된 메시지, 서버는 계속 동작', async () => {
  const c = client(); await c.open();
  c.send({ t: 'join', code: 'ZZZZZZ', name: 'X', rid: 5 });
  const ack = await c.wait((m) => m.t === 'ack' && m.rid === 5);
  assert.equal(ack.error, 'ROOM_NOT_FOUND');
  c.send('{broken json');
  assert.equal((await c.wait((m) => m.t === 'error')).code, 'BAD_MESSAGE');
  c.send({ t: 'kill', targetId: 'p1' });
  assert.equal((await c.wait((m) => m.t === 'error')).code, 'NOT_IN_ROOM');
  c.send({ t: 'ping', ts: 123 });
  assert.equal((await c.wait((m) => m.t === 'pong')).ts, 123);
  c.close();
});

test('너무 큰 메시지는 연결을 끊고 서버는 살아 있다', async () => {
  const c = client(); await c.open();
  const closed = new Promise((r) => c.ws.once('close', r));
  c.send(JSON.stringify({ t: 'chat', text: 'x'.repeat(10_000) }));
  await closed;
  const d = client(); await d.open();
  d.send({ t: 'ping', ts: 1 });
  await d.wait((m) => m.t === 'pong');
  d.close();
});

test('같은 요청 ID 재전송은 한 번만 처리된다', async () => {
  const c = client(); await c.open();
  c.send({ t: 'create', name: 'Dup', rid: 77 });
  await c.wait((m) => m.t === 'joined');
  const first = await c.wait((m) => m.t === 'ack' && m.rid === 77);
  c.send({ t: 'create', name: 'Dup', rid: 77 });
  const second = await c.wait((m) => m.t === 'ack' && m.rid === 77);
  assert.deepEqual(second, first);
  assert.ok(!c.msgs.some((m) => m.t === 'joined'), '두 번째 방이 생기지 않음');
  c.close();
});

test('전송 빈도 제한', async () => {
  const c = client(); await c.open();
  for (let i = 0; i < 150; i++) c.send({ t: 'ping', ts: i });
  await c.wait((m) => m.t === 'error' && m.code === 'RATE_LIMITED');
  c.close();
});

test('연결이 끊겨도 토큰으로 재접속하면 같은 플레이어로 복원', async () => {
  const a = client(); await a.open();
  a.send({ t: 'create', name: 'Re' });
  const j = await a.wait((m) => m.t === 'joined');
  a.ws.terminate(); // 비정상 종료
  await new Promise((r) => setTimeout(r, 100));
  const room = manager.rooms.get(j.code);
  assert.equal(room.players.get(j.playerId).connected, false);
  const a2 = client(); await a2.open();
  a2.send({ t: 'resume', token: j.token, rid: 1 });
  const r = await a2.wait((m) => m.t === 'joined');
  assert.equal(r.playerId, j.playerId);
  assert.equal(r.resumed, true);
  assert.equal(room.players.get(j.playerId).connected, true);
  // 틀린 토큰
  const x = client(); await x.open();
  x.send({ t: 'resume', token: 'f'.repeat(32), rid: 2 });
  assert.equal((await x.wait((m) => m.t === 'ack')).error, 'SESSION_EXPIRED');
  // 정상 퇴장 후에는 토큰 무효
  a2.send({ t: 'leave' });
  await a2.wait((m) => m.t === 'left');
  x.send({ t: 'resume', token: j.token, rid: 3 });
  assert.equal((await x.wait((m) => m.t === 'ack' && m.rid === 3)).error, 'SESSION_EXPIRED');
  a2.close(); x.close();
});

test('다른 출처(Origin)의 WebSocket은 거부', async () => {
  const c = client({ origin: 'https://evil.example' });
  await assert.rejects(c.open());
  const ok = client({ origin: `http://127.0.0.1:${server.address().port}` });
  await ok.open();
  ok.close();
  assert.deepEqual(config.allowedOrigins, []);
});

test('방 격리: 다른 방의 채팅/상태를 받지 않는다', async () => {
  const a = client(); await a.open();
  const b = client(); await b.open();
  a.send({ t: 'create', name: 'RoomA' });
  b.send({ t: 'create', name: 'RoomB' });
  const ja = await a.wait((m) => m.t === 'joined');
  const jb = await b.wait((m) => m.t === 'joined');
  assert.notEqual(ja.code, jb.code);
  a.send({ t: 'chat', text: 'secret-a' });
  await a.wait((m) => m.kind === 'chat' && m.text === 'secret-a');
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(!b.msgs.some((m) => JSON.stringify(m).includes('secret-a') || JSON.stringify(m).includes('RoomA')));
  a.close(); b.close();
});

test('HTTP: 정적 파일, 헬스체크, 경로 조작 차단', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const h = await fetch(`${base}/healthz`).then((r) => r.json());
  assert.equal(h.ok, true);
  assert.equal((await fetch(`${base}/shared/constants.js`)).status, 200);
  assert.equal((await fetch(`${base}/vendor/phaser.min.js`, { method: 'HEAD' })).status, 200);
  assert.notEqual((await fetch(`${base}/shared/..%2f..%2fpackage.json`)).status, 200);
  assert.notEqual((await fetch(`${base}/..%2fserver/index.js`)).status, 200);
});
