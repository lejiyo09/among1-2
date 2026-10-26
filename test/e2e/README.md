# 브라우저 E2E 테스트

실제 Chromium 여러 개를 띄워 같은 방에서 게임을 진행시키는 테스트. Playwright 가 필요하다 (npm 의존성에는 넣지 않았다).

```bash
npm i -D playwright && npx playwright install chromium   # 처음 한 번
MIN_PLAYERS=2 npm start                                    # 다른 터미널에서 서버 실행

node test/e2e/flow.cjs        # 4명: 로비→시작→역할→미션→킬→신고→투표→추방→승리→로비
node test/e2e/sabotage.cjs    # 전등·산소·원자로(2명)·통신·문·벤트를 실제 UI로
node test/e2e/reconnect.cjs   # 새로고침 복원, 탭 닫기 유예 후 제거, 방장 이전
node test/e2e/minigames.mjs   # 미니게임 16종을 포인터 조작으로 풀고 서버 검증 통과 확인
node test/e2e/lagproxy.mjs &  # 지연 프록시(:3200, 60~180ms + 가끔 600ms 정지)
URL=http://localhost:3200/ node test/e2e/lag.cjs   # 지연 환경 이동 동기화
```

스크린샷은 `test/e2e/shots/` 에 저장된다 (커밋하지 않음).
소프트웨어 렌더링(GPU 없는 서버)에서는 화면이 초당 10프레임 정도라 걷는 테스트가 느리다.
