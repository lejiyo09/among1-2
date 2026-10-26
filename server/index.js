// 게임 서버 진입점: 정적 파일(HTTP) + 실시간 통신(WebSocket, 경로 /ws)을 한 프로세스에서 제공한다.
// Render 같은 호스팅에서는 PORT 환경 변수만 있으면 동작한다. HTTPS 사이트에서는 자동으로 wss:// 로 연결된다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadMap } from './mapLoader.js';
import { RoomManager } from './RoomManager.js';
import { Connection } from './net/Connection.js';
import { parseClientMessage, ERR, MAX_MESSAGE_BYTES } from '../shared/protocol.js';
import { MIN_PLAYERS } from '../shared/constants.js';
import { log } from './util/log.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  // 비워 두면 같은 출처(게임 페이지를 받은 그 서버)에서 온 WebSocket만 허용한다.
  // 프런트를 다른 곳(예: GitHub Pages)에 따로 올릴 때만 "https://a.github.io,https://b.com" 처럼 지정한다. "*" 는 전부 허용.
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  maxRooms: Number(process.env.MAX_ROOMS ?? 100),
  maxConnections: Number(process.env.MAX_CONNECTIONS ?? 600),
  maxConnectionsPerIp: Number(process.env.MAX_CONNECTIONS_PER_IP ?? 60),
  // 원작 최소 인원은 4명. 혼자/둘이 테스트할 때만 낮춘다.
  minPlayers: Math.max(2, Number(process.env.MIN_PLAYERS ?? MIN_PLAYERS)),
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.tmj': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.md': 'text/plain; charset=utf-8',
};

/** URL 경로 → 디스크 경로. 허용된 폴더 밖은 null (경로 조작 방지) */
function resolveStatic(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (p === '/' || p === '') p = '/index.html';
  if (p === '/vendor/phaser.min.js') return path.join(root, 'node_modules/phaser/dist/phaser.min.js');
  const [base, rel] = p.startsWith('/shared/') ? ['shared', p.slice('/shared/'.length)] : ['client', p.slice(1)];
  const dir = path.join(root, base);
  const full = path.normalize(path.join(dir, rel));
  if (!full.startsWith(dir + path.sep)) return null;
  return full;
}

export function createServer(manager) {
  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, uptime: Math.round(process.uptime()), ...manager.stats() }));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const file = resolveStatic(url);
    if (!file) { res.writeHead(400); res.end('bad path'); return; }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        'content-type': MIME[ext] ?? 'application/octet-stream',
        'content-length': st.size,
        // 코드 파일은 배포 즉시 반영되도록 재검증, 큰 에셋은 하루 캐시
        'cache-control': ['.png', '.ogg', '.wav', '.mp3', '.ttf', '.webp'].includes(ext) || file.endsWith('phaser.min.js') ? 'public, max-age=86400' : 'no-cache',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file).pipe(res);
    });
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });
  const perIp = new Map();

  server.on('upgrade', (req, socket, head) => {
    const reject = (code, text) => { socket.write(`HTTP/1.1 ${code} ${text}\r\n\r\n`); socket.destroy(); };
    if ((req.url ?? '').split('?')[0] !== '/ws') return reject(404, 'Not Found');
    const origin = req.headers.origin;
    if (!originAllowed(origin, req.headers.host)) { log.warn(`ws origin rejected: ${origin}`); return reject(403, 'Forbidden'); }
    const ip = clientIp(req);
    if (wss.clients.size >= config.maxConnections || (perIp.get(ip) ?? 0) >= config.maxConnectionsPerIp) return reject(503, 'Busy');
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, ip));
  });

  wss.on('connection', (ws, ip) => {
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    const conn = new Connection(ws, ip);
    ws.on('message', (data, isBinary) => {
      if (isBinary) { conn.send({ t: 'error', code: ERR.BAD_MESSAGE, message: 'binary not supported' }); return; }
      onMessage(manager, conn, data.toString());
    });
    ws.on('close', () => {
      const n = (perIp.get(ip) ?? 1) - 1;
      if (n <= 0) perIp.delete(ip); else perIp.set(ip, n);
      try { manager.onClose(conn); } catch (err) { log.error('onClose failed', err.stack); }
    });
    ws.on('error', (err) => log.warn(`ws error: ${err.message}`));
  });

  // 응답 없는 연결(와이파이 끊김 등) 감지: 15초마다 ping, 다음 주기까지 pong 이 없으면 종료
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) { ws.terminate(); return; }
      ws.isAlive = false;
      ws.ping();
    });
  }, 15_000);
  heartbeat.unref();
  wss.on('connection', (ws) => { ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; }); });
  server.on('close', () => clearInterval(heartbeat));

  return { server, wss };
}

function originAllowed(origin, host) {
  if (!origin) return true; // 브라우저가 아닌 클라이언트(테스트 도구)
  if (config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin)) return true;
  try { return new URL(origin).host === host; } catch { return false; }
}

function clientIp(req) {
  // Render 등 프록시 뒤에서는 x-forwarded-for 의 첫 번째 값이 실제 클라이언트
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
}

/** 메시지 하나 처리. 어떤 오류도 서버 전체를 멈추지 않게 한다. */
export function onMessage(manager, conn, raw) {
  if (!conn.takeToken()) {
    conn.send({ t: 'error', code: ERR.RATE_LIMITED });
    return;
  }
  const parsed = parseClientMessage(raw);
  if (!parsed.ok) {
    conn.send({ t: 'error', code: ERR.BAD_MESSAGE, message: parsed.error });
    return;
  }
  const msg = parsed.msg;
  if (msg.rid !== undefined && conn.rids.has(msg.rid)) {
    // 재전송된 요청: 다시 실행하지 않고 같은 결과만 돌려준다 (킬/투표 중복 처리 방지)
    conn.send(conn.rids.get(msg.rid));
    return;
  }
  let error;
  try {
    error = manager.handle(conn, msg);
  } catch (err) {
    log.error(`handler ${msg.t} failed`, err.stack);
    error = ERR.INTERNAL;
  }
  if (msg.rid !== undefined) {
    const reply = { t: 'ack', rid: msg.rid, ok: !error, ...(error ? { error } : {}) };
    conn.rememberRid(msg.rid, reply);
    conn.send(reply);
  } else if (error) {
    conn.send({ t: 'error', code: error, for: msg.t });
  }
}

// 직접 실행했을 때만 서버 시작 (테스트에서는 import 만 한다)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manager = new RoomManager({ map: loadMap('skeld'), maxRooms: config.maxRooms, minPlayers: config.minPlayers });
  manager.start();
  const { server } = createServer(manager);
  server.listen(config.port, config.host, () => {
    log.info(`Among Us web server on http://${config.host}:${config.port} (min players ${config.minPlayers})`);
  });
  const shutdown = (sig) => {
    // 서버가 꺼지면 진행 중인 모든 방은 사라진다(메모리 저장). 클라이언트는 재접속 실패 시 메뉴로 돌아간다.
    log.info(`${sig} received, shutting down`);
    manager.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
