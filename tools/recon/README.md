# 원작 맵 재조립 도구 (미라 HQ)

원작 맵 그림 전체가 GitHub 에 없어서, 원작 데이터에서 추출된 자료로 맵 그림을 다시 조립한다.

- 노드 위치: `itsssskye/amongus-assets` 의 `Assets/PrefabHierarchyObject/MiraShip.glb` (노드 이름 + 위치/크기/회전만 있음, glTF 라서 x 를 뒤집는다)
- 스프라이트: 같은 저장소의 `Assets/Sprite/*.json` (텍스처 PathID, 영역, 피벗, PPU)
- 텍스처: `Assets/Texture2D/*.png` — PathID 와 PNG 파일 이름의 대응이 없어서, 스프라이트 영역의 투명도가 맞는 PNG 를 점수로 고른다 (`texmap.py`)
- 노드 이름과 스프라이트 이름이 다른 곳은 `alias_mira.json` 으로 직접 이었다

```sh
export AU_ASSETS=/path/to/itsssskye_amongus-assets/Assets
python3 index_sprites.py                 # → sprites.pkl
python3 want.py MiraShip.glb             # → want.json (필요한 텍스처 PathID)
python3 texmap.py want.json texmap.json  # 이미 만든 결과: texmap_mira.json
ALIAS=alias_mira.json python3 render.py MiraShip.glb texmap_mira.json mira_full.png 0.8   # 1유닛 = 80px
```

그 뒤 손으로 한 일 (결과물 `client/assets/map/mira.webp` 에 반영됨)
- 투명 테두리 잘라내기 (잘린 오프셋 → `tools/mira-objects.mjs` 의 `W(x, y)` 변환)
- 본체와 떨어진 작은 조각(아틀라스에서 같이 잘려 나온 다른 스프라이트) 제거
- 원작에서 반복 무늬 재질로 채우는 복도 바닥 한 곳(단색 초록 자리 표시)을 옆 카펫 무늬로 채움
- 할로윈 장식 노드는 그리지 않음

남은 차이: 반복 무늬 바닥(WoodHall/CarpetHall 재질)과 애니메이션(원자로 빛, 벤트 등)은 들어 있지 않다.

## 스켈드 원작 오브젝트 레이어

스켈드는 추출 자료에 방 바닥 그림 대부분이 없어 통째로 조립할 수 없다. 그래서 바닥·벽은 팬아트(Z3_NON) 그림을 그대로 쓰고,
그 그림에 빠진 원작 오브젝트만 원작 스프라이트로 덧그린다 (`client/assets/map/skeld-objects.webp`, `skeld-hull.webp`).

- 위치: 원작 `SkeldShip.glb` 노드 위치를 벤트 14곳 + 비상 버튼으로 최소제곱 맞춘 변환으로 옮김 (`X = 98.9u + 1977.9`, `Y = -94.5v + 609.7`, 평균 오차 약 20px)
- 방별 미세 보정: `roomoff_skeld.json`, 애니메이션 노드 → 첫 프레임 스프라이트: `alias_skeld.json`
- 그린 것: 상·하부 엔진 본체와 난간, 원자로 노심·받침·배관·전선, 보안실 서버, 의무실 스캐너, 산소 탱크, 관리실 지도 홀로그램·화면, 비상 버튼, 복도 감시 카메라, 선체 바깥 추진기·무기 포신·방어막 (뒤 레이어)

```sh
ROOMOFF=roomoff_skeld.json ALIAS=alias_skeld.json python3 overlay.py SkeldShip.glb texmap_skeld.json front.png "$(cat skeld_front_nodes.txt)"
ROOMOFF=roomoff_skeld.json ALIAS=alias_skeld.json python3 overlay.py SkeldShip.glb texmap_skeld.json back.png '/HullItems/'
# 각각 투명 테두리를 잘라 WebP 로 저장하고, 잘린 위치를 tools/skeld-objects.mjs 의 LAYERS 에 적는다
```
