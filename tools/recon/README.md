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
