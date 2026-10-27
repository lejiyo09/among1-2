# WebSocket 프로토콜

- 주소: 게임 페이지와 같은 서버의 `/ws` (HTTPS 사이트에서는 자동으로 `wss://`)
- 형식: UTF-8 JSON 텍스트 프레임 1개 = 메시지 1개. 바이너리 프레임은 거부한다.
- 모든 메시지는 `t`(종류) 필드를 가진다.
- 최대 크기: 4096바이트 (넘으면 서버가 연결을 끊는다)
- 스키마 정의(실제 검증 코드): `shared/protocol.js` 의 `C2S`
- 정의되지 않은 필드가 하나라도 있으면 `BAD_MESSAGE` 로 거부한다.

## 공통 규칙

### 요청 ID (`rid`)와 응답 (`ack`)

행동 요청에는 선택적으로 `rid`(정수)를 붙일 수 있다. 서버는 처리 결과를 아래처럼 돌려준다.

```json
{ "t": "ack", "rid": 12, "ok": true }
{ "t": "ack", "rid": 13, "ok": false, "error": "COOLDOWN" }
```

- 같은 연결에서 같은 `rid` 를 다시 보내면 **다시 실행하지 않고** 처음 결과를 그대로 돌려준다 (최근 64개 기억).
  네트워크 재전송 때문에 킬·투표가 두 번 처리되는 일을 막는다.
- 게다가 서버 상태 자체도 중복을 막는다: 이미 죽은 대상 킬 → `INVALID_TARGET`, 두 번째 투표 → `ALREADY_DONE`.
- `rid` 없이 보낸 요청이 실패하면 `{ "t": "error", "code": "...", "for": "<요청 종류>" }` 를 보낸다.

### 전송 빈도 제한

연결마다 토큰 버킷(용량 60, 초당 40 회복). 초과한 메시지는 처리하지 않고 `{ "t":"error", "code":"RATE_LIMITED" }`.
계속 초과하면(200회) 연결을 닫는다 (close code 1008).

### 오류 코드

| 코드 | 의미 |
|---|---|
| `BAD_MESSAGE` | JSON 아님, 스키마 불일치, 알 수 없는 종류 |
| `RATE_LIMITED` | 너무 자주 보냄 |
| `NOT_IN_ROOM` / `ALREADY_IN_ROOM` | 방 상태가 맞지 않음 |
| `ROOM_NOT_FOUND` | 없는 방 코드 (서버 재시작 후 포함) |
| `ROOM_FULL` | 15명 초과 또는 남은 색 없음 |
| `GAME_IN_PROGRESS` | 게임 중인 방에 새로 입장 시도 |
| `SESSION_EXPIRED` | 재접속 토큰이 없거나 만료됨 |
| `NOT_HOST` | 방장 전용 |
| `NOT_ENOUGH_PLAYERS` / `NOT_READY` | 시작 조건 미충족 |
| `COLOR_TAKEN` / `BAD_NAME` | 색 중복 / 닉네임 비어 있음 |
| `WRONG_PHASE` | 지금 단계에서 불가 (예: 토론 중 투표) |
| `NOT_ALLOWED` | 역할·생존 상태상 불가 (예: 승무원 킬, 유령 신고, 위급 사보타주 중 비상 버튼) |
| `OUT_OF_RANGE` | 거리 밖이거나 벽에 가려짐 |
| `COOLDOWN` | 쿨다운 중 |
| `INVALID_TARGET` | 대상이 없거나 유효하지 않음 |
| `ALREADY_DONE` | 이미 투표함 / 이미 완료한 미션 |
| `TOO_FAST` | 미션 최소 수행 시간 미달 |
| `WRONG_ANSWER` | 미션·산소 코드 정답 아님 |
| `SERVER_FULL` / `INTERNAL` | 서버 상태 문제 |

## 연결과 방

| 클라이언트 → 서버 | 필드 | 설명 |
|---|---|---|
| `hello` | `v` | 접속 직후. 서버가 `welcome {protocol, now, minPlayers}` 응답 |
| `create` | `name`, `color?`, `practice?`, `rid?` | 방 만들기 → `joined`. `practice: true` 는 혼자 하는 연습 방(원작 자유 플레이: 더미 크루원, 승패 없음, 다른 사람 입장 불가, 설정 `practiceRole`) |
| `endPractice` | `rid?` | 연습 방에서 게임을 끝내고 대기실로 |
| `admin` | `rid?` | 관리실 지도: 탁자 앞(USE_RANGE)에서만. 응답으로 `adminMap { rooms: { 방이름: 사람+시체 수 } }` (누가 있는지는 보내지 않음). 통신 방해 중 `COMMS_DOWN` |
| `doorlog` | `rid?` | 미라 HQ 출입 기록: 장치 앞에서만. 응답 `doorLog { entries: [{ color, sensor: north/southeast/southwest, ago(ms) }] }` (최신순 20개, 플레이어 id 없음) |
| `vitals` | `rid?` | 생체 신호: 장치 앞에서만. 응답 `vitals { players: [{ color, state: alive/dead/dc }] }` |
| `cams` | `on`, `rid?` | 보안실 CCTV 보기 시작/끝. 보는 동안 스냅샷에 카메라(반경 CAM_RADIUS, 벽 가림 적용)에 비친 사람·시체가 추가되고 이동·행동 불가. state 에 `you.watchingCams`, 모두에게 `camsInUse` |
| `join` | `code`(영문 대문자 6), `name`, `color?`, `rid?` | 방 코드로 입장 → `joined` |
| `resume` | `token`(hex 32), `rid?` | 재접속 → `joined {resumed:true}` 또는 `SESSION_EXPIRED` |
| `leave` | `rid?` | 정상 퇴장 → `left`. 토큰이 무효가 된다 |
| `ping` | `ts` | → `pong {ts, now}` (지연 측정, 시계 보정) |

서버 → 클라이언트:

- `joined {code, playerId, token, resumed?}`: 클라이언트는 `token` 을 `sessionStorage` 에 저장한다 (탭마다 별도).
- `left`, `kicked`, `replaced`(다른 탭이 같은 토큰으로 접속): 클라이언트는 메뉴로 돌아간다.

### 연결 끊김 처리

| 상황 | 서버 동작 |
|---|---|
| 정상 퇴장 (`leave`) | 즉시 제거. 게임 중이면 시체 없이 탈락 처리, 그 승무원의 미션은 전체 진행률에서 빠짐 |
| 비정상 종료 (탭 닫기, 와이파이 끊김) | `connected=false` 로 표시하고 **유예**: 로비 15초, 게임 중 45초. 그 안에 `resume` 하면 그대로 복원 |
| 응답 없는 연결 | 서버가 15초마다 WebSocket ping, 다음 주기까지 pong 이 없으면 강제 종료 → 위 "비정상 종료" |
| 방장 끊김 | 즉시 가장 먼저 들어온 연결 중인 플레이어에게 방장 이전 |
| 모두 나감 | 방 삭제 |
| 서버 재시작 | 모든 방은 메모리에만 있으므로 사라진다. 클라이언트의 `resume` 은 `SESSION_EXPIRED` → "이전 방이 사라졌습니다" 안내 후 메뉴 |

## 로비

| 메시지 | 필드 | 검증 |
|---|---|---|
| `setColor` | `color` 0~17 | 로비 단계, 다른 사람이 쓰는 색 불가 |
| `setSettings` | `settings` 객체 | 방장만. 알려진 키만 반영, 범위는 `SETTING_LIMITS` 로 고정 |
| `ready` | `ready` | 로비 단계 |
| `start` | | 방장, 최소 인원, 전원 연결·준비 |
| `kick` | `playerId` | 방장, 로비 단계 |
| `chat` | `text` (1~100자) | 0.7초에 1번. 로비/회의/종료 화면에서 모두, 게임 중에는 유령끼리만 |

## 게임

| 메시지 | 필드 | 서버 검증 |
|---|---|---|
| `input` | `seq`, `d`(방향 배열, 최대 8개, -1~15) | 아래 "이동" 참고 |
| `taskStart` | `taskId` | 진행 중, 승무원(유령 포함), 배정된 미완료 미션, 현재 단계 지점과의 거리 ≤ 사용 거리 → `task {defId, step, spotId, challenge}` |
| `taskComplete` | `taskId`, `answer?` | 시작한 미션과 일치, 최소 수행 시간 경과, 거리 유지, 정답(서버가 낸 문제로 검증) |
| `taskCancel` | | |
| `kill` | `targetId` | 진행 중, 살아 있는 임포스터, 벤트 밖, 쿨다운 끝, 대상은 살아 있는 승무원, 거리 ≤ 킬 거리×1.1, 벽에 가리지 않음 |
| `report` | `bodyId` | 살아 있음, 시체와의 거리 ≤ 신고 거리, 벽에 가리지 않음 |
| `emergency` | | 살아 있음, 버튼 근처, 남은 횟수, 쿨다운, 위급 사보타주 아님 |
| `vent` | `action`(enter/move/exit), `to?` | 살아 있는 임포스터, 벤트 근처, 연결된 벤트로만 이동 |
| `sabotage` | `kind`(reactor/o2/lights/comms/doors), `room?` | 임포스터(유령 포함), 동시에 하나, 쿨다운. 문은 방별 쿨다운 |
| `fix` | `consoleId`, `action`(hold/release/code/switch/dial), `value?` | 살아 있음, 콘솔 근처, 진행 중인 사보타주와 일치 |
| `vote` | `target`(플레이어 id 또는 `skip`) | 투표 단계, 살아 있음, 아직 안 함, 대상 생존 |

### 이동 (서버 권위)

1. 클라이언트는 30Hz 고정 틱마다 입력 방향(16방향 또는 정지)을 기록하고, 2틱마다 묶어서 `input {seq, d:[...]}` 로 보낸다. 멈춰 있으면 보내지 않는다.
2. 서버는 플레이어마다 **틱당 입력 1개만** 처리한다 (`shared/movement.js` 의 같은 이동 함수, 같은 충돌 격자).
   실제 시간보다 빨리 입력을 보내도(스피드핵) 큐가 넘치면 버려지므로 이동 속도는 늘지 않는다. 순간이동 요청은 존재하지 않는다.
3. 이미 처리한 `seq` 의 재전송은 무시한다.
4. 서버는 15Hz 로 스냅샷 `s` 를 보낸다. 클라이언트는 `a`(마지막 처리 seq) 이후 입력만 다시 적용해 예측을 보정한다.
5. 다른 플레이어는 120ms 지연을 두고 스냅샷 사이를 보간한다.

### 스냅샷 `s` (서버 → 클라이언트, 15Hz, 받는 사람마다 다름)

```json
{ "t": "s", "k": 1234, "a": 87, "me": [1915.2, 640.0, 2],
  "p": [["p3", 1980, 610, 3]], "g": ["p5"],
  "b": [["bp4", 2040, 413, 3, "p4"]], "bg": [] }
```

| 필드 | 뜻 |
|---|---|
| `k` | 서버 틱 번호 |
| `a` | 처리한 마지막 입력 seq |
| `me` | 내 확정 위치 `[x, y, flags]` |
| `p` | **바뀐** 다른 플레이어만 `[id, x, y, flags]` (안 바뀐 사람은 보내지 않음) |
| `g` | 이제 안 보이게 된 플레이어 |
| `b` / `bg` | 새로 보이는 시체 `[id, x, y, color, playerId]` / 안 보이게 된 시체 |

flags: 1 왼쪽 보기, 2 이동 중, 4 유령, 8 스캔 중(시각 미션), 16 벤트 안(자기 자신만)

**시야 필터 (월핵 방지)**: 살아 있는 플레이어에게는 시야 반지름 안이고 벽(문 포함)에 가리지 않은 플레이어·시체만 보낸다.
벤트 안의 임포스터는 아무에게도, 유령은 유령에게만 보낸다. 유령과 회의 중에는 전부 보낸다.

### 상태 `state` (상태가 바뀔 때, 받는 사람마다 다름)

```json
{ "t": "state", "code": "ABCDEF", "now": 1792988064572, "phase": "playing", "endsAt": 0,
  "hostId": "p1", "settings": { ... }, "minPlayers": 4,
  "players": [{ "id": "p1", "name": "철수", "color": 0, "host": true, "ready": true, "connected": true, "left": false, "inGame": true, "dead": false }],
  "you": { "role": "crewmate", "alive": true, "tasks": [{ "defId": "wires", "step": 1, "steps": 3, "spot": "wires_admin", "done": false }],
           "killReadyAt": 0, "emergencyLeft": 1, "emergencyReadyAt": 1792988080000, "inVent": null, "activeTask": null, "fake": false },
  "taskBar": { "done": 3, "total": 24 },
  "sabotage": { "active": { "kind": "o2", "endsAt": 1792988100000, "code": "04821", "fixed": [] }, "cooldownUntil": 0, "doorsClosed": [], "doorCooldowns": {} },
  "meeting": { "callerId": "p2", "reason": "report", "bodyColor": 3, "voted": ["p1"], "myVote": "p3", "result": null } }
```

비공개 처리:
- `impostors`(임포스터 id 목록)는 **임포스터에게만**, 그리고 게임 종료 후에만 모두에게 보낸다.
- 다른 사람의 `role` 은 게임 종료(`end.roles`) 전에는 절대 보내지 않는다. 추방 결과의 역할 공개는 "추방 시 역할 공개" 설정일 때 문장으로만.
- `dead` 는 원작처럼 회의가 열려 사망이 확인된 뒤에 공개된다 (유령에게는 전부 보임).
- 통신 방해 중에는 `you.tasks` 와 `taskBar` 가 `null`.

### 연출 이벤트 `fx`

| `kind` | 받는 사람 | 데이터 |
|---|---|---|
| `roleReveal` | 각자 | `role`, `team`(임포스터면 동료 포함, 승무원이면 자기만), `impostorCount` |
| `kill` / `killed` | 임포스터 / 피해자 | `victimId` / `killerColor` |
| `meeting` | 모두 | `reason`(report/emergency), `callerId`, `bodyColor` |
| `voted` | 모두 | `voterId` (누구에게 투표했는지는 결과 때 공개) |
| `voteResult` | 모두 | `result {ejectedId, tie, skipped, text, sub, counts, votes}` (`votes` 는 익명 투표면 null) |
| `taskDone` | 본인 | `defId`, `finished` |
| `sabotage` / `sabotageFixed` | 모두 | `sabotage`(종류) |
| `doors` | 모두 | `room`, `closed` |
| `vent` | 그 위치가 보이는 사람 | `x`, `y`, `enter` |
| `chat` | 규칙에 맞는 사람 | `from`, `name`, `color`, `text`, `dead` |
| `gameOver` | 모두 | `winner`(crew/impostor), `reason`(tasks/impostors_eliminated/crew_outnumbered/sabotage) |

## 게임 단계

```
lobby ──start──▶ starting(5.5초, 역할 공개) ──▶ playing
playing ──신고/긴급 회의──▶ discussion(연출 3초 + 토론 시간) ──▶ voting(투표 시간, 전원 투표 시 즉시 종료)
voting ──▶ result(7초, 추방 연출) ──▶ playing 또는 ended
playing ──승리 조건──▶ ended(8초) ──▶ lobby
```

승리 판정 (`server/game/rules.js` `checkWin`, 킬·추방·이탈·미션 완료·사보타주 시간 초과 때마다 검사):

| 조건 | 승자 | reason |
|---|---|---|
| 살아 있는 임포스터 0명 (추방 또는 이탈) | 승무원 | `impostors_eliminated` |
| 살아 있는 임포스터 ≥ 살아 있는 승무원 | 임포스터 | `crew_outnumbered` |
| 이탈하지 않은 승무원의 미션 전부 완료 (유령 미션 포함) | 승무원 | `tasks` |
| 원자로·산소 사보타주 30초 안에 미해결 | 임포스터 | `sabotage` |
