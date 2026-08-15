/**
 * 일회용_구세트_폐기.gs — 옛 폼 · 응답 시트를 휴지통으로
 * ============================================================================
 * 2026-08-15 에 설문 원본이 바뀌면서(애고 5→7문항 · 훌루포 16→17문항)
 * 폼을 다시 생성했다. 그 전에 만든 세트는 문항 구성이 달라 쓸 수 없고,
 * 남겨 두면 응답이 그쪽으로 들어와 문항이 다른 데이터가 섞인다.
 *
 * ── 쓰는 법 ────────────────────────────────────────────────────────────
 *   1. script.google.com → 새 프로젝트 → 이 파일 내용을 통째로 붙여 넣는다
 *   2. 함수 선택창에서  점검_1단계  을 골라 ▶ 실행 → 실행 로그(Ctrl+Enter) 확인
 *   3. 로그가 "전부 0건" 이면  폐기_2단계_휴지통으로  를 실행한다
 *      한 건이라도 응답이 있으면 2번은 스스로 멈춘다. 그때는 먼저 상의할 것.
 *
 * ── 안전장치 ───────────────────────────────────────────────────────────
 *   · 점검_1단계 은 아무것도 지우지 않는다. 읽기만 한다.
 *   · 폐기_2단계_휴지통으로 는 응답이 한 건이라도 있으면 아무것도 지우지 않고 멈춘다.
 *   · 완전 삭제가 아니라 휴지통 이동이다. 30일 안에 되돌릴 수 있다.
 *   · 신 세트 ID 는 목록에 아예 없다. 실수로 지울 수 없다.
 * ============================================================================
 */

// ── 지울 대상: 구 세트 (김영범 지정, 2026-08-15) ─────────────────────────
var 구세트_시트 = {
  '미스트월드':   '1fZCXtp5uU7cJBCTD_85Z4w6Qb-JhjDtNHjxMx8zrnwg',
  '호텔 나폴리':  '1yUaUxaK7X8c-G3x4V7ZVYAG_NorPBVjbUOC_XT3nn94',
  '하굣길':       '1poQ5Kv67lKmLd4O05goYM5-F3qVMMRm3oTfnklAV7uc',
  '어센디아':     '1N4pWLJ1eVbDvHAaP7DFLGhwXuhLlb1LofS-grFck4GA',
  '위비버디':     '1a67ogc-Ob3vc4B9Jvm9tKMjxl24V8NqjOpZqBqdv-ug'
};

// ── 확인만 하고 지우지 않는 대상 ────────────────────────────────────────
// 오전 11:07 실행 로그에 찍힌 세트. 구 세트와도, 신 세트와도 ID 가 다르다.
// createAllForms 가 그때 한 번 더 돌아 만들어진 것으로 보인다.
// 지울지는 김영범이 정한다 — 여기서는 상태만 본다.
var 확인만_시트 = {
  '미스트월드':   '1abAbUbT9iiXA6HkQcK0_2OsHw7j9UhjS123zPWVE__Y',
  '호텔 나폴리':  '1zmoEC8b-zXri_EzPexKySVWDFPWeVapQ3kJ2JGxepyQ',
  '하굣길':       '18Or-nwK18-VvcC2Gkh6PlVPDC-Dxbv5dqjPlKkRyFl8',
  '어센디아':     '1wcfNEJWhuMi52jloBIUzfJ0CHwYnh8NNal-R8OkpXbY',
  '위비버디':     '1e2GV_gKDll-N0gY8mDoV4538c5SnfbEcJwaKFRM_YHQ'
};

// ── 지우면 안 되는 것: 신 세트 (대조용) ──────────────────────────────────
var 신세트_시트 = {
  '미스트월드':   '1GasFf4eoC0vLUgySn0VehbrXDeLQ3H7opi0zpMAW5Vg',
  '호텔 나폴리':  '13xLYTtX2CeHjaQmFkd8Xf58W_1e9TXmh-B5YzxX05W4',
  '하굣길':       '11xp3vhJe1jyoIM-AsbnTd4pricG4-b-Cv9yg-wYvI90',
  '어센디아':     '19RF0RWbw16A8lR1U-WyA2t7uIqvS1dbRyj2yKzIzh6g',
  '위비버디':     '14Pzy2pEjkwKHYPcNcSKfO7LQXTfe0SsXeHBdnh5oX8I'
};


/** 1단계 — 상태만 본다. 아무것도 지우지 않는다. */
function 점검_1단계() {
  var 줄 = ['══ 폐기 전 점검 ══', ''];
  var 구 = 훑기_('A · 구 세트 (지울 대상)', 구세트_시트, 줄);
  var 중 = 훑기_('B · 11:07 로그 세트 (확인만)', 확인만_시트, 줄);
  var 신 = 훑기_('C · 신 세트 (절대 지우지 않음)', 신세트_시트, 줄);

  줄.push('── 판단 ──');
  if (구.응답 === 0) {
    줄.push('A(구 세트) 응답 0건 — 폐기_2단계_휴지통으로 를 실행해도 됩니다.');
  } else {
    줄.push('[멈춤] A(구 세트)에 응답이 ' + 구.응답 + '건 있습니다. 옮길지 버릴지 먼저 정해야 합니다.');
  }
  if (중.존재 > 0) {
    줄.push('B(11:07 세트)가 드라이브에 ' + 중.존재 + '개 남아 있습니다. 응답 ' + 중.응답 + '건.');
    줄.push('  이것도 문항이 옛 구성이면 같이 지워야 합니다. 확인 후 알려 주세요.');
  } else {
    줄.push('B(11:07 세트)는 드라이브에 없습니다. 신경 쓰지 않아도 됩니다.');
  }
  줄.push('C(신 세트) 응답 ' + 신.응답 + '건 · 열 구성 ' + 신.열.join(' / ') + ' (기대 33/33/36/30/40)');

  var 결과 = 줄.join('\n');
  Logger.log(결과);
  return 결과;
}


/** 2단계 — 구 세트를 휴지통으로. 응답이 한 건이라도 있으면 멈춘다. */
function 폐기_2단계_휴지통으로() {
  var 줄 = ['══ 구 세트 폐기 ══', ''];

  // 안전장치 1 — 응답이 있으면 아무것도 하지 않는다
  var 총응답 = 0, 목록 = [];
  for (var 게임 in 구세트_시트) {
    try {
      var ss = SpreadsheetApp.openById(구세트_시트[게임]);
      var n = Math.max(0, ss.getSheets()[0].getLastRow() - 1);
      총응답 += n;
      목록.push({ 게임: 게임, id: 구세트_시트[게임], 응답: n, 이름: ss.getName() });
    } catch (e) {
      줄.push('[건너뜀] ' + 게임 + ' — 이미 없거나 열 수 없습니다: ' + e.message);
    }
  }
  if (총응답 > 0) {
    줄.push('[멈춤] 구 세트에 응답이 ' + 총응답 + '건 있습니다. 아무것도 지우지 않았습니다.');
    for (var i = 0; i < 목록.length; i++) if (목록[i].응답) 줄.push('   ' + 목록[i].게임 + ' ' + 목록[i].응답 + '건');
    Logger.log(줄.join('\n'));
    return 줄.join('\n');
  }

  // 안전장치 2 — 신 세트 ID 가 목록에 섞여 있으면 중단
  for (var g2 in 신세트_시트) {
    for (var g3 in 구세트_시트) {
      if (신세트_시트[g2] === 구세트_시트[g3]) {
        throw new Error('신 세트 ID 가 삭제 목록에 있습니다. 중단합니다: ' + 신세트_시트[g2]);
      }
    }
  }

  // 응답 시트 → 휴지통
  var 지움 = 0;
  for (var j = 0; j < 목록.length; j++) {
    DriveApp.getFileById(목록[j].id).setTrashed(true);
    줄.push('[휴지통] 시트  ' + 목록[j].게임 + '  ' + 목록[j].이름);
    지움++;
  }

  // 짝이 되는 폼도 같이 → 시트 이름에서 폼 제목을 찾아 매칭한다
  줄.push('');
  줄.push('── 폼 ──');
  var 폼지움 = 0;
  for (var k = 0; k < 목록.length; k++) {
    var 폼제목 = String(목록[k].이름).replace(/\s*\(응답\)\s*$/, '');
    var it = DriveApp.getFilesByName(폼제목);
    while (it.hasNext()) {
      var f = it.next();
      if (f.getMimeType() !== MimeType.GOOGLE_FORMS) continue;
      if (f.isTrashed()) continue;
      // 신 세트 폼을 지우지 않도록, 응답 시트가 신 세트에 연결된 폼은 건너뛴다
      if (신세트폼인가_(f.getId())) { 줄.push('[보존] 폼  ' + f.getName() + '  (신 세트)'); continue; }
      f.setTrashed(true);
      줄.push('[휴지통] 폼  ' + f.getName());
      폼지움++;
    }
  }

  줄.push('');
  줄.push('시트 ' + 지움 + '개 · 폼 ' + 폼지움 + '개를 휴지통으로 보냈습니다. 30일 안에 되돌릴 수 있습니다.');
  줄.push('폼이 예상보다 적게 지워졌으면 제목이 겹치는 것이니 드라이브에서 직접 확인하세요.');
  Logger.log(줄.join('\n'));
  return 줄.join('\n');
}


// ── 도우미 ────────────────────────────────────────────────────────────

function 훑기_(제목, 세트, 줄) {
  줄.push('── ' + 제목 + ' ──');
  var 총응답 = 0, 존재 = 0, 열들 = [];
  for (var 게임 in 세트) {
    try {
      var ss = SpreadsheetApp.openById(세트[게임]);
      var sh = ss.getSheets()[0];
      var n = Math.max(0, sh.getLastRow() - 1);
      var c = sh.getLastColumn();
      var f = DriveApp.getFileById(세트[게임]);
      총응답 += n; 존재++; 열들.push(c);
      줄.push('  ' + 채우기_(게임, 12) + ' 응답 ' + 채우기_(n + '건', 6) +
              ' 열 ' + 채우기_(String(c), 3) +
              ' 생성 ' + Utilities.formatDate(f.getDateCreated(), Session.getScriptTimeZone(), 'MM-dd HH:mm') +
              (f.isTrashed() ? '  [이미 휴지통]' : '') +
              '  ' + ss.getName());
    } catch (e) {
      줄.push('  ' + 채우기_(게임, 12) + ' [없음] ' + String(e.message).slice(0, 60));
      열들.push('-');
    }
  }
  줄.push('  총 응답 ' + 총응답 + '건 · 살아 있는 시트 ' + 존재 + '개');
  줄.push('');
  return { 응답: 총응답, 존재: 존재, 열: 열들 };
}

function 신세트폼인가_(폼ID) {
  try {
    var form = FormApp.openById(폼ID);
    var dest = form.getDestinationId();
    for (var g in 신세트_시트) if (신세트_시트[g] === dest) return true;
  } catch (e) { }
  return false;
}

function 채우기_(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}
