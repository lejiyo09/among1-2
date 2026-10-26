# 출처와 저작권

## 원작

**Among Us™** 와 그 캐릭터, 그래픽, 사운드는 **Innersloth LLC** 의 저작물이다.
이 저장소는 **비상업적 팬 제작물**이며 Innersloth 와 관계가 없다. 광고나 유료화에 사용하지 않는다.
저작권자가 요청하면 해당 에셋을 즉시 삭제한다.

원작을 즐겁게 했다면 정식 게임을 구매해 개발사를 지원해 주세요: https://www.innersloth.com/games/among-us/

## 에셋 출처 (사용자 지시: Kenney 에셋 미사용, GitHub 추출 에셋만 사용)

| 파일 | 출처 | 비고 |
|---|---|---|
| `client/assets/map/skeld.png` | [jinhyuk558/web-amongus-clone](https://github.com/jinhyuk558/web-amongus-clone) `src/assets/images/ship.png` | 팬 제작 스켈드 지도, 그림 안 표기 "MAP BY Z3_NON, NO CREDIT NEEDED". 저장소는 MIT |
| `client/assets/map/mira.webp` | itsssskye/amongus-assets `PrefabHierarchyObject/MiraShip.glb`(노드 위치) + `Sprite/*.json` + `Texture2D/*.png` | 원작 스프라이트를 원작 위치에 다시 조립 (`tools/recon/`), 1유닛=80px, WebP 변환 |
| `client/assets/map/mira-minimap.png` | 직접 생성 | `tools/build-map.mjs` 가 충돌 바닥으로 그림 |
| `client/assets/map/minimap.png` | [itsssskye/amongus-assets](https://github.com/itsssskye/amongus-assets) `Assets/Texture2D/map.png` | 원작 추출 미니맵 |
| `client/assets/sprites/crewmate.png/json` | [arizkhalid/among-us-clone](https://github.com/arizkhalid/among-us-clone) `frontend/public/assets/sprites/Base` | 원작 추출 프레임(대기·걷기·사망·유령·벤트). `tools/pack-sprites.mjs` 로 1/2 축소 후 아틀라스로 묶음 |
| `client/assets/ui/kill.png`, `report.png`, `use.png` | arizkhalid/among-us-clone `assets/icons` | |
| `client/assets/ui/{meetingCalled,bodyReported,screen,voted,ivoted,confirm,cancel,chat}.png` | arizkhalid/among-us-clone `assets/meeting` | |
| `client/assets/ui/logo.png` | arizkhalid/among-us-clone `assets/title.png` | |
| `client/assets/fonts/amongus.ttf` | arizkhalid/among-us-clone `assets/fonts` | |
| `client/assets/ui/{sabotage,vent,close,map}.png` | itsssskye/amongus-assets `Texture2D/Buttons.png` 에서 잘라냄 | |
| `client/assets/ui/ventgrate.png` | itsssskye/amongus-assets `Texture2D/Admin-Comms-Elec-Engine-Halls-Shields-Storage.png` 에서 잘라냄 | |
| `client/assets/ui/door_v.png`, `door_h.png` | itsssskye/amongus-assets `Texture2D/Doors.png` 에서 잘라냄 | |
| `client/assets/sounds/*.ogg` | itsssskye/amongus-assets `Assets/AudioClip/*` | ffmpeg 로 모노 OGG 변환 (`-ac 1 -ar 32000 -q:a 2`) |

## 데이터 참고

- 스켈드 미션 콘솔이 있는 방, 벤트 연결 구조, 문 13개 위치, 18색 RGB 값:
  [SkeldJS/SkeldJS](https://github.com/SkeldJS/SkeldJS) `packages/constant/lib/generated/*` 의 **수치만** 참고했다 (스켈드·미라 HQ 미션 지점, 벤트 위치·연결).
  SkeldJS 는 GPL-3.0 이며, 코드는 복사하지 않았다.
- 게임 설정 기본값(킬 쿨다운 25초, 첫 킬 10초, 회의 1회 등): 원작 기본 설정 기준.

## 라이브러리

| 이름 | 라이선스 |
|---|---|
| [Phaser 3.90.0](https://github.com/phaserjs/phaser) | MIT |
| [ws 8.22.0](https://github.com/websockets/ws) | MIT |
| [pngjs 7.0.0](https://github.com/pngjs/pngjs) (개발용) | MIT |

## 이 저장소의 코드

게임 코드(`server/`, `shared/`, `client/js/`, `tools/`, `test/`)는 참고 저장소의 코드를 복사하지 않고 새로 작성했다.
설계 아이디어 출처: jinhyuk558(서버가 입력으로 위치를 시뮬레이션), teerth123(서버 측 킬 사거리 검사), arizkhalid(전체 게임 흐름).
