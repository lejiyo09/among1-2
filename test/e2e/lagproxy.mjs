// 지연/지터/일시 정지(패킷 손실 후 재전송 흉내)를 넣는 프록시: :3200 → :3000 (UPSTREAM 으로 변경)
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
const UP = process.env.UPSTREAM || 'localhost:3000';
const MIN = Number(process.env.LAG_MIN ?? 60), MAX = Number(process.env.LAG_MAX ?? 180), STALL = Number(process.env.STALL ?? 0.01);
const server = http.createServer((req, res) => {
  const up = http.request({ host: 'localhost', port: Number(UP.split(':')[1]), path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  req.pipe(up);
});
const wss = new WebSocketServer({ server, path: '/ws' });
function delayed(send) {
  let last = 0; // 순서 보장 (TCP 처럼)
  return (data) => {
    let d = MIN + Math.random() * (MAX - MIN);
    if (Math.random() < STALL) d += 600;
    const at = Math.max(Date.now() + d, last + 1);
    last = at;
    setTimeout(() => send(data), at - Date.now());
  };
}
wss.on('connection', (client, req) => {
  const up = new WebSocket(`ws://${UP}/ws`, { headers: { origin: `http://${UP}` } });
  const toUp = delayed((d) => up.readyState === 1 && up.send(d));
  const toClient = delayed((d) => client.readyState === 1 && client.send(d));
  const pending = [];
  up.on('open', () => { for (const d of pending) toUp(d); pending.length = 0; });
  client.on('message', (d) => { const s = d.toString(); if (up.readyState === 1) toUp(s); else pending.push(s); });
  up.on('message', (d) => toClient(d.toString()));
  client.on('close', () => up.close());
  up.on('close', () => client.close());
});
server.listen(3200, () => console.log('lag proxy on 3200', MIN, MAX, STALL));
