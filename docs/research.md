# 1차 조사 보고서: 참고 저장소 분석

조사일: 2026-10-26
조사 방법: 각 저장소를 `git clone --depth 1`로 내려받아 소스 파일, `package.json`, 서버 코드, 게임 상태 처리 코드를 직접 읽었다.
README만 보고 결론 내린 항목은 없다. 다만 **참고 저장소를 직접 실행(npm install / 브라우저 실행)해 보지는 않았다.**
아래 표의 "실행 가능성" 칸은 코드를 정적으로 읽고 판단한 것이며, 별도로 **(추정)** 표시를 붙였다.

## 접근 결과

| 자료 | 접근 | 비고 |
|---|---|---|
| kumarankm/Amongus | ✅ | 31개 파일 |
| teerth123/Among-Us | ✅ | 46개 파일 |
| 21david/Amongst-Us | ✅ | 38개 파일 |
| testingherokuapp/Among-Us-HTML- | ✅ | `index.html` 1개 (262KB) |
| https://among-us-one.vercel.app/ | ❌ **접근 불가** | 작업 환경에서 DNS 조회 실패(`ENOTFOUND`)·프록시 403. 내용은 확인하지 못했다. |
| arizkhalid/among-us-clone | ✅ | 499개 파일 (마지막 커밋 2026-07-14) |
| hannahrobot/amongus-tutorial | ✅ | 36개 파일 |
| jinhyuk558/web-amongus-clone | ✅ | 26개 파일 |
| phaserjs/examples | ⚠️ 부분 | `git ls-remote`로 존재만 확인했다. 대용량이라 전체 클론은 하지 않고, Phaser API 참고용으로만 썼다. |
| SkeldJS/SkeldJS | ✅ | 공식 Among Us 서버 프로토콜(Hazel/UDP) 라이브러리 |
| itsssskye/amongus-assets | ✅ | 119,242개 파일, 3.0GB. 원작 Unity 에셋 추출본 |
| AlvajoyAsante/among-us-assets | ✅ | 178개 PNG, 57MB. 원작 에셋 추출본 |
| shorepine/kenney, kenney.nl | ⛔ 미사용 | 사용자 지시("Kenney 소스는 이용하지 마")에 따라 제외 |
| phaser.io/learn, socket.io 문서, Tiled JSON 문서 | 📖 | 공개 문서로 참고(설계 근거). 코드는 복사하지 않았다. |

## 저장소별 분석표

| 항목 | kumarankm/Amongus | teerth123/Among-Us | 21david/Amongst-Us | testingherokuapp/Among-Us-HTML- |
|---|---|---|---|---|
| 언어/프레임워크 | HTML·CSS·바닐라 JS | React+TS+Phaser(프런트), Express+Socket.IO+TS(백엔드) | 바닐라 JS Canvas + Webpack + Sass | TurboWarp로 패키징한 Scratch 프로젝트 |
| 실행 가능성 | 정적 파일이라 열기만 하면 됨 (추정) | 빌드 필요, 백엔드 폴더명에 공백(`backend practice`) (추정) | `dist/main.js`가 포함되어 있어 바로 열림 (추정) | 단일 HTML이라 열림 (추정) |
| 완성도 | 미완성: 캐릭터 이동 데모 수준 | 미완성: 핵심 루프 일부만 있음 | 미완성: 싱글 미션 데모 | Scratch 팬 리메이크. 원본 소스는 없음 |
| 멀티플레이 | ❌ 싱글 | ✅ Socket.IO | ❌ 싱글 (README상 멀티는 계획만 있음) | ❌ 싱글 |
| 서버 | 없음 | 있음 (`backend practice/src/socket/index.ts`) | 없음 | 없음 |
| 로비/방 코드 | ❌ | ✅ `create-room`/`join-room` | ❌ | ❌ |
| 이동/충돌 | 키 입력으로 DOM 이동, 충돌 없음 | Phaser+Tiled 충돌 (`collegeMapHalf.json`). 위치를 클라이언트가 결정 | Canvas 사각형 충돌 (`environment.js`) | 블록 기반 |
| 역할/임포스터/미션 | ❌ / ❌ / ❌ | 역할 ✅, 임포스터 ✅, 미션 ❌ | 미션만 ✅ (`task_space.js`, 타이머 방식) | 확인 불가 (컴파일된 블록) |
| 신고/회의/투표/승리 | ❌ | 신고 ❌, 투표 ✅(`polling`), 승리 판정 ✅ | ❌ | 확인 불가 |
| 서버 권위 | - | **부분적**: 킬 사거리는 서버가 계산(`KILL_RANGE=50`), 이동은 클라이언트 좌표를 그대로 수용 | - | - |
| 재사용 가치 | 낮음 | 서버 킬 사거리 검증 아이디어 | 미션 진행 개념만 | 없음 |
| 라이선스 | MIT (`LICENSE`) | **LICENSE 파일 없음** → 기본적으로 저작권 보유. 코드 재사용 불가 | LICENSE 파일 없음 (`package.json`만 ISC) → 재사용하지 않음 | 없음 → 재사용 불가 |
| 장단점 | 학습용으로는 간단함 / 게임 구조가 아님 | TS 서버 구조 참고 가능 / 라이선스 문제, 이동 치트 가능 | 의존성 적음 / 싱글 전용 | 크롬북에서 바로 열림 / 수정 불가 |

| 항목 | arizkhalid/among-us-clone | hannahrobot/amongus-tutorial | jinhyuk558/web-amongus-clone | SkeldJS/SkeldJS |
|---|---|---|---|---|
| 언어/프레임워크 | React 19 + Phaser 3.90 + Vite + Tailwind / Express 5 + Socket.IO 4 | Phaser 3 + Socket.IO + Express(+Passport/PG 보일러플레이트) | Phaser 3 + Socket.IO + Webpack | TypeScript 모노레포 (Hazel/DTLS/프로토콜) |
| 실행 가능성 | 프런트/백 각각 빌드·실행 필요. `ALLOWED_ORIGIN` 환경 변수 (추정: 실행 가능) | 실행에 PostgreSQL 의존성 필요 (추정) | 실행은 되나 게임 루프는 미완 (추정) | 라이브러리. 게임이 아님 |
| 완성도 | **가장 높음**: 로비, 방, 킬, 회의, 투표, 승리, 시야 셰이더 | 튜토리얼: 방 코드와 이동까지 | 미완성: 이동과 일부 충돌 | - |
| 멀티플레이 | ✅ Socket.IO | ✅ Socket.IO | ✅ Socket.IO | 공식 서버용 UDP. 브라우저에서 사용 불가 |
| 서버 | ✅ `backend/src` (managers, events) | ✅ `server/socket/index.js` | ✅ `server/index.js`, `server/utils/game.js` | - |
| 로비/방 코드 | ✅ (방 ID, 방장, 방 목록 API) | ✅ 5자리 코드 생성(`codeGenerator`) | ✅ (방 이름 문자열) | - |
| 이동/충돌 | Phaser Arcade + Tiled 충돌 레이어 (`assets/map/map.json`, 8px 타일). 위치는 클라이언트가 보고 | 클라이언트 좌표를 그대로 수용 | **서버가 입력(방향)으로 위치를 시뮬레이션** (`game.js`, speed 250). 서버 측 충돌은 없음 | - |
| 역할/임포스터/미션 | 임포스터 1명 ✅ / 미션 ❌ | ❌ / ❌ / 미션 화면 껍데기만 (`TaskScene.js`) | ❌ | 원작 데이터(맵 좌표, 색상, 미션 종류) 보유 |
| 신고/회의/투표/승리 | 회의 ✅ 투표 ✅ 동점 ✅ 승리 ✅ / 신고는 클라이언트 주도 | ❌ | ❌ | - |
| 서버 권위 | ❌ **킬을 클라이언트 요청 그대로 처리**(`player:kill`), 임포스터 ID가 방 객체에 담겨 모든 클라이언트로 전송됨(코드 내 TODO 주석으로 스스로 인정), 이동 미검증 | ❌ | ⭕ 이동만 서버 시뮬레이션 | - |
| 재사용 가치 | **에셋**: 원작 마스크 형식 크루원 스프라이트(빨강=몸, 파랑=그림자, 초록=바이저), 걷기·사망·유령 프레임, 회의·아이콘 UI, `skled.png`, Among Us 폰트 | 방 코드 생성 아이디어 | **`images/ship.png`**: 3587×2064 고해상도 스켈드 맵 (팬 제작 "MAP BY Z3_NON, NO CREDIT NEEDED") / 서버 권위 이동 구조 아이디어 | 원작 스켈드 좌표(벤트, 미션 콘솔, 문)와 색상표를 **참고 데이터**로만 사용 |
| 라이선스 | MIT (© 2026 Hash) | MIT (© 2021 Hannah) | MIT (Phaser 템플릿 © Richard Davey) | **GPL-3.0** → 코드는 복사하지 않고 사실 데이터(좌표 수치)만 참고 |
| 장단점 | 기능이 가장 많다 / React+Vite+Tailwind 빌드 체인이 무겁고 보안 모델을 처음부터 다시 짜야 함 | 단순함 / 기능 부족, 불필요한 DB 의존성 | 서버 권위 구조 / 기능 부족 | 원작 고증 데이터 / 웹 게임에 직접 사용 불가 |

에셋 저장소:

| 항목 | itsssskye/amongus-assets | AlvajoyAsante/among-us-assets |
|---|---|---|
| 내용 | Unity 추출본: `Texture2D`(1,844개), `Sprite`(115,507개), `AudioClip`(572개), 원작 미니맵 `map.png`(980×561) | 맵 조각, 투표·킬 화면, UI PNG |
| 권리 | README에 "Innersloth 소유, 교육·보관 목적, 상업적 이용 금지"라고 명시 | 원작 추출본으로 추정 (README 없음) |
| 사용 | 효과음(킬, 신고, 회의, 미션 완료, 사보타주 경보 등)과 미니맵 | 필요할 때만 사용 |

## 2차: 기반 프로젝트 선정

평가 (5점 만점, 정적 분석 기준):

| 기준 | arizkhalid | jinhyuk558 | teerth123 | hannahrobot |
|---|---|---|---|---|
| 실제 실행 가능성 | 4 | 3 | 3 | 2 |
| 온라인 멀티 수준 | 3 | 3 | 3 | 2 |
| 게임 규칙 완성도 | 3 | 1 | 2 | 1 |
| 코드 품질·유지보수 | 3 | 2 | 2 | 2 |
| 크롬북 개발 용이성 | 2 (React+Vite+Tailwind 빌드) | 2 (Webpack) | 2 | 1 (PostgreSQL) |
| 배포 가능성 | 3 (프런트/백 분리 배포) | 2 | 2 | 1 |
| 의존성·호스팅 비용 | 3 | 3 | 3 | 1 |
| 라이선스·에셋 | 4 (MIT) | 4 (MIT) | **0 (라이선스 없음)** | 4 (MIT) |

**결론: 코드 기반은 새로 설계하고, arizkhalid/among-us-clone(MIT)를 에셋과 게임 흐름의 기준점으로 삼는다.**

이유:
1. 기능은 arizkhalid가 가장 많지만, 핵심인 **서버 권위가 없다.** 킬, 위치, 신고를 클라이언트가 결정하고 임포스터 ID가 모든 클라이언트에 전송된다. 지시서의 보안 요구(역할 비공개, 서버 검증)를 맞추려면 이벤트 구조 전체를 다시 짜야 하므로, 그대로 가져와 고치는 것보다 재설계가 안전하다.
2. React+Vite+Tailwind 빌드 체인은 크롬북/Codespaces에서 무겁다. **빌드 단계 없는 네이티브 ES 모듈 클라이언트 + Node 단일 서버** 구조로 바꾸면 GitHub 웹 편집기에서 수정해도 Render가 그대로 배포한다.
3. 서로 호환되지 않는 코드(React 상태 관리, Socket.IO 이벤트, Webpack 설정)를 억지로 합치지 않는다.

가져온 것 (원본 경로 → 용도):

| 원본 | 가져온 것 | 라이선스/근거 |
|---|---|---|
| jinhyuk558 `src/assets/images/ship.png` | 게임 맵 배경 (스켈드, Z3_NON 제작) | 저장소 MIT, 이미지에 "NO CREDIT NEEDED" 표기. 출처는 그래도 표기한다. |
| jinhyuk558 `server/utils/game.js` | **아이디어만**: 서버가 입력으로 위치를 시뮬레이션하는 구조 | 코드 복사 없음 |
| arizkhalid `frontend/public/assets/sprites/Base/*` | 크루원 걷기·대기·사망·유령 프레임 (원작 마스크 형식) | 원작 추출 에셋. 비상업 팬 프로젝트로 사용 |
| arizkhalid `frontend/public/assets/{icons,meeting}` | 킬, 신고, 사용 버튼, 회의 UI 이미지 | 같음 |
| arizkhalid `frontend/public/assets/fonts/amongus.ttf` | UI 폰트 | 같음 |
| itsssskye `Assets/AudioClip/*` | 효과음 | 원작 추출, 비상업·교육 목적 |
| itsssskye `Assets/Texture2D/map.png` | 원작 스켈드 미니맵 | 같음 |
| SkeldJS `packages/constant/lib/generated/*` | **수치만 참고**: 벤트 연결 구조, 미션 콘솔 방 배치, 문 위치, 18색 하이라이트/그림자 RGB | 사실 데이터. GPL 코드는 복사하지 않는다. |

### 에셋 저작권 주의

사용자 지시에 따라 Kenney 에셋은 쓰지 않고, GitHub에 올라온 추출 에셋만 사용한다.
이 에셋들은 **Innersloth LLC의 저작물**이다. 따라서:
- 이 프로젝트는 **비상업적 팬 제작물**로만 운영한다 (광고, 유료화 금지).
- README와 게임 크레딧에 Innersloth 저작권과 출처를 표기한다.
- 저작권자가 요청하면 즉시 내려야 하는 자료임을 문서화한다.
- 에셋은 `client/assets/` 한곳에 모아 두어 교체하기 쉽게 한다.

## 기술 스택 결정

| 영역 | 선택 | 이유 | 제외한 후보 |
|---|---|---|---|
| 렌더링 | **Phaser 3.90.0** | 검증된 2D 엔진이고 arizkhalid와 같은 버전이라 에셋 프레임 형식이 호환된다. 예제와 문서가 가장 많다. | Phaser 4.x: 최신이지만 예제와 서드파티 자료가 아직 3.x 중심 |
| 실시간 통신 | **`ws` (기본 WebSocket)** | ① 브라우저 표준 `WebSocket`만으로 접속하므로 클라이언트 라이브러리가 필요 없다(번들러 불필요). ② 방 격리, 재접속 토큰, 중복 요청 방지를 어차피 직접 설계해야 해서 Socket.IO의 room/ack 기능 이점이 작다. ③ Render는 WebSocket 업그레이드를 기본 지원한다. ④ 메시지 크기 제한(`maxPayload`)과 프로토콜을 직접 통제할 수 있다. | Socket.IO: long-polling 대체 경로가 있다는 장점(학교 방화벽)은 인정한다. 다만 전용 클라이언트 번들과 자체 프로토콜이 생기고, 서버 권위 구조에서는 이점이 작다. 학교망에서 WS가 막히면 대안으로 문서화한다. |
| 서버 | **Node.js 22 + `http` + `ws`** | Express 없이 정적 파일과 WS를 한 프로세스에서 처리한다. Render Web Service 하나로 배포가 끝난다(같은 출처이므로 CORS 불필요, 자동 `wss://`). | 프런트를 따로 정적 호스팅하는 방식: 가능하지만 환경 변수와 CORS가 늘어난다. 선택 사항으로만 문서화한다. |
| 클라이언트 | **빌드 없는 네이티브 ES 모듈** | 크롬북 웹 편집기나 Codespaces에서 수정 즉시 반영된다. | React/Vite: 이 규모의 게임 UI에는 과하다 |
| 맵 | **Tiled JSON(.tmj) 형식** | 충돌 타일 레이어와 오브젝트 레이어(미션, 벤트, 문, 방)를 표준 형식으로 저장한다. 서버와 클라이언트가 같은 파일을 읽는다. | 자체 형식 |
| 공유 코드 | `shared/` ES 모듈 | 충돌 판정, 이동, 상수를 서버와 클라이언트가 **같은 코드**로 실행한다 → 예측과 보정이 정확하다. | - |
| 검증 | 런타임 스키마 검증(`shared/protocol.js`) + JSDoc 타입 | TypeScript 빌드 단계 없이 입력을 검증한다. | zod 등: 의존성 추가 |
| 테스트 | `node:test` (내장) | 추가 설치가 필요 없다. | Jest |
| 배포 | **Render Web Service** (사용자 지정) | WebSocket 지원, GitHub 연동 자동 배포 | - |
