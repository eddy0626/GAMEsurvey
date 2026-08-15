/**
 * 일회용_폼중복점검.gs — 응답 시트 두 벌 중 어느 쪽이 살아 있는지 확인
 * ============================================================================
 * 2026-08-15 오전 11:07 에 createAllForms() 가 다시 돌아 폼 5개 + 응답 시트 5개가
 * 새로 만들어졌다. 기존 세트와 새 세트 중 어느 쪽을 쓸지 정하기 위한 점검이다.
 *
 * 쓰는 법
 *   1. script.google.com 에서 아무 프로젝트나 새로 만든다 (또는 폼 생성기 프로젝트)
 *   2. 이 파일 내용을 통째로 붙여 넣는다
 *   3. 함수 선택창에서 폼중복점검 을 고르고 ▶ 실행
 *   4. 실행 로그(Ctrl+Enter) 내용을 그대로 알려 준다
 *
 * 아무것도 지우지 않는다. 읽기만 한다.
 * ============================================================================
 */

var 세트A_기존 = {
  '미스트월드':   '1fZCXtp5uU7cJBCTD_85Z4w6Qb-JhjDtNHjxMx8zrnwg',
  '호텔 나폴리':  '1yUaUxaK7X8c-G3x4V7ZVYAG_NorPBVjbUOC_XT3nn94',
  '하굣길':       '1poQ5Kv67lKmLd4O05goYM5-F3qVMMRm3oTfnklAV7uc',
  '어센디아':     '1N4pWLJ1eVbDvHAaP7DFLGhwXuhLlb1LofS-grFck4GA',
  '위비버디':     '1a67ogc-Ob3vc4B9Jvm9tKMjxl24V8NqjOpZqBqdv-ug'
};

var 세트B_신규 = {
  '미스트월드':   '1abAbUbT9iiXA6HkQcK0_2OsHw7j9UhjS123zPWVE__Y',
  '호텔 나폴리':  '1zmoEC8b-zXri_EzPexKySVWDFPWeVapQ3kJ2JGxepyQ',
  '하굣길':       '18Or-nwK18-VvcC2Gkh6PlVPDC-Dxbv5dqjPlKkRyFl8',
  '어센디아':     '1wcfNEJWhuMi52jloBIUzfJ0CHwYnh8NNal-R8OkpXbY',
  '위비버디':     '1e2GV_gKDll-N0gY8mDoV4538c5SnfbEcJwaKFRM_YHQ'
};

function 폼중복점검() {
  var 줄 = [];
  줄.push('══ 응답 시트 두 벌 비교 ══');
  줄.push('');

  var 합계 = {};
  [['A · 기존 (8/15 확인분)', 세트A_기존], ['B · 신규 (오늘 11:07 생성)', 세트B_신규]]
    .forEach(function (짝) {
      var 이름 = 짝[0], 세트 = 짝[1], 총응답 = 0;
      줄.push('── ' + 이름 + ' ──');
      for (var 게임 in 세트) {
        try {
          var ss = SpreadsheetApp.openById(세트[게임]);
          var sh = ss.getSheets()[0];
          var 응답수 = Math.max(0, sh.getLastRow() - 1);
          총응답 += 응답수;
          var f = DriveApp.getFileById(세트[게임]);
          줄.push('  ' + pad(게임, 12) +
                  ' 응답 ' + pad(String(응답수) + '건', 6) +
                  ' 열 ' + pad(String(sh.getLastColumn()), 3) +
                  ' 생성 ' + Utilities.formatDate(f.getDateCreated(), Session.getScriptTimeZone(), 'MM-dd HH:mm') +
                  '  ' + ss.getName());
        } catch (e) {
          줄.push('  ' + pad(게임, 12) + ' [열 수 없음] ' + e.message);
        }
      }
      합계[이름] = 총응답;
      줄.push('  총 응답 ' + 총응답 + '건');
      줄.push('');
    });

  줄.push('── 판단 ──');
  var 키 = Object.keys(합계);
  if (합계[키[0]] === 0 && 합계[키[1]] === 0) {
    줄.push('양쪽 다 응답이 0건입니다. 아직 배포 전이면 어느 쪽을 남겨도 됩니다.');
    줄.push('참가자에게 이미 응답 URL 을 뿌렸다면 그쪽을 남기세요.');
  } else if (합계[키[1]] === 0) {
    줄.push('응답은 A(기존)에만 있습니다. A 를 쓰고 B 는 지우면 됩니다.');
  } else if (합계[키[0]] === 0) {
    줄.push('응답은 B(신규)에만 있습니다. B 를 쓰고 A 는 지우면 됩니다.');
  } else {
    줄.push('[주의] 양쪽에 응답이 들어와 있습니다. 지우기 전에 합치는 방법을 먼저 정해야 합니다.');
  }

  var 결과 = 줄.join('\n');
  Logger.log(결과);
  return 결과;
}

function pad(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}
