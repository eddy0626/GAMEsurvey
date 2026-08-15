/**
 * Code.gs — 메뉴 등록 · 실행 진입점
 * ============================================================================
 * 이 스크립트는 '마스터 집계 시트'에 붙어 있다.
 * 게임별 응답 시트 5개는 openById 로 읽기만 하고 절대 쓰지 않는다.
 * ============================================================================
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('플레이테스트')
    .addItem('집계 새로고침', '메뉴_집계새로고침')
    .addSeparator()
    .addItem('개별 카드 생성', '메뉴_개별카드')
    .addItem('종합 리포트 생성', '메뉴_종합리포트')
    .addItem('PDF 일괄 변환', '메뉴_PDF변환')
    .addSeparator()
    .addItem('설정 확인', '메뉴_설정확인')
    .addSubMenu(SpreadsheetApp.getUi().createMenu('점검 도구')
      .addItem('레이더 차트 미리보기 (드라이브 저장)', '테스트_차트이미지저장')
      .addItem('레이더 차트 속도 비교', '테스트_차트속도비교')
      .addItem('헤더 매핑 표 보기', '메뉴_헤더매핑')
      .addItem('진단 (실행 로그에 출력)', '진단'))
    .addToUi();
}

// ── 메뉴 핸들러 ─────────────────────────────────────────────────────────────

function 메뉴_집계새로고침() {
  var ui = SpreadsheetApp.getUi();
  try {
    var 시작 = new Date();
    var 결과 = 집계실행();
    var 총 = 0, 게임수 = 0;
    for (var i = 0; i < 결과.length; i++) { 총 += (결과[i].응답 || []).length; if (!결과[i].오류) 게임수++; }
    ui.alert('집계 완료',
      '게임 ' + 게임수 + '개 · 응답 ' + 총 + '건을 집계했습니다.\n' +
      '소요 ' + 반올림_((new Date() - 시작) / 1000, 1) + '초\n\n' +
      '대시보드 탭에서 현황을 확인하세요.', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('집계 실패', e.message + '\n\n[플레이테스트] → 설정 확인 을 먼저 실행해 보세요.', ui.ButtonSet.OK);
    throw e;
  }
}

function 메뉴_개별카드() {
  SpreadsheetApp.getUi().alert('개별 카드 생성',
    'Phase 3 에서 붙입니다.\n먼저 구글 문서 템플릿(템플릿_개별카드)을 만들고\nConfig.gs 의 템플릿.개별카드ID 에 ID 를 넣어 주세요.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function 메뉴_종합리포트() {
  SpreadsheetApp.getUi().alert('종합 리포트 생성',
    'Phase 4 에서 붙입니다.\n먼저 구글 문서 템플릿(템플릿_종합리포트)을 만들고\nConfig.gs 의 템플릿.종합리포트ID 에 ID 를 넣어 주세요.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function 메뉴_PDF변환() {
  SpreadsheetApp.getUi().alert('PDF 일괄 변환', 'Phase 5 에서 붙입니다.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function 메뉴_설정확인() {
  var 보고 = 설정확인_();
  var html = HtmlService.createHtmlOutput(설정확인HTML_(보고)).setWidth(760).setHeight(620);
  SpreadsheetApp.getUi().showModalDialog(html, '설정 확인');
}

function 메뉴_헤더매핑() {
  var html = HtmlService.createHtmlOutput(헤더매핑HTML_()).setWidth(860).setHeight(620);
  SpreadsheetApp.getUi().showModalDialog(html, '헤더 매핑 표');
}

// ── 진단 ────────────────────────────────────────────────────────────────────

/**
 * 진단 — Apps Script 편집기에서 바로 실행하는 점검.
 *
 *   편집기 상단 함수 선택창에서 '진단' 을 고르고 ▶ 실행.
 *   결과는 하단 실행 로그에 찍힌다 (Ctrl+Enter 로도 볼 수 있다).
 *
 * 메뉴가 안 뜨거나 권한 창에서 막혔을 때도 이건 돌아간다.
 * UI 를 쓰지 않으므로 편집기 단독 실행에서 안전하다.
 */
function 진단() {
  var 줄 = [];
  function P(s) { 줄.push(s); }

  P('══ 플레이테스트 리포트 자동화 · 진단 ══');
  P('시각      ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'));
  P('시간대    ' + Session.getScriptTimeZone());
  P('');

  // 1. 스크립트가 시트에 붙어 있는가 — 여기서 걸리면 나머지가 전부 무의미하다
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { }
  if (!ss) {
    P('[치명] 이 스크립트가 스프레드시트에 붙어 있지 않습니다 (독립 프로젝트).');
    P('       SpreadsheetApp.getActiveSpreadsheet() 가 null 입니다.');
    P('       → 마스터 시트를 열고 [확장 프로그램] → [Apps Script] 로 만든 프로젝트여야 합니다.');
    P('       script.google.com 에서 새로 만든 프로젝트는 시트에 붙지 않습니다.');
    P('       올바른 프로젝트의 스크립트 ID 로 .clasp.json 을 고치고 다시 clasp push 하세요.');
    Logger.log(줄.join('\n'));
    return 줄.join('\n');
  }
  P('[OK] 마스터 시트에 붙어 있습니다');
  P('     이름  ' + ss.getName());
  P('     ID    ' + ss.getId());
  P('     URL   ' + ss.getUrl());
  var 탭이름들 = [];
  var 시트들 = ss.getSheets();
  for (var i = 0; i < 시트들.length; i++) 탭이름들.push(시트들[i].getName() + (시트들[i].isSheetHidden() ? '(숨김)' : ''));
  P('     탭    ' + 탭이름들.join(' · '));
  P('');

  // 2. 메뉴
  P('[정보] 메뉴가 안 보이면 시트 브라우저 탭을 새로고침(F5)하세요.');
  P('       onOpen 은 문서를 열 때만 도는 함수라 push 만으로는 안 붙습니다.');
  P('');

  // 3. 응답 시트 5개에 실제로 닿는가
  P('── 응답 시트 ──');
  for (var g = 0; g < CONFIG.GAMES.length; g++) {
    var G = CONFIG.GAMES[g];
    if (!G.응답시트ID) { P('[오류] ' + G.게임명 + ' — 응답시트ID 가 비어 있습니다'); continue; }
    try {
      var 대상 = SpreadsheetApp.openById(G.응답시트ID);
      var sh = G.탭이름 ? 대상.getSheetByName(G.탭이름) : 대상.getSheets()[0];
      if (!sh) { P('[오류] ' + G.게임명 + " — 탭 '" + G.탭이름 + "' 없음"); continue; }
      var 마지막행 = sh.getLastRow(), 마지막열 = sh.getLastColumn();
      var 헤더 = 마지막열 ? sh.getRange(1, 1, 1, 마지막열).getValues()[0] : [];
      var 맵 = 헤더맵만들기_(헤더, CONFIG.공통문항);
      P('[' + (맵.누락.length ? '오류' : 'OK') + '] ' + G.게임명);
      P('       시트  ' + 대상.getName() + '  /  탭 ' + sh.getName());
      P('       규모  ' + 마지막열 + '열 · 응답 ' + Math.max(0, 마지막행 - 1) + '건');
      P('       매핑  공통 ' + Object.keys(맵.공통).length + '/' + Object.keys(CONFIG.공통문항).length +
        ' · 고유 ' + 맵.고유.length + '문항');
      if (맵.누락.length) P('       못 찾음: ' + 맵.누락.join(', '));
      if (맵.중복.length) {
        var dup = []; for (var d = 0; d < 맵.중복.length; d++) dup.push(맵.중복[d].키);
        P('       중복: ' + dup.join(', '));
      }
    } catch (e2) {
      P('[오류] ' + G.게임명 + ' — 열 수 없습니다: ' + e2.message);
      P('       ID 가 틀렸거나, 이 계정에 그 시트 접근 권한이 없습니다.');
    }
  }
  P('');

  // 4. 나머지는 설정확인_ 에 맡긴다
  P('── 설정 확인 ──');
  try {
    var 보고 = 설정확인_();
    for (var k = 0; k < 보고.length; k++) {
      var R = 보고[k];
      if (R.상태 === 'OK') continue;             // 문제가 있는 것만 찍는다
      P('[' + R.상태 + '] ' + R.구분 + ' · ' + R.항목);
      P('       ' + String(R.내용).replace(/\n/g, '\n       '));
    }
    var 수 = { OK: 0, 경고: 0, 오류: 0 };
    for (var m = 0; m < 보고.length; m++) 수[보고[m].상태]++;
    P('정상 ' + 수.OK + ' · 경고 ' + 수.경고 + ' · 오류 ' + 수.오류);
  } catch (e3) {
    P('[오류] 설정 확인 중 예외: ' + e3.message);
    P(e3.stack ? String(e3.stack).split('\n').slice(0, 5).join('\n') : '');
  }

  P('');
  P('══ 진단 끝 ══');
  var 결과 = 줄.join('\n');
  Logger.log(결과);
  return 결과;
}

// ── 설정 확인 ───────────────────────────────────────────────────────────────

/**
 * 폴더 ID · 템플릿 ID · 문항 매핑이 모두 유효한지 점검한다.
 * 무엇이 왜 잘못됐는지까지 알려 준다.
 * @return [{구분, 항목, 상태:'OK'|'경고'|'오류', 내용}]
 */
function 설정확인_() {
  var cfg = CONFIG, 보고 = [];
  function 넣기(구분, 항목, 상태, 내용) { 보고.push({ 구분: 구분, 항목: 항목, 상태: 상태, 내용: 내용 }); }

  // ── 1. 게임 목록과 응답 시트 ──
  if (!cfg.GAMES.length) 넣기('게임', '목록', '오류', 'Config.gs 의 GAMES 가 비어 있습니다.');
  var 코드본 = {};
  for (var i = 0; i < cfg.GAMES.length; i++) {
    var G = cfg.GAMES[i];
    if (코드본[G.코드]) 넣기('게임', G.코드, '오류', '게임 코드가 중복됩니다.');
    코드본[G.코드] = true;

    if (!G.응답시트ID) {
      넣기('응답 시트', G.게임명, '오류', '응답시트ID 가 비어 있습니다. 구글 폼 응답 스프레드시트의 URL 에서 /d/ 와 /edit 사이 문자열을 넣어 주세요.');
      continue;
    }
    var 원시 = 응답읽기_(G);
    if (원시.오류) { 넣기('응답 시트', G.게임명, '오류', 원시.오류); continue; }
    if (!원시.헤더.length) { 넣기('응답 시트', G.게임명, '경고', '시트가 비어 있습니다 (헤더 행이 없습니다).'); continue; }

    넣기('응답 시트', G.게임명, 'OK', "탭 '" + 원시.시트이름 + "' · 열 " + 원시.헤더.length + '개 · 응답 ' + 원시.행.length + '건');

    // ── 2. 공통 문항 매핑 ──
    var 맵 = 헤더맵만들기_(원시.헤더, cfg.공통문항);
    if (맵.누락.length) {
      넣기('문항 매핑', G.게임명, '오류',
        '못 찾은 공통 문항 ' + 맵.누락.length + '개: ' + 맵.누락.join(', ') +
        '  → 폼에서 문구를 고쳤다면 Config.gs 의 공통문항 에 새 문구를 배열 맨 앞에 추가하세요.');
    } else {
      넣기('문항 매핑', G.게임명, 'OK', '공통 문항 ' + Object.keys(맵.공통).length + '개 전부 찾음 · 고유 문항 ' + 맵.고유.length + '개');
    }
    if (맵.중복.length) {
      var 중복이름 = [];
      for (var d = 0; d < 맵.중복.length; d++) 중복이름.push(맵.중복[d].키);
      넣기('문항 매핑', G.게임명, '경고', '같은 공통 문항에 두 열이 걸렸습니다: ' + 중복이름.join(', ') + ' (앞 열을 씁니다)');
    }

    // ── 3. Config 에 적은 게임 고유 문항이 실제로 있는지 (오타 검출) ──
    var 있는문항 = {};
    for (var h = 0; h < 맵.고유.length; h++) 있는문항[맵.고유[h].문항] = true;

    var 확인목록 = [];
    var 부정 = cfg.게임_부정선택지[G.코드] || {};
    for (var 키 in 부정) 확인목록.push(['부정선택지', 키]);
    var 체크 = cfg.체크박스문항[G.코드] || [];
    for (var c = 0; c < 체크.length; c++) 확인목록.push(['체크박스문항', 체크[c]]);
    var 튜 = cfg.게임_튜토리얼문항[G.코드];
    if (튜) 확인목록.push(['튜토리얼문항', 튜.문항]);
    var 덮 = cfg.게임_문항유형[G.코드] || {};
    for (var 키2 in 덮) 확인목록.push(['문항유형', 키2]);

    var 없는것 = [];
    for (var j = 0; j < 확인목록.length; j++) {
      if (!있는문항[헤더정규화_(확인목록[j][1])]) 없는것.push(확인목록[j][0] + ' → «' + 확인목록[j][1] + '»');
    }
    if (없는것.length) {
      넣기('Config 대조', G.게임명, '오류',
        'Config.gs 에 적힌 문항 ' + 없는것.length + '개를 응답 시트에서 못 찾았습니다 (오타이거나 문항이 바뀐 것입니다):\n  · ' +
        없는것.join('\n  · '));
    } else if (확인목록.length) {
      넣기('Config 대조', G.게임명, 'OK', 'Config 에 적은 고유 문항 ' + 확인목록.length + '개가 모두 시트에 있습니다.');
    }

    // ── 4. 부정 선택지 문구가 실제 응답에 나타나는지 ──
    if (원시.행.length) {
      var 파싱 = 응답파싱_(원시.헤더, 원시.행, G, cfg);
      var 집계 = 문항집계_(파싱.응답, G, cfg);
      var 못본선택지 = [];
      for (var 키3 in 부정) {
        var 정규키 = 헤더정규화_(키3);
        var 항 = null;
        for (var k = 0; k < 집계.length; k++) if (집계[k].문항 === 정규키) { 항 = 집계[k]; break; }
        if (!항) continue;
        var 나온답 = {};
        for (var m = 0; m < 항.집계.length; m++) 나온답[항.집계[m].답] = true;
        for (var n = 0; n < 부정[키3].length; n++) {
          if (!나온답[부정[키3][n]]) 못본선택지.push('«' + 부정[키3][n] + '»');
        }
      }
      if (못본선택지.length) {
        넣기('부정 선택지', G.게임명, '경고',
          '아직 아무도 고르지 않은 선택지 ' + 못본선택지.length + '개: ' + 못본선택지.join(', ') +
          '  → 정상일 수 있지만, 응답이 충분히 쌓였는데도 0건이면 문구 오타를 의심하세요.');
      }

      // ── 4b. 고유 문항 유형 판별 결과를 보여 준다 ──
      //   Config 에 안 적은 문항은 응답 내용을 보고 객관식/서술형을 추측한다.
      //   추측이 틀리면 부록 A 에 엉뚱한 표가 서거나 부록 B 에서 서술이 사라지므로
      //   담당자가 눈으로 확인할 수 있게 전부 나열한다.
      var 유형줄 = [];
      for (var t2 = 0; t2 < 집계.length; t2++) {
        var 항2 = 집계[t2];
        if (항2.출처 !== '고유') continue;
        var 건수 = 항2.유형 === '서술형' ? (항2.서술.length + '건') : (항2.집계.length + '개 선택지');
        유형줄.push('· [' + 항2.유형 + '] ' + 항2.문항.slice(0, 46) + (항2.문항.length > 46 ? '…' : '') + '  (' + 건수 + ')');
      }
      if (유형줄.length) {
        넣기('문항 유형', G.게임명, 'OK',
          '고유 문항 ' + 유형줄.length + '개의 판별 결과입니다. 틀린 것이 있으면 Config.gs 의 게임_문항유형 에 적어 덮어쓰세요.\n  ' +
          유형줄.join('\n  '));
      }
    }

    // ── 5. 결과 폴더 ──
    if (G.폴더ID) {
      try { DriveApp.getFolderById(G.폴더ID); 넣기('폴더', G.게임명, 'OK', '폴더 접근 가능'); }
      catch (e) { 넣기('폴더', G.게임명, '오류', '폴더ID 로 폴더를 열 수 없습니다: ' + e.message); }
    } else {
      넣기('폴더', G.게임명, '경고', '폴더ID 가 비어 있습니다. 산출물 생성 시 자동으로 만듭니다.');
    }
  }

  // ── 6. 루트 폴더 · 템플릿 ──
  if (cfg.드라이브.루트폴더ID) {
    try { DriveApp.getFolderById(cfg.드라이브.루트폴더ID); 넣기('드라이브', '루트 폴더', 'OK', '접근 가능'); }
    catch (e2) { 넣기('드라이브', '루트 폴더', '오류', '루트폴더ID 로 폴더를 열 수 없습니다: ' + e2.message); }
  } else {
    넣기('드라이브', '루트 폴더', '경고', '비어 있습니다. 마스터 시트가 있는 폴더를 씁니다.');
  }

  var 템플릿표 = [['개별카드ID', '템플릿_개별카드', 'Phase 3'], ['종합리포트ID', '템플릿_종합리포트', 'Phase 4']];
  for (var t = 0; t < 템플릿표.length; t++) {
    var id = cfg.템플릿[템플릿표[t][0]];
    if (!id) { 넣기('템플릿', 템플릿표[t][1], '경고', '아직 비어 있습니다 (' + 템플릿표[t][2] + ' 에서 채웁니다).'); continue; }
    try {
      var doc = DocumentApp.openById(id);
      넣기('템플릿', 템플릿표[t][1], 'OK', "'" + doc.getName() + "' 열림");
    } catch (e3) {
      넣기('템플릿', 템플릿표[t][1], '오류', '문서를 열 수 없습니다: ' + e3.message);
    }
  }

  // ── 7. 명부 ──
  var 명부 = 명부읽기_();
  if (!명부.목록.length) {
    넣기('명부', '_명부', '경고', '비어 있습니다. 이름 · ID · 유형(교육생/전문가)을 등록하면 미제출자 대조와 응답자 유형 표기가 됩니다.');
  } else {
    var ID없음 = 0, 유형미상 = 0, ID중복 = {}, 중복ID = [];
    for (var p = 0; p < 명부.목록.length; p++) {
      var 사람 = 명부.목록[p];
      if (!사람.ID) ID없음++;
      else { if (ID중복[사람.ID]) 중복ID.push(사람.ID); ID중복[사람.ID] = true; }
      if (사람.유형 === cfg.응답자.미상유형 || cfg.응답자.유형.indexOf(사람.유형) < 0) 유형미상++;
    }
    넣기('명부', '_명부', ID없음 || 중복ID.length ? '경고' : 'OK',
      '등록 ' + 명부.목록.length + '명' +
      (ID없음 ? ' · ID 없음 ' + ID없음 + '명(실행 시 자동 발급)' : '') +
      (중복ID.length ? ' · ID 중복 ' + 중복ID.join(',') : '') +
      (유형미상 ? ' · 유형 미상 ' + 유형미상 + '명' : ''));
    if (명부.중복.length) 넣기('명부', '동명이인', '오류', '이름이 겹칩니다: ' + 명부.중복.join(', ') + ' → 뒷사람 응답이 앞사람 ID 로 붙습니다. 이름 뒤에 구분자를 붙여 주세요.');
  }

  // ── 8. 임계값 상식 검사 ──
  var T = cfg.임계값;
  if (T.육각평균_Critical >= T.육각평균_High) 넣기('임계값', '6축 평균', '오류', 'Critical 기준이 High 기준보다 크거나 같습니다.');
  if (T.부정선택지_Critical <= T.부정선택지_High) 넣기('임계값', '부정 선택지', '오류', 'Critical 기준이 High 기준보다 작거나 같습니다.');
  if (cfg.배치.자체중단_초 >= 360) 넣기('임계값', '배치 자체중단', '경고', '6분(360초) 제한에 너무 가깝습니다. 300초 이하를 권합니다.');

  return 보고;
}

function 설정확인HTML_(보고) {
  var 색 = { OK: '#1E7A45', 경고: '#B45309', 오류: '#B3261E' };
  var 배경 = { OK: '#EAF7EF', 경고: '#FFF4E5', 오류: '#FDE7E9' };
  var 수 = { OK: 0, 경고: 0, 오류: 0 };
  for (var i = 0; i < 보고.length; i++) 수[보고[i].상태]++;

  var h = '<style>' +
    'body{font-family:"Malgun Gothic","맑은 고딕",sans-serif;font-size:13px;color:#202124;margin:0;padding:16px}' +
    'h2{margin:0 0 4px;font-size:17px}' +
    '.sum{margin:0 0 14px;color:#5F6368;font-size:12px}' +
    'table{border-collapse:collapse;width:100%}' +
    'th{background:#F1F6FB;text-align:left;font-size:11px;padding:6px 8px;border-bottom:1px solid #dadce0}' +
    'td{padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top;font-size:12px;white-space:pre-wrap}' +
    '.b{font-weight:700;border-radius:3px;padding:1px 6px;font-size:11px}' +
    '</style>';
  h += '<h2>설정 확인</h2><p class="sum">정상 ' + 수.OK + ' · 경고 ' + 수.경고 + ' · <b style="color:#B3261E">오류 ' + 수.오류 + '</b>' +
       (수.오류 ? ' — 오류를 먼저 고쳐야 집계가 정확해집니다.' : ' — 바로 실행할 수 있습니다.') + '</p>';
  h += '<table><tr><th style="width:90px">구분</th><th style="width:150px">항목</th><th style="width:56px">상태</th><th>내용</th></tr>';
  for (var j = 0; j < 보고.length; j++) {
    var R = 보고[j];
    h += '<tr><td>' + 이스케이프_(R.구분) + '</td><td>' + 이스케이프_(R.항목) + '</td>' +
         '<td><span class="b" style="color:' + 색[R.상태] + ';background:' + 배경[R.상태] + '">' + R.상태 + '</span></td>' +
         '<td>' + 이스케이프_(R.내용) + '</td></tr>';
  }
  return h + '</table>';
}

/** 헤더가 어느 문항으로 매핑됐는지 눈으로 확인하는 표 */
function 헤더매핑HTML_() {
  var cfg = CONFIG;
  var h = '<style>body{font-family:"Malgun Gothic",sans-serif;font-size:12px;padding:16px}' +
          'table{border-collapse:collapse;width:100%;margin-bottom:22px}' +
          'th{background:#F1F6FB;text-align:left;font-size:11px;padding:5px 7px;border-bottom:1px solid #dadce0}' +
          'td{padding:4px 7px;border-bottom:1px solid #eee;font-size:11.5px}' +
          'h3{font-size:14px;margin:0 0 6px}.g{color:#5F6368}</style>';

  for (var i = 0; i < cfg.GAMES.length; i++) {
    var G = cfg.GAMES[i];
    h += '<h3>' + 이스케이프_(G.게임명) + ' <span class="g">(' + G.코드 + ')</span></h3>';
    var 원시 = 응답읽기_(G);
    if (원시.오류 || !원시.헤더.length) {
      h += '<p class="g">' + 이스케이프_(원시.오류 || '헤더가 없습니다') + '</p>';
      continue;
    }
    var 맵 = 헤더맵만들기_(원시.헤더, cfg.공통문항);
    var 역 = {};
    for (var 키 in 맵.공통) 역[맵.공통[키]] = 키;

    h += '<table><tr><th style="width:40px">열</th><th style="width:120px">매핑</th><th>시트 헤더</th></tr>';
    for (var c = 0; c < 원시.헤더.length; c++) {
      var 라벨 = 역[c] ? ('<b>' + 역[c] + '</b>') : '<span class="g">고유 문항</span>';
      h += '<tr><td>' + c + '</td><td>' + 라벨 + '</td><td>' + 이스케이프_(String(원시.헤더[c])) + '</td></tr>';
    }
    h += '</table>';
  }
  return h;
}

function 이스케이프_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
