// 미라 HQ 맵 데이터 (좌표 단위: client/assets/map/mira.webp 픽셀, 3322×2699)
//
// 고증 기준
// - 배경 그림: 원작 MiraShip 프리팹의 노드 위치(itsssskye/amongus-assets PrefabHierarchyObject)에
//   원작 스프라이트(Sprite/*.json + Texture2D)를 놓아 다시 조립했다 (도구: docs/maps.md 참고).
//   이 조립은 원작 유닛 1 = 80px 이고, 원작 좌표 (x, y) → 그림 픽셀은 W(x, y) 로 바꾼다.
// - 미션 지점, 벤트 위치와 연결 구조: SkeldJS packages/constant 의 mapTasksData / mapVentData (MiraHQ) 수치.
//   SkeldJS 에 좌표가 비어 있는 미션(물 주기, 항로 설정, 연료, 쓰레기)과 사보타주 장치는 프리팹의 콘솔 노드 위치를 썼다.
// - 걸을 수 있는 바닥(floors)과 가구(obstacles)는 조립한 그림을 보고 직접 잡았다. 문틀(회색 이중선)이 있는 곳만 드나들 수 있다.
//
// 이 파일을 고친 뒤 `npm run build:maps` 를 실행하면 shared/maps/mira.tmj 가 다시 만들어진다.

export const META = {
  mapId: 'mira',
  displayName: '미라 HQ',
  image: 'assets/map/mira.webp',
  minimap: 'assets/map/mira-minimap.png',
  source: 'MIRA HQ reassembled from original prefab + sprites (github.com/itsssskye/amongus-assets); task/vent data from SkeldJS',
  commsMode: 'keypad',
  reactorTime: 45, // 원작 미라 HQ 원자로 붕괴 45초
};
export const WIDTH = 3322;
export const HEIGHT = 2699;
export const CELL = 8;

/** 원작 좌표(유닛) → 그림 픽셀 */
const W = (x, y) => ({ x: Math.round(80 * x + 981), y: Math.round(2363 - 80 * y) });

// 걸을 수 있는 바닥. 이 밖은 모두 벽이다
export const floors = [
  // 발사대와 아래 복도 (초록 → 회색 → 붉은 카펫)
  { rect: [60, 1710, 965, 2362] },
  { rect: [485, 2355, 760, 2570] },
  { rect: [760, 2420, 1280, 2570] },
  { rect: [1280, 2415, 1880, 2540] },
  // 나무 복도와 Y자 복도 (사무실·관리실 사이 통로까지)
  { rect: [1880, 1745, 2068, 2540] },
  { poly: [[1880, 1745], [2000, 1745], [2320, 1430], [2320, 620], [2497, 620], [2497, 1430], [2815, 1745], [2935, 1745], [2935, 1925], [2750, 1925], [2750, 1870], [2405, 1530], [2075, 1858], [1880, 1858]] },
  // 온실 (반원형 격자 바닥)
  { poly: [[2010, 430], [2150, 350], [2400, 320], [2600, 320], [2700, 350], [2810, 430], [2810, 614], [2010, 614]] },
  // 사무실, 관리실 + 문
  { rect: [2015, 690, 2305, 1015] }, { rect: [2300, 940, 2325, 1020] },
  { rect: [2510, 690, 2800, 1000] }, { rect: [2490, 812, 2515, 895] },
  // 원자로 + 문, 연구실 복도, 연구실 + 문
  { rect: [995, 1140, 1370, 1590] }, { rect: [1360, 1500, 1390, 1590] },
  { rect: [1385, 1195, 1560, 1570] },
  { rect: [1568, 1232, 1950, 1585] }, { rect: [1550, 1195, 1575, 1285] },
  // 오염 제거실 (위 칸 → 통로 → 아래 칸)
  { rect: [1385, 1570, 1560, 1655] }, { rect: [1400, 1650, 1540, 2105] }, { rect: [1385, 2100, 1560, 2190] },
  // 탈의실 + 문
  { rect: [1285, 2135, 1650, 2190] }, { rect: [1285, 2185, 1870, 2350] }, { rect: [1650, 1940, 1870, 2190] },
  { rect: [1860, 2000, 1890, 2090] },
  // 통신실, 의무실 + 문
  { rect: [2085, 1950, 2345, 2160] }, { rect: [2060, 2000, 2090, 2090] },
  { rect: [2085, 2180, 2345, 2540] }, { rect: [2060, 2300, 2090, 2395] },
  // 창고 → 식당, 식당 → 발코니
  { rect: [2420, 1950, 2668, 2240] }, { rect: [2495, 2235, 2590, 2305] },
  { rect: [2680, 1920, 3310, 2405] }, { rect: [2420, 2300, 2680, 2405] },
  { rect: [2650, 2400, 2835, 2465] }, { rect: [2930, 2400, 3120, 2465] },
  { rect: [2640, 2460, 3310, 2585] }, { rect: [2415, 2450, 2640, 2665] },
];

// 바닥 위의 가구·기계 (이동만 막고 시야는 막지 않는다)
export const obstacles = [
  // 발사대: 로켓 본체와 양쪽 엔진, 연료 탱크, 상자, 콘솔
  { rect: [405, 1700, 830, 1990] }, { rect: [230, 1690, 405, 1985] }, { rect: [830, 1690, 1000, 1975] },
  { rect: [235, 2020, 430, 2280] },
  { rect: [115, 2210, 260, 2345] }, { rect: [370, 2285, 425, 2345] }, { rect: [815, 1950, 960, 2100] }, { rect: [780, 2160, 910, 2350] },
  { rect: [435, 2145, 490, 2245] }, { rect: [760, 2170, 815, 2265] },
  // 연구실 복도 상자, 원자로 노심과 양옆 콘솔
  { rect: [1385, 1165, 1445, 1265] },
  { rect: [1085, 1140, 1285, 1365] }, { rect: [995, 1210, 1030, 1500] }, { rect: [1340, 1210, 1370, 1450] },
  // 연구실 작업대
  { rect: [1768, 1287, 1948, 1360] }, { rect: [1885, 1287, 1948, 1455] }, { rect: [1633, 1437, 1820, 1512] },
  // 사무실 책상, 관리실 지도 탁자
  { rect: [2040, 805, 2125, 850] }, { rect: [2015, 895, 2140, 990] }, { rect: [2270, 825, 2305, 915] },
  { rect: [2560, 765, 2750, 955] },
  // 온실 화분과 가운데 식물 수조
  { rect: [2165, 335, 2280, 380] }, { rect: [2100, 410, 2210, 440] }, { rect: [2115, 455, 2230, 500] }, { rect: [2235, 460, 2355, 505] },
  { rect: [2455, 455, 2570, 500] }, { rect: [2550, 375, 2665, 405] }, { rect: [2610, 445, 2730, 495] }, { rect: [2345, 300, 2470, 360] },
  // 통신실 오른쪽 책상
  { rect: [2315, 1995, 2345, 2160] },
  // 의무실 침대 (스캐너는 올라서는 장치라 막지 않는다)
  { rect: [2085, 2195, 2145, 2290] }, { rect: [2195, 2195, 2255, 2290] }, { rect: [2280, 2195, 2340, 2290] },
  { rect: [2090, 2405, 2155, 2540] }, { rect: [2260, 2405, 2340, 2540] },
  // 창고 상자와 선반
  { rect: [2440, 1950, 2500, 1985] }, { rect: [2505, 2055, 2665, 2150] }, { rect: [2615, 2145, 2668, 2220] },
  // 식당 탁자 2개, 자판기, 오른쪽 조리대
  { rect: [2832, 2045, 2978, 2290] }, { rect: [3060, 2045, 3205, 2290] }, { rect: [3220, 1920, 3290, 1950] }, { rect: [3280, 1945, 3310, 2280] },
  // 발코니 위성 안테나
  { ellipse: [2490, 2560, 80, 60] },
  // 탈의실 벤치와 사물함
  { rect: [1750, 1985, 1820, 2020] }, { rect: [1655, 2100, 1680, 2185] }, { rect: [1840, 2260, 1870, 2340] },
  { rect: [1845, 2105, 1870, 2255] }, { rect: [1650, 1950, 1680, 2100] },
];

export const openings = [];

const task = (name, taskType, p, room) => ({ name, type: 'task', x: p.x, y: p.y, props: { taskType, room } });

export const objects = {
  rooms: [
    { name: 'Launchpad', type: 'room', rect: [0, 1650, 1000, 2370] },
    { name: 'LockerRoom', type: 'room', rect: [1285, 1930, 1875, 2355] },
    { name: 'Decontamination', type: 'room', rect: [1380, 1570, 1560, 2135] },
    { name: 'Reactor', type: 'room', rect: [990, 1100, 1375, 1595] },
    { name: 'Laboratory', type: 'room', rect: [1565, 1190, 1955, 1590] },
    { name: 'MedBay', type: 'room', rect: [2080, 2170, 2350, 2545] },
    { name: 'Communications', type: 'room', rect: [2080, 1870, 2350, 2165] },
    { name: 'Storage', type: 'room', rect: [2415, 1870, 2675, 2245] },
    { name: 'Cafeteria', type: 'room', rect: [2415, 1870, 3315, 2410] },
    { name: 'Balcony', type: 'room', rect: [2400, 2410, 3315, 2670] },
    { name: 'Admin', type: 'room', rect: [2505, 615, 2805, 1005] },
    { name: 'Office', type: 'room', rect: [2010, 615, 2310, 1020] },
    { name: 'Greenhouse', type: 'room', rect: [2005, 20, 2810, 615] },
  ],

  spawn: [
    // 회의 뒤: 식당 탁자 위아래 줄
    ...Array.from({ length: 8 }, (_, i) => ({ name: `spawn${i}`, type: 'spawn', x: 2760 + i * 68, y: 1990 })),
    ...Array.from({ length: 7 }, (_, i) => ({ name: `spawn${8 + i}`, type: 'spawn', x: 2790 + i * 72, y: 2345 })),
    // 연습 모드 더미 크루원 (원작 프리팹 DummyLocations 6곳)
    ...[[10.42, 1.56], [20.11, 4.8], [19.76, -3.01], [10.94, 12.27], [21.03, 23.12], [22.3, 17.42]]
      .map(([x, y], i) => ({ name: `dummy${i}`, type: 'dummy', ...W(x, y) })),
    // 게임 시작: 원작처럼 발사대 노란 원 주변
    ...Array.from({ length: 15 }, (_, i) => {
      const a = (i / 15) * Math.PI * 2 - Math.PI / 2;
      return { name: `start${i}`, type: 'startSpawn', x: Math.round(622 + Math.cos(a) * 110), y: Math.round(2175 + Math.sin(a) * 95) };
    }),
  ],

  // 식당 왼쪽 탁자 위 비상 버튼 (EmergencyConsole)
  emergency: [{ name: 'EmergencyButton', type: 'emergency', ...W(24.04, 1.66), props: { range: 175 } }],

  tasks: [
    // 공통
    task('wires_storage', 'wires', W(18.39, 1.2), 'Storage'),
    task('wires_hallway', 'wires', W(12.1, 8.04), 'Hallway'),
    task('wires_lab', 'wires', W(6.12, 14.96), 'Laboratory'),
    task('wires_locker', 'wires', W(4.36, 2.53), 'LockerRoom'),
    task('wires_greenhouse', 'wires', W(16.98, 21.39), 'Greenhouse'),
    task('idcode_admin', 'idcode', W(19.89, 19.02), 'Admin'),
    // 긴 미션
    task('scan_medbay', 'scan', W(16.23, 0.26), 'MedBay'),
    task('asteroids_balcony', 'asteroids', W(19.21, -2.41), 'Balcony'),
    task('reactor_start', 'simon', W(2.55, 12.41), 'Reactor'),
    task('divert_reactor', 'divert', W(0.78, 11.48), 'Reactor'),
    task('water_storage', 'water', W(19.62, 5.16), 'Storage'),
    task('water_greenhouse', 'water', W(20.49, 22.78), 'Greenhouse'),
    // 전력 받기 (프리팹 DivertPowerConsole 위치)
    task('accept_launchpad', 'divertAccept', W(-6.33, 0.92), 'Launchpad'),
    task('accept_cafeteria', 'divertAccept', W(21.63, 5.81), 'Cafeteria'),
    task('accept_lab', 'divertAccept', W(7.67, 14.91), 'Laboratory'),
    task('accept_comms', 'divertAccept', W(14.0, 5.86), 'Communications'),
    task('accept_medbay', 'divertAccept', W(14.83, 2.03), 'MedBay'),
    task('accept_admin', 'divertAccept', W(20.28, 21.38), 'Admin'),
    task('accept_office', 'divertAccept', W(16.19, 20.01), 'Office'),
    task('accept_greenhouse', 'divertAccept', W(13.85, 22.87), 'Greenhouse'),
    // 짧은 미션
    task('chart_admin', 'chart', W(22.23, 21.23), 'Admin'),
    task('shields_admin', 'shields', W(21.17, 17.95), 'Admin'),
    task('o2filter_greenhouse', 'o2filter', W(17.22, 24.51), 'Greenhouse'),
    task('gascan_launchpad', 'gascan', W(-6.43, 2.26), 'Launchpad'),
    // 로켓 주입구: 프리팹에 좌표가 없어 로켓 아래쪽 중앙에 두었다
    task('rocket_launchpad', 'rocket', { x: 617, y: 2000 }, 'Launchpad'),
    task('artifact_lab', 'artifact', W(9.4, 14.57), 'Laboratory'),
    task('samples_lab', 'samples', W(9.66, 11.12), 'Laboratory'),
    task('garbage_cafeteria', 'garbage', W(25.35, 5.82), 'Cafeteria'),
    task('weather_balcony', 'weather', W(28.91, -1.7), 'Balcony'),
    task('beverage_cafeteria', 'beverage', W(27.49, 5.67), 'Cafeteria'),
    task('process_office', 'process', W(15.78, 21.4), 'Office'),
    task('diagnostics_launchpad', 'diagnostics', W(-2.5, 1.87), 'Launchpad'),
    task('manifolds_reactor', 'manifolds', W(0.44, 13.26), 'Reactor'),
  ],

  // 벤트 11개 — 원작 미라 HQ 연결 (SkeldJS mapVentData MiraHQ 의 left/center/right)
  vents: [
    { name: 'BalconyVent', type: 'vent', ...W(23.77, -1.94), props: { links: 'MedVent,YHallRightVent' } },
    { name: 'YHallRightVent', type: 'vent', ...W(23.9, 7.18), props: { links: 'AdminVent,BalconyVent' } },
    { name: 'ReactorVent', type: 'vent', ...W(0.48, 10.7), props: { links: 'LabVent,DeconVent,LaunchVent' } },
    { name: 'LabVent', type: 'vent', ...W(11.61, 13.82), props: { links: 'ReactorVent,DeconVent,OfficeVent' } },
    { name: 'OfficeVent', type: 'vent', ...W(13.28, 20.13), props: { links: 'LabVent,AdminVent,AgriVent' } },
    { name: 'AdminVent', type: 'vent', ...W(22.39, 17.23), props: { links: 'AgriVent,YHallRightVent,OfficeVent' } },
    { name: 'AgriVent', type: 'vent', ...W(17.85, 25.23), props: { links: 'AdminVent,OfficeVent' } },
    { name: 'MedVent', type: 'vent', ...W(15.41, -1.82), props: { links: 'BalconyVent,LockerVent' } },
    { name: 'DeconVent', type: 'vent', ...W(6.83, 3.15), props: { links: 'ReactorVent,LockerVent,LabVent' } },
    { name: 'LockerVent', type: 'vent', ...W(4.29, 0.53), props: { links: 'MedVent,LaunchVent,DeconVent' } },
    { name: 'LaunchVent', type: 'vent', ...W(-6.18, 3.56), props: { links: 'ReactorVent,LockerVent' } },
  ],

  // 사보타주 수리 지점 (원작 미라 HQ: 원자로 손바닥 2, 산소 키패드 2(탈의실·온실), 전등(사무실), 통신 키패드 2(통신실·사무실))
  consoles: [
    { name: 'reactor_left', type: 'console', ...W(0.7, 14.95), props: { sabotage: 'reactor' } },
    { name: 'reactor_right', type: 'console', ...W(4.6, 14.96), props: { sabotage: 'reactor' } },
    { name: 'o2_greenhouse', type: 'console', ...W(17.86, 24.37), props: { sabotage: 'o2' } },
    { name: 'o2_locker', type: 'console', ...W(4.09, -0.3), props: { sabotage: 'o2' } },
    { name: 'lights_office', type: 'console', ...W(14.8, 21.38), props: { sabotage: 'lights' } },
    { name: 'comms_comms', type: 'console', ...W(14.93, 5.65), props: { sabotage: 'comms' } },
    { name: 'comms_office', type: 'console', ...W(13.67, 19.35), props: { sabotage: 'comms' } },
  ],

  // 원작 미라 HQ 에는 닫을 수 있는 문이 없다
  doors: [],
};
