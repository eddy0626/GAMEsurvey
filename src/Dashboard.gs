/**
 * Dashboard.gs — 응답 현황 대시보드
 * ============================================================================
 * 테스트 진행 중 담당자가 보는 화면. 문서를 만들지 않고 시트에서 바로 본다.
 *   · 게임별 응답 수 / 목표 대비 진행률
 *   · '진행이 불가능할 정도' 버그 신고 — 테스트 중 대응이 필요한 유일한 항목
 *   · 미제출자 명단 (명부와 대조)
 *   · 게임별 6축 평균
 *   · 이슈 플래그가 켜진 항목
 *
 * 이 시트는 담당자용 내부 화면이라 미제출자 이름을 띄운다(연락해야 하므로).
 * 카드 · 리포트 · PDF 등 밖으로 나가는 산출물에는 실명이 절대 들어가지 않는다.
 * ============================================================================
 */

var DASH = {
  강조: '#1A73E8', 연회색: '#5F6368', 카드배경: '#F1F6FB',
  위험: '#FDE7E9', 위험글: '#B3261E',
  주의: '#FFF4E5', 주의글: '#B45309',
  양호: '#EAF7EF', 양호글: '#1E7A45'
};

/** 메뉴에서 부르는 진입점 — 집계까지 다시 돌린다 */
function 대시보드새로고침() {
  var 결과 = 집계실행();
  SpreadsheetApp.getActive().toast('집계와 대시보드를 갱신했습니다.', '플레이테스트', 5);
  return 결과;
}

/**
 * 대시보드를 그린다.
 * @param 결과 집계실행() 이 돌려준 게임별 결과
 * @param 명부 명부읽기_() 결과
 * @param 경고 문자열 배열
 */
function 대시보드갱신_(결과, 명부, 경고) {
  var cfg = CONFIG;
  var ss = 마스터_();
  var sh = ss.getSheetByName(cfg.시트.대시보드);
  var 처음만듦 = false;
  if (!sh) {
    sh = ss.insertSheet(cfg.시트.대시보드, 0);
    처음만듦 = true;
  }
  sh.clear();
  sh.clearConditionalFormatRules();
  // clear() 는 병합을 풀지 않는다. 풀지 않고 다시 그리면 구역 길이가 달라졌을 때
  // "이미 병합된 셀과 겹칩니다" 오류가 난다. 그리기 전에 전부 해제한다.
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  var 차트들 = sh.getCharts();
  for (var i0 = 0; i0 < 차트들.length; i0++) sh.removeChart(차트들[i0]);

  sh.setHiddenGridlines(true);
  sh.setColumnWidth(1, 30);
  var 폭 = [200, 130, 70, 70, 90, 90, 70, 90, 80, 150];
  for (var w = 0; w < 폭.length; w++) sh.setColumnWidth(w + 2, 폭[w]);

  var 행 = 1;
  행 = 제목_(sh, 행);
  행 = 게임현황_(sh, 행, 결과, 명부);
  행 = 즉시대응_(sh, 행, 결과);
  행 = 미제출자_(sh, 행, 결과, 명부);
  행 = 플래그목록_(sh, 행, 결과);
  행 = 경고목록_(sh, 행, 경고);

  sh.setFrozenRows(2);
  // 맨 앞으로 옮기는 것은 처음 만들 때만. 새로고침할 때마다 보던 탭을 뺏지 않는다.
  if (처음만듦 && sh.getIndex() !== 1) {
    var 보던탭 = ss.getActiveSheet();
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(1);
    if (보던탭) ss.setActiveSheet(보던탭);
  }
}

// ── 구역별 그리기 ───────────────────────────────────────────────────────────

function 제목_(sh, 행) {
  sh.getRange(행, 2, 1, 10).merge()
    .setValue('플레이테스트 응답 현황')
    .setFontSize(18).setFontWeight('bold').setFontColor('#202124')
    .setVerticalAlignment('middle');
  sh.setRowHeight(행, 34);
  행++;
  sh.getRange(행, 2, 1, 10).merge()
    .setValue('2026 충북 인디게임 플레이테스트  ·  마지막 갱신 ' +
              Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'))
    .setFontSize(9).setFontColor(DASH.연회색);
  return 행 + 2;
}

function 구역제목_(sh, 행, 텍스트, 부연) {
  sh.getRange(행, 2, 1, 10).merge().setValue(텍스트)
    .setFontSize(12).setFontWeight('bold').setFontColor(DASH.강조);
  sh.setRowHeight(행, 26);
  행++;
  if (부연) {
    sh.getRange(행, 2, 1, 10).merge().setValue(부연).setFontSize(8.5).setFontColor(DASH.연회색);
    행++;
  }
  return 행;
}

function 표머리_(sh, 행, 헤더) {
  sh.getRange(행, 2, 1, 헤더.length).setValues([헤더])
    .setFontWeight('bold').setFontSize(9).setBackground(DASH.카드배경).setFontColor('#202124');
  return 행 + 1;
}

function 게임현황_(sh, 행, 결과, 명부) {
  var cfg = CONFIG;
  var 목표 = cfg.대시보드.목표응답수 || 명부.목록.length || 0;

  행 = 구역제목_(sh, 행, '1. 게임별 응답 현황',
                 목표 ? ('목표 ' + 목표 + '명 기준 (명부 등록 인원)') : '명부가 비어 있어 목표 대비 진행률을 낼 수 없습니다. _명부 시트에 참가자를 등록해 주세요.');
  행 = 표머리_(sh, 행, ['게임', '개발사', '응답', '목표', '진행률', '6축 평균', 'NPS', 'Critical', 'High', '비고']);

  var 시작 = 행, 값 = [], 배경 = [];
  for (var i = 0; i < 결과.length; i++) {
    var R = 결과[i], m = R.지표;
    var n = (R.응답 || []).length;
    var crit = 0, high = 0;
    for (var j = 0; j < (R.플래그 || []).length; j++) {
      if (R.플래그[j].심각도 === 'Critical') crit++;
      else if (R.플래그[j].심각도 === 'High') high++;
    }
    값.push([
      R.게임.게임명, R.게임.개발사, n, 목표 || '',
      목표 ? (n / 목표) : '',
      (m && m.육각총평균 !== null) ? m.육각총평균 : '',
      (m && m.NPS.값 !== null) ? m.NPS.값 : '',
      crit || '', high || '',
      R.오류 ? R.오류 : (n === 0 ? '응답 없음' : '')
    ]);
    var 색 = R.오류 ? DASH.위험 : (목표 && n >= 목표 ? DASH.양호 : (n === 0 ? DASH.위험 : '#FFFFFF'));
    var 줄 = []; for (var k = 0; k < 10; k++) 줄.push(색);
    배경.push(줄);
  }
  if (값.length) {
    sh.getRange(시작, 2, 값.length, 10).setValues(값).setFontSize(9).setBackgrounds(배경);
    sh.getRange(시작, 6, 값.length, 1).setNumberFormat('0%');
    sh.getRange(시작, 7, 값.length, 1).setNumberFormat('0.00');
    행 += 값.length;
  }
  return 행 + 1;
}

function 즉시대응_(sh, 행, 결과) {
  var cfg = CONFIG;
  var 항목 = [];
  for (var i = 0; i < 결과.length; i++) {
    var R = 결과[i];
    for (var j = 0; j < (R.응답 || []).length; j++) {
      var r = R.응답[j];
      if (r.버그경험 === cfg.버그선택지.진행불가) {
        항목.push([R.게임.게임명, r.ID, r.유형,
                   r.버그상황 || '(버그 상황 서술 없음 — 응답자에게 확인 필요)',
                   r.타임스탬프]);
      }
    }
  }

  행 = 구역제목_(sh, 행, '2. 즉시 대응 — 진행 불가 버그 신고',
                 '테스트 중에 바로 움직여야 하는 유일한 항목입니다. 나머지는 마감 후에 봐도 됩니다.');

  if (!항목.length) {
    sh.getRange(행, 2, 1, 10).merge()
      .setValue('진행 불가 버그 신고가 없습니다.')
      .setFontSize(9.5).setBackground(DASH.양호).setFontColor(DASH.양호글);
    return 행 + 2;
  }

  행 = 표머리_(sh, 행, ['게임', 'ID', '유형', '버그 상황', '제출 시각', '', '', '', '', '']);
  var 값 = [];
  for (var k = 0; k < 항목.length; k++) 값.push(항목[k].concat(['', '', '', '', '']));
  sh.getRange(행, 2, 값.length, 10).setValues(값).setFontSize(9)
    .setBackground(DASH.위험).setFontColor(DASH.위험글).setWrap(true);
  return 행 + 값.length + 1;
}

function 미제출자_(sh, 행, 결과, 명부) {
  var cfg = CONFIG;
  행 = 구역제목_(sh, 행, '3. 미제출자',
                 cfg.대시보드.미제출자표시
                   ? '명부에 있는데 응답이 없는 사람입니다. 연락용이라 여기서만 이름을 띄웁니다 — 카드 · 리포트에는 나가지 않습니다.'
                   : '이름 표시를 꺼 두었습니다. (Config.gs 의 대시보드.미제출자표시)');

  if (!명부.목록.length) {
    sh.getRange(행, 2, 1, 10).merge()
      .setValue('_명부 시트가 비어 있습니다. 이름 · ID · 유형을 등록하면 미제출자를 대조합니다.')
      .setFontSize(9.5).setBackground(DASH.주의).setFontColor(DASH.주의글);
    return 행 + 2;
  }

  행 = 표머리_(sh, 행, ['게임', '미제출 인원', '명단', '', '', '', '', '', '', '']);
  var 값 = [], 배경 = [];
  for (var i = 0; i < 결과.length; i++) {
    var R = 결과[i];
    var 제출됨 = {};
    for (var j = 0; j < (R.응답 || []).length; j++) 제출됨[이름정규화_(R.응답[j].이름)] = true;
    var 미제출 = [];
    for (var k = 0; k < 명부.목록.length; k++) {
      var 사람 = 명부.목록[k];
      if (!제출됨[이름정규화_(사람.이름)]) {
        미제출.push(cfg.대시보드.미제출자표시 ? (사람.이름 + '(' + (사람.ID || '?') + ')') : (사람.ID || '?'));
      }
    }
    값.push([R.게임.게임명, 미제출.length, 미제출.join(', '), '', '', '', '', '', '', '']);
    var 색 = 미제출.length === 0 ? DASH.양호 : (미제출.length > 명부.목록.length / 2 ? DASH.주의 : '#FFFFFF');
    var 줄 = []; for (var l = 0; l < 10; l++) 줄.push(색);
    배경.push(줄);
  }
  if (값.length) {
    sh.getRange(행, 2, 값.length, 10).setValues(값).setFontSize(9).setBackgrounds(배경).setWrap(true);
    행 += 값.length;
  }
  return 행 + 1;
}

function 플래그목록_(sh, 행, 결과) {
  var 항목 = [];
  for (var i = 0; i < 결과.length; i++) {
    var R = 결과[i];
    for (var j = 0; j < (R.플래그 || []).length; j++) {
      var F = R.플래그[j];
      if (F.심각도 !== 'Critical' && F.심각도 !== 'High') continue;
      항목.push([R.게임.게임명, F.심각도, F.규칙, F.제목, F.근거, F.첨부.length, '', '', '', '']);
    }
  }

  행 = 구역제목_(sh, 행, '4. 이슈 플래그 (Critical · High)',
                 '리포트 3장에 올릴 후보입니다. 채택 여부와 권고 문장은 담당자가 정합니다. 전체 목록은 _플래그 탭에 있습니다.');

  if (!항목.length) {
    sh.getRange(행, 2, 1, 10).merge()
      .setValue('아직 켜진 플래그가 없습니다. (응답이 쌓이면 다시 계산됩니다)')
      .setFontSize(9.5).setBackground(DASH.카드배경).setFontColor(DASH.연회색);
    return 행 + 2;
  }

  행 = 표머리_(sh, 행, ['게임', '심각도', '규칙', '무엇이', '근거 수치', '인용', '', '', '', '']);
  var 배경 = [];
  for (var k = 0; k < 항목.length; k++) {
    var 색 = 항목[k][1] === 'Critical' ? DASH.위험 : DASH.주의;
    var 줄 = []; for (var l = 0; l < 10; l++) 줄.push(색);
    배경.push(줄);
  }
  sh.getRange(행, 2, 항목.length, 10).setValues(항목).setFontSize(9).setBackgrounds(배경).setWrap(true);
  return 행 + 항목.length + 1;
}

function 경고목록_(sh, 행, 경고) {
  if (!경고 || !경고.length) return 행;
  행 = 구역제목_(sh, 행, '5. 점검 필요', '설정이나 문항 매핑에 문제가 있습니다. [플레이테스트] → 설정 확인 을 실행해 보세요.');
  var 값 = [];
  for (var i = 0; i < 경고.length; i++) 값.push([경고[i], '', '', '', '', '', '', '', '', '']);
  sh.getRange(행, 2, 값.length, 10).setValues(값).setFontSize(9)
    .setBackground(DASH.주의).setFontColor(DASH.주의글).setWrap(true);
  return 행 + 값.length + 1;
}
