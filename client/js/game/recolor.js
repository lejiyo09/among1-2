// 원작 마스크 형식 스프라이트(빨강=몸, 파랑=그림자, 초록=바이저)를 플레이어 색으로 칠한다.
// 결과 = R×몸색 + B×그림자색 + G×바이저색 (원작 플레이어 셰이더와 같은 방식)
import { COLORS, VISOR_COLOR } from '../../shared/constants.js';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

let atlasImage = null;
let atlasData = null;
const canvases = new Map();
const iconCache = new Map();

export async function loadCrewAtlas() {
  if (atlasImage) return;
  const [img, data] = await Promise.all([
    new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'assets/sprites/crewmate.png'; }),
    fetch('assets/sprites/crewmate.json').then((r) => r.json()),
  ]);
  atlasImage = img;
  atlasData = data;
}

export function atlasFrames() {
  return atlasData.frames;
}

/** 색 번호 → 칠해진 아틀라스 캔버스 (캐시) */
export function coloredAtlas(color, { ghostAlpha = 1 } = {}) {
  const key = `${color}:${ghostAlpha}`;
  if (canvases.has(key)) return canvases.get(key);
  const c = document.createElement('canvas');
  c.width = atlasImage.width;
  c.height = atlasImage.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(atlasImage, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const [, bodyHex, shadowHex] = COLORS[color] ?? COLORS[0];
  const body = hex(bodyHex), shadow = hex(shadowHex), visor = hex(VISOR_COLOR);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    d[i] = Math.min(255, r * body[0] + b * shadow[0] + g * visor[0]);
    d[i + 1] = Math.min(255, r * body[1] + b * shadow[1] + g * visor[1]);
    d[i + 2] = Math.min(255, r * body[2] + b * shadow[2] + g * visor[2]);
    d[i + 3] *= ghostAlpha;
  }
  ctx.putImageData(img, 0, 0);
  canvases.set(key, c);
  return c;
}

/** DOM 용 아이콘 (data URL) */
export function crewIcon(color, frame = 'idle') {
  const key = `${color}:${frame}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const f = atlasData.frames[frame].frame;
  const c = document.createElement('canvas');
  c.width = f.w; c.height = f.h;
  c.getContext('2d').drawImage(coloredAtlas(color), f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

/** Phaser 텍스처로 등록: 키 crew_<color> */
export function ensurePhaserTexture(scene, color) {
  const key = `crew_${color}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.addCanvas(key, coloredAtlas(color));
  for (const [name, fr] of Object.entries(atlasData.frames)) tex.add(name, 0, fr.frame.x, fr.frame.y, fr.frame.w, fr.frame.h);
  return key;
}

export function colorName(color) {
  return COLORS[color]?.[0] ?? '?';
}
