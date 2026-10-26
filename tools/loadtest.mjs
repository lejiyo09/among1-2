// 부하 테스트: 봇 여러 명이 방을 만들어 게임을 시작하고 계속 움직인다.
// 사용법: node tools/loadtest.mjs [서버주소] [방 수] [방당 인원] [초]
//   예) MIN_PLAYERS=4 npm start  (다른 터미널)  →  node tools/loadtest.mjs ws://localhost:3000/ws 20 10 30
import { WebSocket } from 'ws';

const [url = 'ws://localhost:3000/ws', ROOMS = '10', PER = '10', SECS = '30'] = process.argv.slice(2);
const rooms = Number(ROOMS), per = Number(PER), secs = Number(SECS);
let bytesIn = 0, msgsIn = 0, errors = 0, disconnects = 0;

function bot(name, onMsg) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const b = { ws, rid: 1, send: (m) => ws.readyState === 1 && ws.send(JSON.stringify(m)), id: null };
    ws.on('open', () => resolve(b));
    ws.on('error', reject);
    ws.on('close', () => { disconnects++; });
    ws.on('message', (d) => {
      bytesIn += d.length; msgsIn++;
      const m = JSON.parse(d);
      if (m.t === 'error' || (m.t === 'ack' && !m.ok)) errors++;
      onMsg?.(b, m);
    });
  });
}

async function room(r) {
  const bots = [];
  let code;
  const host = await bot(`H${r}`, (b, m) => { if (m.t === 'joined') { code = m.code; b.id = m.playerId; } });
  host.send({ t: 'create', name: `H${r}` });
  while (!code) await new Promise((x) => setTimeout(x, 20));
  bots.push(host);
  for (let i = 1; i < per; i++) {
    const b = await bot(`B${r}_${i}`);
    b.send({ t: 'join', code, name: `B${r}_${i}` });
    b.send({ t: 'ready', ready: true });
    bots.push(b);
  }
  await new Promise((x) => setTimeout(x, 300));
  host.send({ t: 'start' });
  return bots;
}

const all = (await Promise.all(Array.from({ length: rooms }, (_, r) => room(r)))).flat();
console.log(`${rooms} rooms × ${per} bots = ${all.length} connections; moving for ${secs}s`);
// 봇: 66ms 마다 같은 방향 2틱 입력 (실제 클라이언트와 같은 빈도)
const seqs = new Map(all.map((b) => [b, 0]));
const dirs = new Map(all.map((b) => [b, Math.floor(Math.random() * 16)]));
const iv = setInterval(() => {
  for (const b of all) {
    if (Math.random() < 0.05) dirs.set(b, Math.floor(Math.random() * 16));
    const s = seqs.get(b);
    b.send({ t: 'input', seq: s, d: [dirs.get(b), dirs.get(b)] });
    seqs.set(b, s + 2);
  }
}, 66);
const health = url.replace(/^ws/, 'http').replace(/\/ws$/, '/healthz');
const t0 = Date.now();
const startBytes = bytesIn;
const poll = setInterval(async () => {
  const h = await fetch(health).then((r) => r.json()).catch(() => null);
  console.log(`t=${((Date.now() - t0) / 1000).toFixed(0)}s server=${JSON.stringify(h)}`);
}, 5000);
await new Promise((x) => setTimeout(x, secs * 1000));
clearInterval(iv); clearInterval(poll);
const kbps = ((bytesIn - startBytes) / secs / all.length / 1024).toFixed(1);
console.log(`download per client ≈ ${kbps} KB/s, messages in ${msgsIn}, errors ${errors}, unexpected disconnects ${disconnects}`);
for (const b of all) b.ws.close();
setTimeout(() => process.exit(0), 300);
