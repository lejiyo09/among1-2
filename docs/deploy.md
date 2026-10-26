# 크롬북에서 개발하고 Render 로 배포하기

## 먼저 알아 둘 것: 정적 호스팅 vs 게임 서버

| 구분 | 하는 일 | 예 | 이 게임에서 |
|---|---|---|---|
| 정적 호스팅 | HTML/JS/이미지 파일만 전달 | GitHub Pages, Netlify, Vercel 정적 | 화면은 뜨지만 **여러 기기가 같은 게임을 공유할 수 없다** |
| 게임 서버 | 계속 켜져서 WebSocket 연결을 유지하고 방 상태를 관리 | Render Web Service, Railway, Fly.io | **필수**. 역할 배정, 킬 판정, 투표 집계를 모두 여기서 한다 |

이 프로젝트는 **서버 하나가 정적 파일과 WebSocket(`/ws`)을 같이 제공**한다.
그래서 Render Web Service 하나만 만들면 끝난다 (CORS 설정 불필요, HTTPS 주소에서는 자동으로 `wss://`).

## 1. 크롬북에서 개발 환경 열기 (설치 없음)

크롬북의 Linux, 관리자 권한, 로컬 서버가 필요 없다.

1. GitHub 에서 `lejiyo09/among1-2` 저장소 → 초록색 **Code** 버튼 → **Codespaces** 탭 → **Create codespace on main**
2. 브라우저에 VS Code 가 열린다. 아래 터미널에서:
   ```bash
   npm install
   MIN_PLAYERS=2 npm run dev
   ```
3. 오른쪽 아래 "포트 3000 에서 실행 중" 알림 → **브라우저에서 열기**.
   주소를 친구에게 보내려면 **포트** 탭에서 3000 번 포트를 오른쪽 클릭 → **포트 공개 범위 → Public**.
4. 같은 컴퓨터에서 여러 명을 시험할 때는 **새 탭**을 여러 개 연다 (탭마다 다른 플레이어가 된다).
5. 테스트 실행: `npm test`

> Codespaces 무료 사용 시간은 GitHub 계정 등급에 따라 다르다. 다 쓰면 GitHub 웹 편집기(저장소에서 `.` 키)로 코드만 고치고, 실행은 Render 배포본으로 확인할 수 있다.
> `npm run dev` 는 서버 코드가 바뀌면 자동으로 다시 시작한다. 클라이언트 코드는 새로고침만 하면 된다 (빌드 단계 없음).

## 2. Render 에 배포하기

### 방법 A: 블루프린트 (추천)

1. https://dashboard.render.com 에 GitHub 계정으로 로그인
2. **New → Blueprint** → `lejiyo09/among1-2` 선택 → 저장소의 `render.yaml` 을 읽어 서비스가 만들어진다
3. 몇 분 뒤 `https://among1-2-xxxx.onrender.com` 같은 주소가 생긴다. 이 주소가 게임 주소다.

### 방법 B: 직접 만들기

**New → Web Service** → 저장소 선택 후:

| 항목 | 값 |
|---|---|
| Runtime | Node |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Instance Type | Free |
| Health Check Path | `/healthz` |

### 환경 변수 (전부 선택 사항, 비밀 키 없음)

| 이름 | 기본값 | 설명 |
|---|---|---|
| `PORT` | 3000 | Render 가 자동으로 넣어 준다. 직접 넣지 않는다 |
| `MIN_PLAYERS` | 4 | 시작 최소 인원 (원작 4). 둘이 시험할 때만 2 |
| `ALLOWED_ORIGINS` | (비움) | 프런트를 다른 주소에 따로 올릴 때만 그 주소. 비우면 같은 서버 페이지만 허용 |
| `MAX_ROOMS` | 100 | 동시 방 수 |
| `MAX_CONNECTIONS` | 600 | 전체 연결 수 |
| `MAX_CONNECTIONS_PER_IP` | 60 | IP 하나당 연결 수. 학교는 모두 같은 공인 IP 를 쓰므로 넉넉하게 |
| `LOG_LEVEL` | info | `debug` 로 바꾸면 연결 종료 코드까지 기록 |

`.env.example` 에 같은 목록이 있다. 이 서버는 `.env` 파일을 자동으로 읽지 않으니 Render 대시보드의 **Environment** 에 넣는다.

### 배포 확인

1. `https://<내 주소>/healthz` → `{"ok":true,...}` 이 보이면 서버가 켜진 것
2. 게임 주소를 서로 다른 기기(크롬북, 휴대폰)에서 열어 방을 만들고 코드로 들어간다
3. 오른쪽 아래 연결 표시가 초록색 "연결됨 · NNms" 인지 확인

GitHub `main` 에 push 하면 Render 가 자동으로 다시 배포한다 (`autoDeploy: true`).

## 3. Render 무료 플랜의 제약 (2026년 10월 확인)

| 항목 | 내용 | 게임에 미치는 영향 |
|---|---|---|
| 절전 | 15분 동안 HTTP 요청도, 기존 연결의 **WebSocket 메시지도** 없으면 꺼진다 ([Render 변경 기록](https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages)) | 게임 중에는 클라이언트가 2초마다 ping 을 보내므로 꺼지지 않는다. 아무도 접속하지 않으면 꺼진다 |
| 깨어나기 | 꺼진 뒤 첫 접속 때 약 1분 걸림 | 처음 여는 사람은 1분쯤 기다려야 한다. `/healthz` 를 먼저 열어 깨워 두면 좋다 |
| 사용 시간 | 작업 공간당 월 750 인스턴스 시간 | 서비스 하나를 한 달 내내 켜도 약 744시간이라 보통 충분하다 |
| 상태 저장 | 재배포·재시작·절전 시 메모리가 초기화된다 | **진행 중인 방은 모두 사라진다.** 클라이언트는 "이전 방이 사라졌습니다" 안내 후 메뉴로 돌아간다. 게임 중에는 push(재배포)하지 않는다 |
| WebSocket | 지원 | 별도 설정 없음. HTTPS 주소에서 `wss://` 로 자동 연결 |
| 인스턴스 | 무료는 1개 | 모든 방이 한 프로세스에 있으므로 방 상태 공유 문제가 없다 |

무료 플랜이 학교 수업이나 친구들끼리 하기에는 충분하다. 절전이 불편하면 유료 인스턴스로 바꾸면 절전이 없어진다.

## 4. 학교 네트워크에서 접속이 안 될 때

- 게임 페이지는 열리는데 계속 "재연결 중…"이면 학교 방화벽이 WebSocket 을 막는 경우다.
  HTTPS(443) 위의 `wss://` 는 대부분 통과하지만, 막혀 있다면 이 구조(순수 WebSocket)로는 우회할 수 없다.
  이 경우 Socket.IO 의 HTTP long-polling 대체 경로가 필요하다 (`docs/research.md` 의 기술 선택 참고).
- `MAX_CONNECTIONS_PER_IP` 에 걸리면 접속이 "Busy" 로 거절된다. 반 전체가 하면 값을 올린다.

## 5. 프런트를 따로 올리고 싶을 때 (선택)

`client/` 와 `shared/` 폴더를 정적 호스팅에 올리고, 게임 서버는 Render 에 둔다.

1. `client/index.html` 의 `<script type="module" ...>` 위에 `<script>window.GAME_SERVER = 'wss://<Render 주소>/ws'</script>` 추가
   (또는 주소 뒤에 `?server=wss://<Render 주소>/ws`)
2. Render 환경 변수 `ALLOWED_ORIGINS` 에 정적 사이트 주소(예: `https://lejiyo09.github.io`)를 넣는다
3. `vendor/phaser.min.js` 는 서버가 `node_modules` 에서 제공하던 파일이므로, 정적 호스팅에서는 직접 복사해 두거나
   `https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js` 로 바꾼다.

구성이 복잡해지므로 기본 방식(Render 하나)을 권장한다.
