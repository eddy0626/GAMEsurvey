/**
 * Chart.gs — 숨김 시트 레이더 차트 생성 및 이미지 추출
 * ============================================================================
 * Apps Script 에는 차트를 그리는 기능이 없다. 대신 구글 시트가 레이더 차트를
 * 기본 지원한다. 숨김 시트 '_charts' 에 데이터를 쓰고 차트를 만든 뒤
 * PNG 블롭으로 뽑아 문서에 넣는다. 외부 서비스를 쓰지 않는다.
 *
 * 두 종류를 만든다.
 *   (1) 게임 6축 평균 1계열      — 종합 리포트용
 *   (2) 응답자 점수 + 전체 평균  — 개별 카드용 (2계열 겹침)
 *
 * ── 왜 차트를 재사용하는가 ──────────────────────────────────────────────
 * 카드 80장을 만들 때 차트를 매번 insertChart / removeChart 하면 시트 쓰기가
 * 160번 일어난다. 대신 모양이 같은 차트를 한 번만 만들어 두고
 * 데이터 범위의 값만 바꾸면 쓰기가 80번으로 줄고 insert/remove 왕복이 사라진다.
 * 범례에 들어갈 응답자 ID 도 데이터 범위의 머리글 칸(B1 · C1)에 있으므로
 * 차트 객체 자체를 손댈 일이 전혀 없다.
 * 실제 소요는 계정마다 다르니 테스트_차트속도비교() 로 직접 재 볼 수 있게 해 뒀다.
 *
 * 재사용 결과가 이상하면(직전 응답자 그래프가 다시 나오는 등)
 * CONFIG.차트.재사용 을 false 로 바꾸면 매번 새로 만드는 방식으로 돈다.
 * ============================================================================
 */

var 차트_ = {
  키_1계열: '차트ID_1계열',
  키_2계열: '차트ID_2계열',
  머리행: 1,          // A1 : 항목 / B1 : 계열1 이름 / C1 : 계열2 이름
  첫데이터행: 2
};

/** _charts 숨김 시트 */
function 차트시트_() {
  var ss = 마스터_(), 이름 = CONFIG.시트.차트;
  var sh = ss.getSheetByName(이름);
  if (!sh) {
    sh = ss.insertSheet(이름);
    sh.hideSheet();
  }
  return sh;
}

/**
 * 차트 데이터 범위에 값을 쓴다.
 * @param 계열이름 ['P05', '전체 평균'] 처럼. 1계열이면 길이 1.
 * @param 축이름   ['재미', '조작성', ...]
 * @param 값들     [[4,3.41], [3,2.93], ...]  행 = 축, 열 = 계열
 */
function 차트데이터쓰기_(sh, 계열이름, 축이름, 값들) {
  var 계열수 = 계열이름.length;
  var 폭 = 1 + 계열수;
  // 이전 계열이 남아 있을 수 있으니 넉넉히 지운다
  sh.getRange(1, 1, 축이름.length + 1, 3).clearContent();

  var 머리 = ['항목'].concat(계열이름);
  var 본문 = [];
  for (var i = 0; i < 축이름.length; i++) {
    var 줄 = [축이름[i]];
    for (var j = 0; j < 계열수; j++) 줄.push(값들[i][j]);
    본문.push(줄);
  }
  sh.getRange(1, 1, 1, 폭).setValues([머리]);
  sh.getRange(차트_.첫데이터행, 1, 본문.length, 폭).setValues(본문);
  return sh.getRange(1, 1, 본문.length + 1, 폭);
}

/** 레이더 차트 빌더에 공통 옵션을 건다 */
function 차트옵션_(빌더, 계열수) {
  var C = CONFIG.차트;
  var 색 = 계열수 === 1 ? [C.색_게임] : [C.색_본인, C.색_전체평균];
  빌더
    .setChartType(Charts.ChartType.RADAR)
    .setOption('width', C.폭)
    .setOption('height', C.높이)
    .setOption('title', '')
    .setOption('backgroundColor', '#FFFFFF')
    .setOption('colors', 색)
    .setOption('legend', 계열수 === 1 ? 'none' : { position: 'bottom', textStyle: { fontSize: 11 } })
    .setOption('fontName', 'Malgun Gothic')
    .setOption('fontSize', 11)
    // 세로축 0~5 고정 — 게임 간 비교가 가능해야 한다.
    // 레이더 차트는 축 옵션 지원이 완전하지 않아 점 표기와 범위를 함께 건다.
    .setOption('vAxis.viewWindow.min', C.축최소)
    .setOption('vAxis.viewWindow.max', C.축최대)
    .setOption('vAxis.minValue', C.축최소)
    .setOption('vAxis.maxValue', C.축최대)
    .setOption('vAxis.ticks', [0, 1, 2, 3, 4, 5])
    .setOption('chartArea', { left: 40, top: 20, width: '82%', height: '82%' });
  return 빌더;
}

/** 차트 ID 로 시트에서 차트를 찾는다 */
function 차트찾기_(sh, id) {
  if (!id) return null;
  var cs = sh.getCharts();
  for (var i = 0; i < cs.length; i++) {
    if (String(cs[i].getChartId()) === String(id)) return cs[i];
  }
  return null;
}

/**
 * 계열 수에 맞는 재사용 차트를 확보한다. 없으면 만든다.
 * @return EmbeddedChart
 */
function 재사용차트확보_(sh, 범위, 계열수) {
  var props = PropertiesService.getDocumentProperties();
  var 키 = 계열수 === 1 ? 차트_.키_1계열 : 차트_.키_2계열;
  var 기존 = 차트찾기_(sh, props.getProperty(키));
  if (기존) return 기존;

  var 빌더 = sh.newChart();
  차트옵션_(빌더, 계열수);
  빌더.addRange(범위)
      .setNumHeaders(1)
      .setPosition(2, 5 + (계열수 - 1) * 9, 0, 0);   // 데이터 오른쪽에 나란히
  var 차트 = 빌더.build();
  sh.insertChart(차트);
  SpreadsheetApp.flush();

  // insertChart 뒤에 다시 읽어야 chartId 가 잡힌다
  var cs = sh.getCharts();
  var 새것 = cs[cs.length - 1];
  props.setProperty(키, String(새것.getChartId()));
  return 새것;
}

/**
 * 레이더 차트 PNG 블롭을 만든다. 이 파일의 유일한 공개 함수.
 * @param 계열이름 ['P05','전체 평균'] 또는 ['미스트월드']
 * @param 축이름   6개
 * @param 값들     [[본인,평균], ...] 또는 [[평균], ...]
 * @return Blob (image/png)
 */
function 레이더차트PNG_(계열이름, 축이름, 값들) {
  var sh = 차트시트_();
  var 계열수 = 계열이름.length;
  var 범위 = 차트데이터쓰기_(sh, 계열이름, 축이름, 값들);

  var 차트;
  if (CONFIG.차트.재사용 === false) {
    var 빌더 = sh.newChart();
    차트옵션_(빌더, 계열수);
    빌더.addRange(범위).setNumHeaders(1).setPosition(2, 5, 0, 0);
    차트 = 빌더.build();
    sh.insertChart(차트);
    SpreadsheetApp.flush();
    var cs = sh.getCharts();
    차트 = cs[cs.length - 1];
  } else {
    차트 = 재사용차트확보_(sh, 범위, 계열수);
    SpreadsheetApp.flush();   // 바뀐 값이 차트에 반영되도록 커밋
  }

  var blob = 차트블롭_(차트);

  if (CONFIG.차트.재사용 === false) sh.removeChart(차트);
  return blob;
}

/**
 * EmbeddedChart → PNG Blob.
 * 기본은 getAs('image/png'). getAs 가 서식(축 범위·색)을 뭉갤 때만
 * CONFIG.차트.고해상도URL사용 을 켜서 시트 내보내기 엔드포인트를 쓴다.
 * ※ 그 경로는 appsscript.json 에 script.external_request 스코프가 필요하다.
 *   (기본 매니페스트에는 넣지 않았다 — 외부 호출 없이 돌리는 것이 원칙이므로)
 */
function 차트블롭_(차트) {
  if (CONFIG.차트.고해상도URL사용) {
    var ssId = 마스터_().getId();
    var url = 'https://docs.google.com/spreadsheets/d/' + ssId +
              '/embed/oimg?access_token=' + ScriptApp.getOAuthToken() +
              '&disposition=ATTACHMENT&bo=false&filetype=png&oid=' + 차트.getChartId();
    return UrlFetchApp.fetch(url).getBlob().setName('radar.png');
  }
  return 차트.getAs('image/png').setName('radar.png');
}

// ── 리포트 · 카드가 부르는 두 가지 ──────────────────────────────────────────

/**
 * (1) 종합 리포트용 — 게임 6축 평균 1계열
 * @param 지표 지표계산_() 결과
 */
function 게임레이더PNG_(지표, 게임명) {
  var 축 = [], 값 = [];
  for (var i = 0; i < 지표.육각.length; i++) {
    축.push(지표.육각[i].이름);
    값.push([지표.육각[i].평균 === null ? 0 : 지표.육각[i].평균]);
  }
  return 레이더차트PNG_([게임명], 축, 값);
}

/**
 * (2) 개별 카드용 — 응답자 점수 + 전체 평균 2계열 겹침
 * @param 응답 파싱된 응답 한 건
 * @param 지표 같은 게임의 전체 지표
 */
function 개인레이더PNG_(응답, 지표) {
  var 축 = [], 값 = [];
  for (var i = 0; i < 지표.육각.length; i++) {
    축.push(지표.육각[i].이름);
    값.push([
      응답.육각[i] === null ? 0 : 응답.육각[i],
      지표.육각[i].평균 === null ? 0 : 지표.육각[i].평균
    ]);
  }
  return 레이더차트PNG_([응답.ID || '본인', '전체 평균'], 축, 값);
}

// ── 정리 ────────────────────────────────────────────────────────────────────

/** _charts 의 차트를 전부 지운다. 배치 종료 시 · 메뉴에서 호출. */
function 차트정리_() {
  var sh = 차트시트_();
  var cs = sh.getCharts();
  for (var i = 0; i < cs.length; i++) sh.removeChart(cs[i]);
  var props = PropertiesService.getDocumentProperties();
  props.deleteProperty(차트_.키_1계열);
  props.deleteProperty(차트_.키_2계열);
  sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 3).clearContent();
  return cs.length;
}

// ── 점검용 ──────────────────────────────────────────────────────────────────

/**
 * 레이더 차트 이미지 3장을 드라이브에 저장한다. 눈으로 확인하는 용도.
 *   · 1계열 (게임 평균)
 *   · 2계열 (응답자 vs 평균)
 *   · 극단값 (전부 1점 / 전부 5점) — 축 0~5 고정이 먹었는지 확인
 * 실행 후 실행 로그(Ctrl+Enter)에 저장 위치가 찍힌다.
 */
function 테스트_차트이미지저장() {
  var 축 = [];
  for (var i = 0; i < CONFIG.육각축.length; i++) 축.push(CONFIG.육각축[i].이름);

  var 폴더 = 저장폴더_();
  var 저장 = [];

  저장.push(폴더.createFile(
    레이더차트PNG_(['미스트월드'], 축, [[3.67], [2.93], [4.40], [3.73], [2.53], [3.20]])
      .setName('차트점검_1계열_게임평균.png')));

  저장.push(폴더.createFile(
    레이더차트PNG_(['P05', '전체 평균'], 축,
      [[2, 3.67], [2, 2.93], [4, 4.40], [2, 3.73], [2, 2.53], [2, 3.20]])
      .setName('차트점검_2계열_응답자대평균.png')));

  저장.push(폴더.createFile(
    레이더차트PNG_(['최저 1점', '최고 5점'], 축,
      [[1, 5], [1, 5], [1, 5], [1, 5], [1, 5], [1, 5]])
      .setName('차트점검_축범위_1점대5점.png')));

  var 줄 = [];
  for (var j = 0; j < 저장.length; j++) 줄.push(저장[j].getName() + '  →  ' + 저장[j].getUrl());
  var 메시지 = '차트 이미지 3장을 저장했습니다.\n\n' + 줄.join('\n') +
               '\n\n확인할 것\n' +
               ' 1. 육각형(6각)으로 그려졌는가\n' +
               ' 2. 축 순서가 재미 → 조작성 → 그래픽·아트 → 몰입도 → 완성도 → 정식 출시 기대감 인가\n' +
               ' 3. 세 번째 이미지에서 바깥 테두리가 5점인가 (0~5 고정이 먹었는지)\n' +
               ' 4. 두 번째 이미지에서 두 계열이 겹쳐 보이고 범례에 P05 · 전체 평균이 뜨는가\n' +
               ' 5. 글자가 깨지지 않는가';
  Logger.log(메시지);
  try { SpreadsheetApp.getUi().alert('차트 점검', 메시지, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return 저장;
}

/**
 * 재사용 방식과 매번 새로 만드는 방식의 소요 시간을 직접 잰다.
 * 카드 80장 기준 총 소요를 추정해 로그에 찍는다.
 */
function 테스트_차트속도비교() {
  var 축 = [];
  for (var i = 0; i < CONFIG.육각축.length; i++) 축.push(CONFIG.육각축[i].이름);
  var 값 = [[4, 3.67], [3, 2.93], [5, 4.40], [4, 3.73], [4, 2.53], [2, 3.20]];
  var 반복 = 5;
  var 원래 = CONFIG.차트.재사용;

  차트정리_();
  CONFIG.차트.재사용 = true;
  var t1 = new Date();
  for (var a = 0; a < 반복; a++) 레이더차트PNG_(['P' + a, '전체 평균'], 축, 값);
  var 재사용ms = (new Date() - t1) / 반복;

  차트정리_();
  CONFIG.차트.재사용 = false;
  var t2 = new Date();
  for (var b = 0; b < 반복; b++) 레이더차트PNG_(['P' + b, '전체 평균'], 축, 값);
  var 재생성ms = (new Date() - t2) / 반복;

  CONFIG.차트.재사용 = 원래;
  차트정리_();

  var 메시지 =
    '차트 1장 생성 소요 (' + 반복 + '회 평균)\n' +
    '  재사용    ' + 반올림_(재사용ms, 0) + ' ms   → 80장 ' + 반올림_(재사용ms * 80 / 1000, 1) + '초\n' +
    '  매번 생성 ' + 반올림_(재생성ms, 0) + ' ms   → 80장 ' + 반올림_(재생성ms * 80 / 1000, 1) + '초\n\n' +
    '빠른 쪽: ' + (재사용ms <= 재생성ms ? '재사용' : '매번 생성') +
    '  → CONFIG.차트.재사용 = ' + (재사용ms <= 재생성ms) ;
  Logger.log(메시지);
  try { SpreadsheetApp.getUi().alert('차트 속도 비교', 메시지, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return { 재사용ms: 재사용ms, 재생성ms: 재생성ms };
}

/** 산출물 저장 폴더 — 루트폴더ID 가 비었으면 마스터 시트가 있는 폴더 */
function 저장폴더_() {
  if (CONFIG.드라이브.루트폴더ID) return DriveApp.getFolderById(CONFIG.드라이브.루트폴더ID);
  var 부모 = DriveApp.getFileById(마스터_().getId()).getParents();
  return 부모.hasNext() ? 부모.next() : DriveApp.getRootFolder();
}
