// Phaser 장면: 맵, 캐릭터, 시체, 벤트, 문, 시야 가림, 입력, 상호작용 대상 계산
import { ensurePhaserTexture } from './recolor.js';
import { visibilityPolygon } from './vision.js';
import { dirFromKeys, dirFromVector, DIR_NONE } from '../../shared/movement.js';
import {
  PHASES, ROLES, USE_RANGE, REPORT_RANGE, VENT_RANGE, KILL_DISTANCES, VISION_BASE,
} from '../../shared/constants.js';
import { play } from '../audio.js';

const SPRITE_SCALE = 0.78;
const VIEW_HEIGHT = 620;       // 화면 세로에 보이는 월드 높이(px). 원작처럼 식당 하나가 화면에 들어오는 정도
const BODY_CENTER = 28;        // 발 기준 몸 중심 높이 (시야 원점)

export class GameScene extends Phaser.Scene {
  constructor(ctx) {
    super({ key: 'game' });
    /** @type {{store:import('../store.js').Store, net:any, hud:any}} */
    this.ctx = ctx;
    this.crews = new Map();
    this.bodySprites = new Map();
    this.joystick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.targets = {};
    this.stepTimer = 0;
  }

  preload() {
    this.load.image('map', 'assets/map/skeld.png');
    this.load.image('ventgrate', 'assets/ui/ventgrate.png');
    this.load.image('door_v', 'assets/ui/door_v.png');
    this.load.image('door_h', 'assets/ui/door_h.png');
  }

  create() {
    const { store } = this.ctx;
    const map = store.map;
    this.add.image(0, 0, 'map').setOrigin(0, 0).setDepth(-10);

    // 벤트 (맵 그림에 없어서 원작 스프라이트로 그린다)
    for (const v of map.vents) this.add.image(v.x, v.y, 'ventgrate').setScale(1.1).setDepth(-5);

    // 문
    this.doorSprites = new Map();
    for (const d of map.doors) {
      const [x0, y0, x1, y1] = d.rect;
      const vertical = y1 - y0 > x1 - x0;
      const img = this.add.image((x0 + x1) / 2, (y0 + y1) / 2, vertical ? 'door_v' : 'door_h').setDepth(y1);
      if (vertical) img.setDisplaySize(x1 - x0 + 6, y1 - y0 + 50).setY((y0 + y1) / 2 - 25);
      else img.setDisplaySize(x1 - x0 + 10, 70).setY(y0 - 15);
      img.setVisible(false);
      this.doorSprites.set(d.id, img);
    }

    // 미션 위치 표시 (내 미션의 현재 단계만)
    this.taskMarkers = this.add.graphics().setDepth(5);

    // 시체와 캐릭터는 한 컨테이너에 넣어 시야 마스크를 한 번만 적용한다
    this.actors = this.add.container(0, 0).setDepth(10);
    this.bodyLayer = this.add.container(0, 0);
    this.crewLayer = this.add.container(0, 0);
    this.actors.add([this.bodyLayer, this.crewLayer]);

    // 시야: 카메라 화면 크기의 렌더 텍스처를 어둡게 칠한 뒤 시야 다각형만큼 지운다.
    // 시야 밖 캐릭터·시체는 아래 isVisible() 로 직접 숨긴다 (서버도 시야 밖 위치는 보내지 않는다)
    this.fog = this.add.graphics().setDepth(1000);
    this.visionPoly = null;

    this.cameras.main.setBackgroundColor('#000000');
    this.resize();
    this.scale.on('resize', () => this.resize());

    // 키보드
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.input.keyboard.disableGlobalCapture();

    // 터치 조이스틱: 화면 왼쪽 절반을 끌면 이동
    this.joyGfx = this.add.graphics().setScrollFactor(0).setDepth(2000);
    this.input.on('pointerdown', (p) => {
      if (p.pointerType !== 'touch' && !p.wasTouch) return;
      if (p.x > this.scale.width * 0.5) return;
      Object.assign(this.joystick, { active: true, id: p.id, ox: p.x, oy: p.y, x: p.x, y: p.y });
    });
    this.input.on('pointermove', (p) => {
      if (this.joystick.active && p.id === this.joystick.id) { this.joystick.x = p.x; this.joystick.y = p.y; }
    });
    const end = (p) => { if (p.id === this.joystick.id) this.joystick.active = false; };
    this.input.on('pointerup', end);
    this.input.on('pointerupoutside', end);
  }

  resize() {
    const cam = this.cameras.main;
    const h = this.scale.height, w = this.scale.width;
    // 가로 화면: 세로 620px 이 보이게. 세로(휴대폰) 화면: 시야 원(지름 약 560px)이 가로에 들어오게
    cam.setZoom(Math.max(0.45, Math.min(2.2, Math.min(h / VIEW_HEIGHT, w / 600))));
  }

  // ------------------------------------------------------------------ 입력
  inputDir() {
    // 자동 테스트용 입력 주입 (평소에는 사용되지 않음)
    if (typeof window.__inputOverride === 'function') { const d = window.__inputOverride(); if (d !== undefined) return d; }
    if (this.ctx.hud?.typing?.()) return DIR_NONE;
    const k = this.keys;
    const kb = dirFromKeys(k.A.isDown || k.LEFT.isDown, k.D.isDown || k.RIGHT.isDown, k.W.isDown || k.UP.isDown, k.S.isDown || k.DOWN.isDown);
    if (kb !== DIR_NONE) return kb;
    const j = this.joystick;
    if (j.active) {
      const dx = j.x - j.ox, dy = j.y - j.oy;
      if (Math.hypot(dx, dy) > 12) return dirFromVector(dx, dy);
    }
    return DIR_NONE;
  }

  drawJoystick() {
    const g = this.joyGfx;
    g.clear();
    const j = this.joystick;
    if (!j.active) return;
    const dx = j.x - j.ox, dy = j.y - j.oy;
    const len = Math.min(60, Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx);
    g.fillStyle(0xffffff, 0.15).fillCircle(j.ox, j.oy, 70);
    g.lineStyle(3, 0xffffff, 0.4).strokeCircle(j.ox, j.oy, 70);
    g.fillStyle(0xffffff, 0.5).fillCircle(j.ox + Math.cos(a) * len, j.oy + Math.sin(a) * len, 28);
  }

  // ------------------------------------------------------------------ 캐릭터
  crewFor(id, color) {
    let c = this.crews.get(id);
    if (c && c.color !== color) { c.container.destroy(); this.crews.delete(id); c = null; }
    if (c) return c;
    const key = ensurePhaserTexture(this, color);
    this.ensureAnims(key);
    const sprite = this.add.sprite(0, 0, key, 'idle').setOrigin(0.5, 0.9).setScale(SPRITE_SCALE);
    const label = this.add.text(0, -96, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 1);
    const container = this.add.container(0, 0, [sprite, label]);
    this.crewLayer.add(container);
    c = { id, color, key, sprite, label, container, anim: '' };
    this.crews.set(id, c);
    return c;
  }

  ensureAnims(key) {
    if (this.anims.exists(`${key}_walk`)) return;
    this.anims.create({ key: `${key}_walk`, frames: Array.from({ length: 12 }, (_, i) => ({ key, frame: `walk${i + 1}` })), frameRate: 24, repeat: -1 });
    this.anims.create({ key: `${key}_ghost`, frames: Array.from({ length: 48 }, (_, i) => ({ key, frame: `ghost${i + 1}` })), frameRate: 24, repeat: -1 });
    this.anims.create({ key: `${key}_die`, frames: Array.from({ length: 42 }, (_, i) => ({ key, frame: `dead${i + 1}` })), frameRate: 24, repeat: 0 });
    this.anims.create({ key: `${key}_vent`, frames: Array.from({ length: 7 }, (_, i) => ({ key, frame: `vent${i + 1}` })), frameRate: 20, repeat: 0 });
  }

  /** flags: 1 왼쪽, 2 이동 중, 4 유령, 8 스캔 중 */
  drawCrew(c, x, y, flags, name, nameColor) {
    c.container.setPosition(x, y);
    c.sprite.setFlipX(!!(flags & 1));
    const ghost = !!(flags & 4);
    const want = ghost ? 'ghost' : flags & 2 ? 'walk' : 'idle';
    if (want !== c.anim) {
      c.anim = want;
      if (want === 'idle') { c.sprite.stop(); c.sprite.setFrame('idle'); } else c.sprite.play(`${c.key}_${want}`);
    }
    c.sprite.setAlpha(ghost ? 0.55 : 1);
    c.label.setText(name);
    c.label.setColor(nameColor);
    c.label.setAlpha(ghost ? 0.6 : 1);
    if (flags & 8) {
      // 원작 의무실 스캔: 초록 스캔 빛
      c.scanFx ??= this.add.ellipse(0, -40, 70, 14, 0x3cff7a, 0.35);
      if (!c.container.list.includes(c.scanFx)) c.container.addAt(c.scanFx, 0);
      c.scanFx.y = -40 + Math.sin(this.time.now / 200) * 38;
      c.scanFx.setVisible(true);
    } else if (c.scanFx) c.scanFx.setVisible(false);
  }

  // ------------------------------------------------------------------ 매 프레임
  update(_time, delta) {
    const { store } = this.ctx;
    const st = store.state;
    const dir = this.inputDir();
    this.drawJoystick();
    if (!st || !store.playerId) {
      for (const c of this.crews.values()) c.container.setVisible(false);
      return;
    }
    store.update(delta, dir);
    store.advanceRenderClock(delta);
    const me = store.player(store.playerId);
    const you = store.you;
    const ghostView = !!you && !you.alive && st.phase !== PHASES.LOBBY;
    const myFlags = (store.me.facing < 0 ? 1 : 0) | (store.me.moving ? 2 : 0) | (ghostView ? 4 : 0) | (store.me.flags & 8);
    const impostors = new Set(st.impostors ?? []);
    const nameColor = (id) => (store.isImpostor && impostors.has(id) ? '#ff2a2a' : '#ffffff');

    // 카메라와 시야 (캐릭터 표시 여부 판단에 쓰므로 먼저 계산)
    this.cameras.main.centerOn(store.render.x, store.render.y - BODY_CENTER);
    this.cameras.main.preRender();
    this.updateVision(st, ghostView);

    // 내 캐릭터
    const seen = new Set();
    if (me && !(store.me.flags & 16)) {
      const c = this.crewFor(me.id, me.color);
      c.container.setVisible(true);
      this.drawCrew(c, store.render.x, store.render.y, myFlags, me.name, nameColor(me.id));
      seen.add(me.id);
    }
    // 다른 플레이어
    for (const [id] of store.remotes) {
      const info = store.player(id);
      const pos = store.remotePos(id);
      if (!info || !pos) continue;
      if (!this.isVisible(pos.x, pos.y)) continue;
      const c = this.crewFor(id, info.color);
      c.container.setVisible(true);
      this.drawCrew(c, pos.x, pos.y, pos.f, info.name, nameColor(id));
      seen.add(id);
    }
    for (const [id, c] of this.crews) if (!seen.has(id)) c.container.setVisible(false);
    // 컨테이너 안에서는 depth 가 아니라 순서로 그려지므로 y 기준으로 정렬 (아래쪽이 앞)
    this.crewLayer.sort('y');

    // 시체
    for (const [id, b] of store.bodies) {
      if (this.bodySprites.has(id)) continue;
      const key = ensurePhaserTexture(this, b.color);
      this.ensureAnims(key);
      const s = this.add.sprite(b.x, b.y, key, 'dead42').setOrigin(0.5, 0.75).setScale(SPRITE_SCALE);
      this.bodyLayer.add(s);
      this.bodySprites.set(id, s);
    }
    for (const [id, s] of this.bodySprites) {
      if (!store.bodies.has(id)) { s.destroy(); this.bodySprites.delete(id); continue; }
      s.setVisible(this.isVisible(s.x, s.y));
    }

    // 문
    const closed = new Set(st.sabotage?.doorsClosed ?? []);
    for (const [id, img] of this.doorSprites) img.setVisible(closed.has(id));


    // 미션 표시와 상호작용 대상
    this.drawTaskMarkers(st);
    this.targets = this.computeTargets(st);
    this.ctx.hud?.setTargets(this.targets);

    // 발소리
    if (store.me.moving && !ghostView) {
      this.stepTimer -= delta;
      if (this.stepTimer <= 0) { play(`step${1 + Math.floor(Math.random() * 4)}`, { vol: 0.25 }); this.stepTimer = 330; }
    } else this.stepTimer = 0;
  }

  updateVision(st, ghostView) {
    const { store } = this.ctx;
    const inGame = st.phase !== PHASES.LOBBY && st.phase !== PHASES.ENDED;
    if (!inGame || ghostView || st.phase === PHASES.STARTING) {
      this.fog.setVisible(false);
      this.visionPoly = null;
      return;
    }
    const settings = st.settings;
    let radius = VISION_BASE * (store.isImpostor ? settings.impostorVision : settings.crewVision);
    if (!store.isImpostor && st.sabotage?.active?.kind === 'lights') radius = Math.max(VISION_BASE * 0.25, radius * 0.25);
    this.visionRadius = radius;
    const cx = store.render.x, cy = store.render.y - BODY_CENTER;
    const poly = visibilityPolygon(store.world, cx, cy, radius);
    this.visionPoly = poly;

    // 다각형 바깥(시야 밖)만 어둡게: 각 광선 끝점과 멀리 연장한 점으로 사각형을 채운다
    const g = this.fog;
    g.clear();
    g.fillStyle(0x000000, 0.74);
    const FAR = 4000;
    const far = poly.map((p) => {
      const dx = p.x - cx, dy = p.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      return { x: cx + (dx / len) * FAR, y: cy + (dy / len) * FAR };
    });
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      g.fillTriangle(poly[i].x, poly[i].y, poly[j].x, poly[j].y, far[j].x, far[j].y);
      g.fillTriangle(poly[i].x, poly[i].y, far[j].x, far[j].y, far[i].x, far[i].y);
    }
    this.fog.setVisible(true);
  }

  /** 시야 다각형 안에 있는가 (발 위치 또는 몸 중심) */
  isVisible(x, y) {
    const poly = this.visionPoly;
    if (!poly) return true;
    return pointInPoly(poly, x, y) || pointInPoly(poly, x, y - BODY_CENTER);
  }

  drawTaskMarkers(st) {
    const g = this.taskMarkers;
    g.clear();
    const you = st.you;
    if (!you?.tasks || st.phase !== PHASES.PLAYING || you.fake) return;
    const t = this.time.now / 400;
    for (const task of you.tasks) {
      if (task.done || !task.spot) continue;
      const spot = this.ctx.store.map.tasks.find((s) => s.id === task.spot);
      if (!spot) continue;
      g.lineStyle(4, 0xffe14d, 0.6 + Math.sin(t) * 0.3).strokeCircle(spot.x, spot.y, 22 + Math.sin(t) * 3);
      g.fillStyle(0xffe14d, 0.25).fillCircle(spot.x, spot.y, 18);
    }
  }

  /** 지금 누를 수 있는 행동들 (HUD 버튼 활성화) */
  computeTargets(st) {
    const { store } = this.ctx;
    const map = store.map;
    const me = store.me;
    const you = st.you;
    const out = { use: null, report: null, kill: null, vent: null, ventLinks: [] };
    if (st.phase !== PHASES.PLAYING || !you) return out;
    const near = (x, y, r) => Math.hypot(me.x - x, me.y - y) <= r * 0.95;

    if (you.inVent) {
      const v = map.vents.find((x) => x.id === you.inVent);
      out.vent = { kind: 'exit', vent: v };
      out.ventLinks = v ? v.links.map((id) => map.vents.find((x) => x.id === id)) : [];
      return out;
    }
    // 사보타주 수리 지점
    const sab = st.sabotage?.active;
    if (sab && you.alive) {
      const con = map.consoles.find((c) => c.sabotage === sab.kind && near(c.x, c.y, USE_RANGE));
      if (con) out.use = { kind: 'fix', console: con };
    }
    // 내 미션
    if (!out.use && you.tasks && you.role === ROLES.CREWMATE) {
      for (const t of you.tasks) {
        if (t.done || !t.spot) continue;
        const spot = map.tasks.find((s) => s.id === t.spot);
        if (spot && near(spot.x, spot.y, USE_RANGE)) { out.use = { kind: 'task', task: t, spot }; break; }
      }
    }
    // 비상 버튼
    const e = map.emergency;
    if (!out.use && you.alive && near(e.x, e.y, e.range)) out.use = { kind: 'emergency' };

    if (you.alive) {
      // 시체 신고
      for (const b of store.bodies.values()) {
        if (near(b.x, b.y, REPORT_RANGE) && !store.world.lineBlocked(me.x, me.y, b.x, b.y)) { out.report = b; break; }
      }
      if (you.role === ROLES.IMPOSTOR) {
        const impostors = new Set(st.impostors ?? []);
        const range = KILL_DISTANCES[st.settings.killDistance];
        let best = null;
        for (const [id] of store.remotes) {
          const info = store.player(id);
          const pos = store.remotes.get(id);
          if (!info || info.dead || impostors.has(id) || pos.f & 4) continue;
          const d = Math.hypot(me.x - pos.x, me.y - pos.y);
          if (d <= range && (!best || d < best.d) && !store.world.lineBlocked(me.x, me.y, pos.x, pos.y)) best = { id, d };
        }
        out.kill = best;
        const vent = map.vents.find((v) => near(v.x, v.y, VENT_RANGE));
        if (vent) out.vent = { kind: 'enter', vent };
      }
    }
    return out;
  }

  /** 킬 대상 강조 (빨간 외곽선 대신 이름표 강조) */
  highlight(id) {
    for (const [cid, c] of this.crews) c.sprite.setTint(cid === id ? 0xffb0b0 : 0xffffff);
  }
}

function pointInPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
