// 관리실 지도 / 보안실 CCTV: 위치 비공개 원칙을 지키면서 원작 기능
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERR } from '../shared/protocol.js';
import { CAM_RADIUS } from '../shared/constants.js';
import { setupRoom, startGame, teleport, map } from './helpers.js';

test('관리실 지도: 탁자 앞에서만, 방별 인원 수만 보낸다', () => {
  const ctx = setupRoom(4);
  const { crew } = startGame(ctx);
  const [a, b] = crew;
  assert.equal(ctx.room.handle(a, { t: 'admin' }), ERR.OUT_OF_RANGE);
  teleport(a, map.adminTable.x, map.adminTable.y + 60);
  const elec = map.rooms.find((r) => r.name === 'Electrical').rect;
  teleport(b, (elec[0] + elec[2]) / 2, (elec[1] + elec[3]) / 2 + 60);
  a.conn.clear();
  assert.equal(ctx.room.handle(a, { t: 'admin' }), null);
  const m = a.conn.last((x) => x.t === 'adminMap');
  assert.ok(m);
  assert.equal(m.rooms.Electrical, 1);
  assert.ok(m.rooms.Admin >= 1);
  assert.ok(!JSON.stringify(m).includes(b.id), '누가 있는지는 보내지 않는다');
  // 통신 방해 중에는 쓸 수 없다
  ctx.room.sabotage.active = { kind: 'comms', target: 0, dial: 180 };
  assert.equal(ctx.room.handle(a, { t: 'admin' }), ERR.COMMS_DOWN);
});

test('CCTV: 보는 동안만 카메라에 비친 사람을 보내고, 그동안 움직일 수 없다', () => {
  const ctx = setupRoom(4);
  const { crew } = startGame(ctx);
  const [a, b] = crew;
  const cam = map.cameras[0];
  teleport(b, cam.vx, cam.vy);
  teleport(a, map.camsConsole.x, map.camsConsole.y + 50);
  assert.equal(ctx.room.canSee(a, b), false, '평소에는 시야 밖');
  assert.equal(ctx.room.handle(a, { t: 'cams', on: true }), null);
  assert.equal(ctx.room.canSee(a, b), true, '카메라에 비치면 보인다');
  teleport(b, cam.vx + CAM_RADIUS * 3, cam.vy);
  assert.equal(ctx.room.canSee(a, b) && !map.cameras.some((c) => Math.hypot(b.x - c.vx, b.y - c.vy) <= CAM_RADIUS), false);
  assert.equal(ctx.room.canMove(a), false);
  assert.equal(ctx.room.stateFor(b).camsInUse, true, '모두에게 카메라 불빛');
  assert.equal(ctx.room.handle(a, { t: 'taskStart', taskId: a.tasks[0].defId }), ERR.NOT_ALLOWED);
  assert.equal(ctx.room.handle(a, { t: 'cams', on: false }), null);
  assert.equal(ctx.room.canMove(a), true);
  assert.equal(ctx.room.stateFor(b).camsInUse, false);
  // 멀리서는 켤 수 없다
  teleport(a, cam.vx, cam.vy);
  assert.equal(ctx.room.handle(a, { t: 'cams', on: true }), ERR.OUT_OF_RANGE);
});
