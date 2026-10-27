// 스켈드 맵 수작업 배치 데이터 (좌표 단위: skeld.png 픽셀, 3587×2064)
//
// 고증 기준
// - 방 구성, 미션 콘솔이 있는 방, 벤트 연결 구조, 문 13개의 위치는 원작 데이터를 따랐다
//   (SkeldJS packages/constant 의 mapTasksData / mapVentData / mapDoorsData 수치를 참고. 코드는 복사하지 않음).
// - 원작 좌표계(Unity 단위)와 이 팬아트 맵은 축척이 조금씩 달라서, 실제 픽셀 위치는 맵 그림을 보고 직접 맞췄다.
//
// 이 파일을 고친 뒤 `npm run build:map` 을 실행하면 shared/maps/skeld.tmj 가 다시 만들어진다.

export const CELL = 8;        // 충돌 격자 한 칸 크기(px)
export const WALL_FACE = 64;  // 우주 공간 바로 아래로 이어지는 "위쪽 벽면" 높이(px)
export const OUTLINE = 12;    // 좌/우/아래 외곽선 두께(px)

// 자동 판정 위에 덮어쓰는 장애물 (가구, 기계)
export const obstacles = [
  // 식당 테이블 5개 (의자 포함)
  { ellipse: [1705, 290, 108, 68] },
  { ellipse: [2120, 286, 108, 68] },
  { ellipse: [1915, 506, 108, 68] },
  { ellipse: [1705, 720, 108, 68] },
  { ellipse: [2120, 720, 108, 68] },
  // 상부/하부 엔진 본체 (skeld-objects.webp 에 그린 원작 엔진 범위, 왼쪽 아래는 연료·정렬 콘솔 상자)
  { poly: [[344, 400], [658, 400], [658, 600], [470, 600], [470, 647], [344, 647]] },
  { poly: [[351, 1462], [656, 1462], [656, 1628], [470, 1628], [470, 1672], [351, 1672]] },
  // 원자로 노심과 받침
  { poly: [[40, 880], [215, 880], [215, 1110], [185, 1150], [185, 1290], [40, 1290]] },
  // 의무실 침대 4개
  { rect: [1046, 662, 1146, 752] }, { rect: [1046, 770, 1146, 856] },
  { rect: [1300, 662, 1398, 752] }, { rect: [1300, 770, 1398, 856] },
  // 보안실 책상
  { rect: [900, 962, 995, 1078] },
  // 창고 상자와 드럼통 (그림 범위에 맞춤)
  { rect: [1670, 1310, 1740, 1372] },
  { circle: [1632, 1395, 28] }, { circle: [1667, 1360, 26] }, { circle: [1585, 1450, 28] },
  { poly: [[1720, 1495], [1950, 1495], [1950, 1735], [1895, 1735], [1895, 1822], [1800, 1822], [1800, 1735], [1705, 1735], [1705, 1690], [1650, 1690], [1650, 1600], [1720, 1600]] },
  { circle: [1955, 1700, 22] },
  // 관리실 지도 테이블
  { rect: [2262, 1252, 2472, 1368] },
  // 산소실 왼쪽 벽 대각선 배관
  { poly: [[2395, 885], [2395, 850], [2455, 815], [2478, 840], [2420, 888]] },
  // 산소실 하단 탱크와 화단
  { rect: [2330, 935, 2640, 1020] },
  // 무기실: 가운데 포탑 의자, 난간 너머 아래층 기계 구역 3곳 (원작처럼 난간을 넘어갈 수 없다)
  { ellipse: [2738, 430, 62, 44] },
  { poly: [[2575, 250], [2680, 250], [2680, 340], [2640, 400], [2575, 420]] },
  { rect: [2575, 538, 2716, 660] },
  { rect: [2840, 415, 2975, 660] },
  // 방어막실: 난간 너머 아래층 기계 구역 3곳 (왼쪽 위 전구, 왼쪽 아래, 오른쪽)
  { poly: [[2575, 1390], [2720, 1390], [2720, 1450], [2650, 1520], [2575, 1525]] },
  { poly: [[2575, 1668], [2680, 1668], [2725, 1710], [2725, 1760], [2575, 1760]] },
  { rect: [2840, 1485, 2975, 1762] },
  // 전기실: 위쪽 벽 캐비닛 아래쪽 (벽면 자동 판정보다 그림이 길다)
  { rect: [1130, 1210, 1555, 1242] },
  // 원작 오브젝트 레이어에 그린 가구 (tools/recon/overlay.py BBOX 범위의 아래쪽 = 바닥에 닿는 부분)
  { rect: [1132, 1355, 1342, 1483] },                 // 전기실 배전반
  { rect: [820, 752, 967, 815] }, { rect: [769, 790, 819, 894] }, // 보안실 CCTV 책상, 서버 랙
  { rect: [1427, 874, 1515, 978] },                   // 의무실 컴퓨터
  { rect: [2511, 750, 2589, 832] },                   // 산소 탱크
  { rect: [2106, 1900, 2159, 1991] }, { rect: [2493, 1900, 2546, 1991] }, // 통신실 양옆 모니터 책상
  { rect: [2230, 1990, 2441, 2052] },                 // 통신실 아래 책상
  { rect: [3520, 902, 3590, 1049] }, { rect: [3456, 830, 3536, 898] },     // 항해실 조종·항로 콘솔
  { rect: [3425, 870, 3492, 912] }, { rect: [3461, 950, 3530, 997] }, { rect: [3440, 1090, 3497, 1133] }, // 항해실 의자 3개
];

// 자동 판정이 막았지만 실제로는 지나갈 수 있는 곳 (필요할 때만 추가)
export const openings = [];

/**
 * 원작 오브젝트 레이어 (tools/recon/overlay.py 로 생성): 원작 SkeldShip 프리팹의 노드 위치에 원작 스프라이트를 놓고
 * 벤트·비상 버튼 15곳으로 맞춘 변환(X = 98.9u + 1977.9, Y = -94.5v + 609.7)에 더해, 방마다 원작 바닥·벽 그림을
 * 이 그림에 맞춰 찾은 이동·배율(tools/recon/room_fit.json)을 적용했다. 벤트 위치도 같은 변환을 쓴다.
 * back: 선체 바깥(추진기, 무기 포신, 방어막) — 배 그림 뒤 / front: 방 안 기계 — 배 그림 위, 플레이어 아래
 */
export const LAYERS = [
  { image: 'assets/map/skeld-hull.webp', x: -315, y: 258, depth: 'back' },
  { image: 'assets/map/skeld-objects.webp', x: 9, y: 214, depth: 'front' },
];

const task = (name, taskType, x, y, extra = {}) => ({ name, type: 'task', x, y, props: { taskType, room: extra.room ?? '', ...extra.props } });

export const objects = {
  rooms: [
    { name: 'Cafeteria', type: 'room', rect: [1465, 0, 2410, 950] },
    { name: 'Weapons', type: 'room', rect: [2570, 190, 2975, 700] },
    { name: 'O2', type: 'room', rect: [2315, 700, 2640, 1025] },
    { name: 'Navigation', type: 'room', rect: [3285, 745, 3587, 1150] },
    { name: 'Shields', type: 'room', rect: [2570, 1390, 2980, 1845] },
    { name: 'Communications', type: 'room', rect: [2105, 1730, 2550, 2050] },
    { name: 'Storage', type: 'room', rect: [1555, 1265, 2070, 2064] },
    { name: 'Admin', type: 'room', rect: [2150, 1095, 2575, 1450] },
    { name: 'Electrical', type: 'room', rect: [1125, 1150, 1565, 1730] },
    { name: 'LowerEngine', type: 'room', rect: [345, 1300, 745, 1765] },
    { name: 'Security', type: 'room', rect: [765, 735, 1005, 1195] },
    { name: 'Reactor', type: 'room', rect: [0, 640, 380, 1345] },
    { name: 'UpperEngine', type: 'room', rect: [345, 260, 745, 710] },
    { name: 'MedBay', type: 'room', rect: [1040, 580, 1555, 1065] },
  ],

  spawn: [
    // 시작/회의 후 식당 비상 버튼 주변에 둥글게 배치
    ...Array.from({ length: 15 }, (_, i) => {
      const a = (i / 15) * Math.PI * 2 - Math.PI / 2;
      return { name: `spawn${i}`, type: 'spawn', x: Math.round(1915 + Math.cos(a) * 168), y: Math.round(500 + Math.sin(a) * 130) };
    }),
  ],

  emergency: [{ name: 'EmergencyButton', type: 'emergency', x: 1915, y: 495, props: { range: 175 } }],

  tasks: [
    // 공통 미션
    task('wires_electrical', 'wires', 1320, 1225, { room: 'Electrical' }),
    task('wires_storage', 'wires', 1805, 1330, { room: 'Storage' }),
    task('wires_admin', 'wires', 2185, 1150, { room: 'Admin' }),
    task('wires_navigation', 'wires', 3170, 935, { room: 'Navigation' }),
    task('wires_cafeteria', 'wires', 1560, 175, { room: 'Cafeteria' }),
    task('wires_security', 'wires', 790, 880, { room: 'Security' }),
    task('card_admin', 'card', 2535, 1290, { room: 'Admin' }),
    // 긴 미션
    task('asteroids_weapons', 'asteroids', 2765, 470, { room: 'Weapons' }),
    task('align_upper', 'align', 375, 645, { room: 'UpperEngine' }),
    task('align_lower', 'align', 381, 1670, { room: 'LowerEngine' }),
    task('fuel_storage', 'fuel', 1595, 1500, { room: 'Storage' }),
    task('fuel_upper', 'fuel', 447, 640, { room: 'UpperEngine' }),
    task('fuel_lower', 'fuel', 451, 1660, { room: 'LowerEngine' }),
    task('scan_medbay', 'scan', 1345, 985, { room: 'MedBay' }),
    task('reactor_start', 'simon', 255, 1040, { room: 'Reactor' }),
    task('garbage_cafeteria', 'garbage', 2285, 235, { room: 'Cafeteria' }),
    task('garbage_storage', 'garbage', 1962, 1985, { room: 'Storage' }),
    // 짧은 미션
    task('manifolds_reactor', 'manifolds', 120, 790, { room: 'Reactor' }),
    task('shields_prime', 'shields', 2700, 1480, { room: 'Shields' }),
    task('steering_nav', 'steering', 3505, 980, { room: 'Navigation' }),
    task('calibrate_electrical', 'calibrate', 1480, 1225, { room: 'Electrical' }),
    task('download_cafeteria', 'download', 2190, 120, { room: 'Cafeteria' }),
    task('download_weapons', 'download', 2840, 345, { room: 'Weapons' }),
    task('download_nav', 'download', 3425, 1100, { room: 'Navigation' }),
    task('download_comms', 'download', 2215, 1795, { room: 'Communications' }),
    task('download_electrical', 'download', 1395, 1225, { room: 'Electrical' }),
    task('upload_admin', 'upload', 2300, 1150, { room: 'Admin' }),
    task('chart_nav', 'chart', 3425, 860, { room: 'Navigation' }),
    task('o2filter', 'o2filter', 2420, 830, { room: 'O2' }),
    task('divert_electrical', 'divert', 1185, 1225, { room: 'Electrical' }),
  ],

  // 벤트: links 는 연결된 벤트 이름 (원작 스켈드 연결 구조)
  vents: [
    { name: 'AdminVent', type: 'vent', x: 2198, y: 1407, props: { links: 'CafeVent,BigYVent' } },
    { name: 'CafeVent', type: 'vent', x: 2346, y: 590, props: { links: 'AdminVent,BigYVent' } },
    { name: 'BigYVent', type: 'vent', x: 2751, y: 1117, props: { links: 'AdminVent,CafeVent' } },
    { name: 'ElecVent', type: 'vent', x: 1171, y: 1269, props: { links: 'MedVent,SecurityVent' } },
    { name: 'MedVent', type: 'vent', x: 1086, y: 920, props: { links: 'ElecVent,SecurityVent' } },
    { name: 'SecurityVent', type: 'vent', x: 938, y: 1160, props: { links: 'ElecVent,MedVent' } },
    { name: 'UpperEngineVent', type: 'vent', x: 711, y: 364, props: { links: 'UpperReactorVent' } },
    { name: 'UpperReactorVent', type: 'vent', x: 205, y: 850, props: { links: 'UpperEngineVent' } },
    { name: 'LowerEngineVent', type: 'vent', x: 709, y: 1717, props: { links: 'LowerReactorVent' } },
    { name: 'LowerReactorVent', type: 'vent', x: 277, y: 1171, props: { links: 'LowerEngineVent' } },
    { name: 'WeaponsVent', type: 'vent', x: 2725, y: 293, props: { links: 'NavVentNorth' } },
    { name: 'NavVentNorth', type: 'vent', x: 3315, y: 850, props: { links: 'WeaponsVent' } },
    { name: 'ShieldsVent', type: 'vent', x: 2783, y: 1739, props: { links: 'NavVentSouth' } },
    { name: 'NavVentSouth', type: 'vent', x: 3315, y: 1110, props: { links: 'ShieldsVent' } },
  ],

  // 사보타주 수리 지점
  consoles: [
    { name: 'reactor_top', type: 'console', x: 300, y: 860, props: { sabotage: 'reactor' } },
    { name: 'reactor_bottom', type: 'console', x: 300, y: 1225, props: { sabotage: 'reactor' } },
    { name: 'o2_o2', type: 'console', x: 2600, y: 800, props: { sabotage: 'o2' } },
    { name: 'o2_admin', type: 'console', x: 2505, y: 1150, props: { sabotage: 'o2' } },
    { name: 'lights_electrical', type: 'console', x: 1150, y: 1460, props: { sabotage: 'lights' } },
    { name: 'comms_comms', type: 'console', x: 2310, y: 1795, props: { sabotage: 'comms' } },
  ],

  // 관리실 지도 탁자(원작 MapRoomConsole), 보안실 CCTV 책상(SurvConsole) — 원작 위치를 변환한 자리
  monitors: [
    { name: 'AdminMap', type: 'admin', x: 2279, y: 1296 },
    { name: 'SecurityCams', type: 'cams', x: 893, y: 835 },
  ],
  // 감시 카메라 4대: 설치 위치(원작 SurvCamera 노드)와 비추는 복도 한가운데(vx, vy)
  cameras: [
    { name: 'CamNorthHall', type: 'camera', x: 1389, y: 440, props: { vx: 1395, vy: 520 } },
    { name: 'CamAdminHall', type: 'camera', x: 2023, y: 1088, props: { vx: 1995, vy: 1160 } },
    { name: 'CamCrossHall', type: 'camera', x: 512, y: 950, props: { vx: 555, vy: 1010 } },
    { name: 'CamYHall', type: 'camera', x: 3071, y: 898, props: { vx: 3050, vy: 975 } },
  ],

  // 문 13개 (원작 스켈드와 같은 방 구성). 닫히면 사각형 영역이 막힌다.
  doors: [
    { name: 'cafe_left', type: 'door', rect: [1452, 430, 1480, 552], props: { room: 'Cafeteria' } },
    { name: 'cafe_right', type: 'door', rect: [2392, 430, 2420, 552], props: { room: 'Cafeteria' } },
    { name: 'cafe_bottom', type: 'door', rect: [1864, 932, 1996, 960], props: { room: 'Cafeteria' } },
    { name: 'storage_left', type: 'door', rect: [1542, 1760, 1572, 1860], props: { room: 'Storage' } },
    { name: 'storage_right', type: 'door', rect: [2050, 1550, 2084, 1680], props: { room: 'Storage' } },
    { name: 'storage_top', type: 'door', rect: [1864, 1252, 1996, 1280], props: { room: 'Storage' } },
    { name: 'upper_right', type: 'door', rect: [732, 436, 760, 548], props: { room: 'UpperEngine' } },
    { name: 'upper_bottom', type: 'door', rect: [500, 698, 642, 726], props: { room: 'UpperEngine' } },
    { name: 'lower_right', type: 'door', rect: [732, 1520, 760, 1624], props: { room: 'LowerEngine' } },
    { name: 'lower_top', type: 'door', rect: [500, 1310, 642, 1338], props: { room: 'LowerEngine' } },
    { name: 'security', type: 'door', rect: [748, 986, 776, 1094], props: { room: 'Security' } },
    { name: 'electrical', type: 'door', rect: [1134, 1696, 1252, 1724], props: { room: 'Electrical' } },
    { name: 'medbay', type: 'door', rect: [1150, 582, 1282, 608], props: { room: 'MedBay' } },
  ],
};
