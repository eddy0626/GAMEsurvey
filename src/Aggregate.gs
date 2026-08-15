/**
 * Aggregate.gs — 응답 시트 통합 · 지표 계산 · 이슈 플래그 판정
 * ============================================================================
 * 원본 응답 시트는 읽기만 한다. 절대 쓰지 않는다.
 * 계산 결과는 마스터 시트의 _집계_* 탭에만 쓴다.
 *
 * 파일 구성
 *   [A] 순수 계산 함수 — 시트를 건드리지 않는다. Node 로 그대로 테스트한다.
 *   [B] 시트 입출력   — SpreadsheetApp 을 쓰는 부분.
 * ============================================================================
 */

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ [A] 순수 계산 함수                                                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/** 반올림 — 0.5 는 항상 0 에서 먼 쪽으로. (파이썬 기준선과 맞추기 위함) */
function 반올림_(x, 자리) {
  자리 = 자리 || 0;
  var f = Math.pow(10, 자리);
  var v = x * f;
  return (v < 0 ? -Math.round(-v) : Math.round(v)) / f;
}

function 평균_(arr) {
  if (!arr.length) return null;
  var s = 0;
  for (var i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

/** 표본 표준편차 (n-1). 파이썬 statistics.stdev 와 같다. n<2 면 null. */
function 표본표준편차_(arr) {
  if (arr.length < 2) return null;
  var m = 평균_(arr), s = 0;
  for (var i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
  return Math.sqrt(s / (arr.length - 1));
}

/** 백분율 정수. N=0 이면 0. */
function 백분율_(n, N) { return N ? 반올림_(n / N * 100) : 0; }

/**
 * 헤더 정규화.
 *  · 구글 폼이 붙인 연속번호 접두사 제거 ("17. 재미 — …" → "재미 — …")
 *  · 유니코드 정규화(NFC), 앞뒤 공백 제거, 연속 공백 1칸으로
 *  · 따옴표·대시·중점의 표기 흔들림 통일
 * 이 함수를 거친 문자열끼리만 비교한다.
 */
function 헤더정규화_(s) {
  if (s === null || s === undefined) return '';
  var t = String(s);
  if (t.normalize) t = t.normalize('NFC');
  t = t.replace(/^\s*\d+(?:[-.]\d+)*\s*[.)]\s*/, '');   // 앞 번호 제거
  t = t.replace(/[‘’‛ʼ]/g, "'")      // 작은따옴표류
       .replace(/[“”‟]/g, '"')            // 큰따옴표류
       // 대시류 → em dash. ASCII 하이픈(-)까지 포함한다.
       // 사람이 문항을 다시 타이핑하며 — 를 - 로 쓰는 일이 흔하고,
       // Config 와 시트 헤더 양쪽에 똑같이 적용되므로 매칭이 넓어지기만 한다.
       .replace(/[-‐-―−－]/g, '—')
       .replace(/[·•・]/g, '·')            // 중점류
       .replace(/[ 　​]/g, ' ')       // NBSP · 전각공백 · 폭없는공백
       .replace(/\s+/g, ' ')
       .trim();
  return t;
}

/**
 * 헤더 행 → 열 매핑.
 * @return {{공통:Object, 고유:Array, 누락:Array, 중복:Array}}
 *   공통 : { 공통문항키 : 열인덱스 }
 *   고유 : [{ 문항:정규화된텍스트, 원문:원래헤더, 열:인덱스 }]  — 폼에 나온 순서 그대로
 *   누락 : 못 찾은 공통문항 키 목록
 *   중복 : 같은 공통문항에 두 열이 걸린 경우
 */
function 헤더맵만들기_(헤더행, 공통문항정의) {
  var 정규 = [];
  for (var i = 0; i < 헤더행.length; i++) 정규.push(헤더정규화_(헤더행[i]));

  // 후보 문구 → 공통문항 키 역인덱스
  var 역인덱스 = {};
  for (var 키 in 공통문항정의) {
    var 후보들 = 공통문항정의[키];
    for (var j = 0; j < 후보들.length; j++) {
      역인덱스[헤더정규화_(후보들[j])] = 키;
    }
  }

  var 공통 = {}, 사용됨 = {}, 중복 = [];
  for (var c = 0; c < 정규.length; c++) {
    var 키2 = 역인덱스[정규[c]];
    if (!키2) continue;
    if (공통.hasOwnProperty(키2)) { 중복.push({ 키: 키2, 열: c, 헤더: 헤더행[c] }); continue; }
    공통[키2] = c;
    사용됨[c] = true;
  }

  var 고유 = [];
  for (var d = 0; d < 정규.length; d++) {
    if (사용됨[d]) continue;
    if (!정규[d]) continue;                       // 빈 헤더 열은 버린다
    고유.push({ 문항: 정규[d], 원문: String(헤더행[d]), 열: d });
  }

  var 누락 = [];
  for (var 키3 in 공통문항정의) if (!공통.hasOwnProperty(키3)) 누락.push(키3);

  return { 공통: 공통, 고유: 고유, 누락: 누락, 중복: 중복 };
}

/**
 * 셀 값 → 다듬은 문자열. 항상 문자열을 돌려준다.
 * (날짜 셀이 섞여 들어와도 뒤쪽 .split · .replace 가 깨지지 않게 한다.
 *  타임스탬프처럼 날짜 객체 그대로 써야 하는 곳은 이 함수를 거치지 않는다.)
 */
function 문자_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    return (typeof Utilities !== 'undefined')
      ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
      : v.toISOString();
  }
  var s = String(v);
  if (s.normalize) s = s.normalize('NFC');
  return s.replace(/[ 　​]/g, ' ').trim();
}

/** 셀 값 → 숫자. 숫자가 아니면 null. */
function 숫자_(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? null : n;
}

/** 체크박스 답 한 칸 → 배열. 구글 폼은 ", " 로 이어 붙인다. */
function 복수답분해_(v) {
  var s = 문자_(v);
  if (!s) return [];
  var out = [], parts = s.split(/,\s+/);
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (p) out.push(p);
  }
  return out;
}

/** 서술형 무응답 판정 — 부록 B 에서 제외할 값 */
function 무응답_(s) {
  var t = 문자_(s);
  if (!t) return true;
  return /^(없음|없습니다|없어요|없다|무|-|\.|x|X|N\/A|na)$/.test(t.replace(/\s/g, ''));
}

/**
 * 응답 시트 한 장을 파싱한다.
 * @param 헤더행 배열
 * @param 데이터행 2차원 배열 (헤더 제외)
 * @param 게임설정 CONFIG.GAMES 의 한 항목
 * @param cfg CONFIG
 * @return {{응답:Array, 헤더맵:Object}}
 */
function 응답파싱_(헤더행, 데이터행, 게임설정, cfg) {
  var 맵 = 헤더맵만들기_(헤더행, cfg.공통문항);
  var 코드 = 게임설정.코드;

  var 체크셋 = {};
  var 체크목록 = (cfg.체크박스문항[코드] || []);
  for (var i = 0; i < 체크목록.length; i++) 체크셋[헤더정규화_(체크목록[i])] = true;

  function 셀(행, 키) {
    var c = 맵.공통[키];
    return (c === undefined) ? '' : 행[c];
  }

  var 응답 = [];
  for (var r = 0; r < 데이터행.length; r++) {
    var 행 = 데이터행[r];

    // 완전 빈 행은 건너뛴다
    var 비었나 = true;
    for (var k = 0; k < 행.length; k++) if (문자_(행[k]) !== '') { 비었나 = false; break; }
    if (비었나) continue;

    var 육각 = [];
    for (var a = 0; a < cfg.육각축.length; a++) 육각.push(숫자_(셀(행, cfg.육각축[a].키)));

    var 고유답 = [];
    for (var g = 0; g < 맵.고유.length; g++) {
      var q = 맵.고유[g];
      var 원값 = 문자_(행[q.열]);
      var 체크 = !!체크셋[q.문항];
      고유답.push({
        문항: q.문항,
        열: q.열,
        체크박스: 체크,
        답: 원값,
        값: 체크 ? 복수답분해_(원값) : (원값 ? [원값] : [])
      });
    }

    응답.push({
      행: r + 2,                                    // 시트 실제 행 번호 (헤더가 1행)
      게임코드: 코드,
      게임명: 게임설정.게임명,
      타임스탬프: 셀(행, '타임스탬프'),
      이름: 문자_(셀(행, '이름')),
      ID: '',                                        // 명부에서 채운다
      유형: '',                                      // 명부에서 채운다
      연령대: 문자_(셀(행, '연령대')),
      성별: 문자_(셀(행, '성별')),
      선호장르: 복수답분해_(셀(행, '선호장르')),
      육각: 육각,
      진행흐름: 숫자_(셀(행, '진행흐름')),
      기술안정성: 숫자_(셀(행, '기술안정성')),
      진행도: 문자_(셀(행, '진행도')),
      개선점: 문자_(셀(행, '개선점')),
      구매의향: 문자_(셀(행, '구매의향')),
      적정가격: 문자_(셀(행, '적정가격')),
      추천의향: 숫자_(셀(행, '추천의향')),
      버그경험: 문자_(셀(행, '버그경험')),
      버그상황: 문자_(셀(행, '버그상황')),
      개발팀메시지: 문자_(셀(행, '개발팀메시지')),
      고유: 고유답
    });
  }

  return { 응답: 응답, 헤더맵: 맵 };
}

/**
 * 한 점수 문항의 통계 한 줄.
 * @param 최소 최대 척도 범위. 안 주면 1~5 로 본다.
 *   긍정 = 위에서 두 눈금, 부정 = 아래에서 두 눈금.
 *   (1~5 면 4·5 와 1·2. 게임 고유 문항이 다른 범위를 쓰면 그에 맞춰 따라간다)
 */
function 축통계_(값들, 이름, 키, 최소, 최대) {
  최소 = (최소 === undefined || 최소 === null) ? 1 : 최소;
  최대 = (최대 === undefined || 최대 === null) ? 5 : 최대;

  var 유효 = [];
  for (var i = 0; i < 값들.length; i++) if (typeof 값들[i] === 'number') 유효.push(값들[i]);

  var 분포 = {};
  for (var v = 최소; v <= 최대; v++) 분포[v] = 0;
  for (var j = 0; j < 유효.length; j++) if (분포[유효[j]] !== undefined) 분포[유효[j]]++;

  var 긍정 = 0, 부정 = 0;
  for (var p = Math.max(최소, 최대 - 1); p <= 최대; p++) 긍정 += 분포[p] || 0;
  for (var n = 최소; n <= Math.min(최대, 최소 + 1); n++) 부정 += 분포[n] || 0;

  var m = 평균_(유효), sd = 표본표준편차_(유효);
  return {
    키: 키, 이름: 이름, N: 유효.length, 최소: 최소, 최대: 최대,
    평균: m === null ? null : 반올림_(m, 2),
    평균원값: m,
    표준편차: sd === null ? null : 반올림_(sd, 2),
    긍정: 긍정,
    부정: 부정,
    분포: 분포
  };
}

/** 빈도표 → [{답, 인원, 비율}] · 인원 내림차순 */
function 빈도표_(값들의배열, N) {
  var 맵 = {}, 순서 = [];
  for (var i = 0; i < 값들의배열.length; i++) {
    var 값들 = 값들의배열[i];
    for (var j = 0; j < 값들.length; j++) {
      var v = 값들[j];
      if (!맵.hasOwnProperty(v)) { 맵[v] = 0; 순서.push(v); }
      맵[v]++;
    }
  }
  var out = [];
  for (var k = 0; k < 순서.length; k++) {
    out.push({ 답: 순서[k], 인원: 맵[순서[k]], 비율: 백분율_(맵[순서[k]], N) });
  }
  out.sort(function (a, b) { return b.인원 - a.인원; });
  return out;
}

/**
 * 게임 하나의 지표를 계산한다.
 */
function 지표계산_(응답, cfg) {
  var N = 응답.length;
  var 육각 = [];
  for (var a = 0; a < cfg.육각축.length; a++) {
    var 축 = cfg.육각축[a];
    var 값들 = [];
    for (var i = 0; i < N; i++) 값들.push(응답[i].육각[a]);
    육각.push(축통계_(값들, 축.이름, 축.키));
  }
  var 추가 = [];
  for (var b = 0; b < cfg.추가축.length; b++) {
    var 축2 = cfg.추가축[b];
    var 값들2 = [];
    for (var i2 = 0; i2 < N; i2++) 값들2.push(응답[i2][축2.키]);
    추가.push(축통계_(값들2, 축2.이름, 축2.키));
  }

  // 6축 총평균 = 축별 평균의 평균 (기준선 gen_report.py 와 동일)
  var 축평균들 = [];
  for (var c = 0; c < 육각.length; c++) if (육각[c].평균원값 !== null) 축평균들.push(육각[c].평균원값);
  var 육각총평균 = 평균_(축평균들);

  // NPS
  var nps = [];
  for (var d = 0; d < N; d++) if (typeof 응답[d].추천의향 === 'number') nps.push(응답[d].추천의향);
  var 추천 = 0, 중립 = 0, 비추천 = 0;
  for (var e = 0; e < nps.length; e++) {
    if (nps[e] >= 9) 추천++; else if (nps[e] >= 7) 중립++; else 비추천++;
  }
  var npsN = nps.length;

  // 진행도 · 구매 의향 · 적정 가격 · 버그
  function 열모음(키) { var o = []; for (var i = 0; i < N; i++) o.push(응답[i][키] ? [응답[i][키]] : []); return o; }
  var 진행도표 = 빈도표_(열모음('진행도'), N);
  var 구매표   = 빈도표_(열모음('구매의향'), N);
  var 가격표   = 빈도표_(열모음('적정가격'), N);
  var 버그표   = 빈도표_(열모음('버그경험'), N);
  var 연령표   = 빈도표_(열모음('연령대'), N);
  var 성별표   = 빈도표_(열모음('성별'), N);
  var 장르목록 = []; for (var f = 0; f < N; f++) 장르목록.push(응답[f].선호장르);
  var 장르표   = 빈도표_(장르목록, N);

  function 카운트(표, 답) { for (var i = 0; i < 표.length; i++) if (표[i].답 === 답) return 표[i].인원; return 0; }

  var 구매 = cfg.구매선택지, 버그 = cfg.버그선택지;
  var 유료고려 = 카운트(구매표, 구매.정가) + 카운트(구매표, 구매.의향) + 카운트(구매표, 구매.할인);
  var 구매의향률 = 카운트(구매표, 구매.정가) + 카운트(구매표, 구매.의향);

  var 정체 = 0;
  for (var g = 0; g < N; g++) if (cfg.진행도_정체단계.indexOf(응답[g].진행도) >= 0) 정체++;

  // 서술형 응답률
  function 응답건수(키) { var n = 0; for (var i = 0; i < N; i++) if (!무응답_(응답[i][키])) n++; return n; }

  return {
    N: N,
    육각: 육각,
    추가: 추가,
    육각총평균: 육각총평균 === null ? null : 반올림_(육각총평균, 2),
    최고축: 최값축_(육각, true),
    최저축: 최값축_(육각, false),
    NPS: {
      N: npsN, 추천: 추천, 중립: 중립, 비추천: 비추천,
      추천율: 백분율_(추천, npsN), 중립율: 백분율_(중립, npsN), 비추천율: 백분율_(비추천, npsN),
      값: npsN ? 반올림_((추천 - 비추천) / npsN * 100) : null,
      평균: npsN ? 반올림_(평균_(nps), 1) : null
    },
    진행도: 진행도표, 구매의향: 구매표, 적정가격: 가격표, 버그경험: 버그표,
    연령대: 연령표, 성별: 성별표, 선호장르: 장르표,
    진행도정체: { 인원: 정체, 비율: 백분율_(정체, N) },
    유료고려: { 인원: 유료고려, 비율: 백분율_(유료고려, N) },
    구매의향률: { 인원: 구매의향률, 비율: 백분율_(구매의향률, N) },
    버그: {
      진행불가: 카운트(버그표, 버그.진행불가),
      지장:     카운트(버그표, 버그.지장),
      경미:     카운트(버그표, 버그.경미),
      없음:     카운트(버그표, 버그.없음),
      지장비율: 백분율_(카운트(버그표, 버그.지장), N)
    },
    응답률: {
      개선점: 응답건수('개선점'),
      버그상황: 응답건수('버그상황'),
      개발팀메시지: 응답건수('개발팀메시지')
    }
  };
}

function 최값축_(축들, 최대) {
  var best = null;
  for (var i = 0; i < 축들.length; i++) {
    if (축들[i].평균원값 === null) continue;
    if (!best || (최대 ? 축들[i].평균원값 > best.평균원값 : 축들[i].평균원값 < best.평균원값)) best = 축들[i];
  }
  return best ? { 이름: best.이름, 평균: best.평균 } : null;
}

/**
 * 게임 고유 문항의 유형을 응답으로부터 판별한다.
 * 자동 판별이 틀리면 CONFIG.게임_문항유형 에 적어 덮어쓴다.
 */
function 문항유형판정_(문항, 답목록, 체크박스, 게임코드, cfg) {
  var 덮어쓰기 = (cfg.게임_문항유형[게임코드] || {});
  for (var 키 in 덮어쓰기) if (헤더정규화_(키) === 문항) return 덮어쓰기[키];
  if (체크박스) return '체크박스';
  if (선형배율정의_(문항, 게임코드, cfg)) return '선형배율';

  var 부정 = (cfg.게임_부정선택지[게임코드] || {});
  for (var 키2 in 부정) if (헤더정규화_(키2) === 문항) return '객관식';

  // 게임별 기본값 — 고유 문항이 전부 서술형인 게임은 아예 추측하지 않는다
  var 기본 = (cfg.게임_기본문항유형 || {})[게임코드];
  if (기본 && 기본 !== '자동') return 기본;

  var 판별 = cfg.문항판별 || { 최대선택지수: 12, 최대답길이: 30 };
  var 유효 = [], 고유값 = {}, 고유수 = 0, 최대길이 = 0;
  for (var i = 0; i < 답목록.length; i++) {
    var v = 답목록[i];
    // '없음' · '-' 같은 무응답을 빼고 센다.
    // 서술형 문항에 "없었다면 '없음'이라고 적어 주세요" 안내가 붙어 있어서,
    // 이걸 세면 답이 두 종류뿐인 것처럼 보여 객관식으로 오인한다.
    if (무응답_(v)) continue;
    유효.push(v);
    if (v.length > 최대길이) 최대길이 = v.length;
    if (!고유값[v]) { 고유값[v] = true; 고유수++; }
  }
  if (!유효.length) return '서술형';
  if (고유수 <= 판별.최대선택지수 && 최대길이 <= 판별.최대답길이 && 고유수 < 유효.length) return '객관식';
  return '서술형';
}

/** 게임 고유 선형배율 문항 정의를 찾는다. 없으면 null. */
function 선형배율정의_(문항, 게임코드, cfg) {
  var 목록 = (cfg.게임_선형배율문항 || {})[게임코드] || [];
  for (var i = 0; i < 목록.length; i++) {
    if (헤더정규화_(목록[i].문항) === 문항) return 목록[i];
  }
  return null;
}

/**
 * 문항별 집계 — 부록 A 의 원천.
 * @return [{문항, 유형, 출처:'공통'|'고유', 집계:[{답,인원,비율}], 서술:[{ID,답}]}]
 */
function 문항집계_(응답, 게임설정, cfg) {
  var N = 응답.length, 코드 = 게임설정.코드, out = [];
  if (!N) return out;

  // 게임 고유 문항 — 폼 순서 그대로
  var 고유정의 = 응답[0].고유;
  for (var q = 0; q < 고유정의.length; q++) {
    var 문항 = 고유정의[q].문항, 체크 = 고유정의[q].체크박스;
    var 원답 = [], 값들 = [], 서술 = [];
    for (var i = 0; i < N; i++) {
      var 셀 = 응답[i].고유[q];
      원답.push(셀 ? 셀.답 : '');
      값들.push(셀 ? 셀.값 : []);
      if (셀 && !무응답_(셀.답)) 서술.push({ ID: 응답[i].ID, 답: 셀.답 });
    }
    var 유형 = 문항유형판정_(문항, 원답, 체크, 코드, cfg);
    var 항목 = {
      문항: 문항, 유형: 유형, 출처: '고유', 순서: q,
      집계: (유형 === '서술형') ? [] : 빈도표_(값들, N),
      서술: (유형 === '서술형') ? 서술 : [],
      통계: null
    };

    // 선형배율은 평균 · 표준편차를 내고 표를 점수 오름차순으로 세운다.
    // (인원 많은 순으로 늘어놓으면 '4점 5명 / 3점 4명' 처럼 읽기 어렵다)
    if (유형 === '선형배율') {
      var 정의 = 선형배율정의_(문항, 코드, cfg);
      var 점수 = [];
      for (var s = 0; s < 원답.length; s++) 점수.push(숫자_(원답[s]));
      항목.통계 = 축통계_(점수, 문항, null, 정의.최소, 정의.최대);
      var 표 = [];
      for (var v2 = 정의.최소; v2 <= 정의.최대; v2++) {
        var 인원 = 항목.통계.분포[v2] || 0;
        표.push({ 답: String(v2), 인원: 인원, 비율: 백분율_(인원, N) });
      }
      항목.집계 = 표;
    }
    out.push(항목);
  }

  // 공통 객관식 문항
  var 공통표 = [
    ['진행도', '진행도'], ['구매의향', '스팀 구매 의향'],
    ['적정가격', '적정 가격'], ['버그경험', '버그 경험']
  ];
  for (var c = 0; c < 공통표.length; c++) {
    var 키 = 공통표[c][0], 라벨 = 공통표[c][1], 모음 = [];
    for (var j = 0; j < N; j++) 모음.push(응답[j][키] ? [응답[j][키]] : []);
    out.push({ 문항: 라벨, 유형: '객관식', 출처: '공통', 키: 키, 집계: 빈도표_(모음, N), 서술: [] });
  }
  return out;
}

/** 응답자 집합의 요약 한 줄 (세그먼트 표용) */
function 세그요약_(라벨, 그룹, cfg) {
  if (!그룹.length) return { 라벨: 라벨, 인원: 0, 육각평균: null, NPS평균: null, 진행흐름: null, 출시기대감: null, 정체: 0 };
  var 개인평균 = [], nps = [], flow = [], 기대 = [], 정체 = 0;
  for (var i = 0; i < 그룹.length; i++) {
    var r = 그룹[i], 유효 = [];
    for (var a = 0; a < r.육각.length; a++) if (typeof r.육각[a] === 'number') 유효.push(r.육각[a]);
    if (유효.length) 개인평균.push(평균_(유효));
    if (typeof r.추천의향 === 'number') nps.push(r.추천의향);
    if (typeof r.진행흐름 === 'number') flow.push(r.진행흐름);
    if (typeof r.육각[5] === 'number') 기대.push(r.육각[5]);
    if (cfg.진행도_정체단계.indexOf(r.진행도) >= 0) 정체++;
  }
  return {
    라벨: 라벨, 인원: 그룹.length,
    육각평균: 개인평균.length ? 반올림_(평균_(개인평균), 2) : null,
    NPS평균: nps.length ? 반올림_(평균_(nps), 1) : null,
    진행흐름: flow.length ? 반올림_(평균_(flow), 2) : null,
    출시기대감: 기대.length ? 반올림_(평균_(기대), 2) : null,
    정체: 정체
  };
}

/** 리포트 4장 세그먼트 */
function 세그먼트_(응답, 게임설정, cfg) {
  var 코드 = 게임설정.코드;
  var 코어장르 = cfg.게임_코어장르[코드] || [];
  var 코어 = [], 비코어 = [];
  for (var i = 0; i < 응답.length; i++) {
    var 맞나 = false;
    for (var g = 0; g < 코어장르.length; g++) if (응답[i].선호장르.indexOf(코어장르[g]) >= 0) { 맞나 = true; break; }
    (맞나 ? 코어 : 비코어).push(응답[i]);
  }

  var 결과 = {
    코어장르: 코어장르,
    장르: [세그요약_(코어장르.join(' · ') + ' 선호', 코어, cfg),
           세그요약_('그 외 장르 선호', 비코어, cfg)],
    튜토리얼: null,
    진행: null
  };

  // 튜토리얼 문항이 있는 게임만 4-2 를 만든다
  var 튜 = cfg.게임_튜토리얼문항[코드];
  if (튜 && 응답.length) {
    var 정규문항 = 헤더정규화_(튜.문항);
    var 열 = -1;
    for (var q = 0; q < 응답[0].고유.length; q++) if (응답[0].고유[q].문항 === 정규문항) { 열 = q; break; }
    if (열 >= 0) {
      var 그룹맵 = {}, 순서 = [];
      for (var j = 0; j < 응답.length; j++) {
        var 답 = 응답[j].고유[열].답 || '(무응답)';
        if (!그룹맵[답]) { 그룹맵[답] = []; 순서.push(답); }
        그룹맵[답].push(응답[j]);
      }
      순서.sort(function (a, b) { return 그룹맵[b].length - 그룹맵[a].length; });
      var 행들 = [];
      for (var k = 0; k < 순서.length; k++) 행들.push(세그요약_("튜토리얼 '" + 순서[k] + "'", 그룹맵[순서[k]], cfg));
      결과.튜토리얼 = { 문항: 정규문항, 행: 행들 };
    }
  }

  // 진행도 기반 분화 — 모든 게임에 적용 가능한 대체 세그먼트
  var 도달 = [], 미도달 = [];
  for (var m = 0; m < 응답.length; m++) {
    (cfg.진행도_정체단계.indexOf(응답[m].진행도) >= 0 ? 미도달 : 도달).push(응답[m]);
  }
  결과.진행 = [세그요약_('본편 진입', 도달, cfg), 세그요약_('튜토리얼 단계 정체', 미도달, cfg)];

  return 결과;
}

// ── 이슈 플래그 ─────────────────────────────────────────────────────────────

function 플래그_(심각도, 규칙, 제목, 근거, 첨부) {
  return { 심각도: 심각도, 규칙: 규칙, 제목: 제목, 근거: 근거, 첨부: 첨부 || [] };
}

/** 조건에 맞는 응답자의 서술을 뽑아 첨부한다. */
function 서술뽑기_(응답들, 키, 라벨) {
  var out = [];
  for (var i = 0; i < 응답들.length; i++) {
    if (!무응답_(응답들[i][키])) out.push({ ID: 응답들[i].ID, 라벨: 라벨, 글: 응답들[i][키] });
  }
  return out;
}

/**
 * 이슈 플래그 판정.
 * 규칙은 설계안 4장 표를 그대로 옮긴 것이고, 숫자는 전부 CONFIG.임계값 에서 온다.
 * 담당자가 취사선택할 '후보'를 뽑는 것이 목적이지 결론을 내는 것이 아니다.
 */
function 플래그판정_(지표, 문항집계, 응답, 게임설정, cfg) {
  var T = cfg.임계값, N = 지표.N, 코드 = 게임설정.코드, out = [];
  if (!N) return out;

  // ── 규칙 1·2 : 6축 항목 평균 ──
  for (var i = 0; i < 지표.육각.length; i++) {
    var 축 = 지표.육각[i];
    if (축.평균 === null) continue;
    var 저점자 = [];
    for (var j = 0; j < N; j++) if (응답[j].육각[i] !== null && 응답[j].육각[i] <= 2) 저점자.push(응답[j]);
    if (축.평균원값 < T.육각평균_Critical) {
      out.push(플래그_('Critical', '6축평균',축.이름 + ' 평균이 ' + 축.평균.toFixed(2) + '점입니다',
        축.이름 + ' 평균 ' + 축.평균.toFixed(2) + ' (기준 ' + T.육각평균_Critical + ' 미만) · 1~2점 ' + 축.부정 + '명(' + 백분율_(축.부정, N) + '%)' +
        ' · 진행도 정체 ' + 지표.진행도정체.인원 + '명(' + 지표.진행도정체.비율 + '%)',
        서술뽑기_(저점자, '개선점', '개선점')));
    } else if (축.평균원값 < T.육각평균_High) {
      out.push(플래그_('High', '6축평균', 축.이름 + ' 평균이 ' + 축.평균.toFixed(2) + '점입니다',
        축.이름 + ' 평균 ' + 축.평균.toFixed(2) + ' (기준 ' + T.육각평균_High + ' 미만) · 1~2점 ' + 축.부정 + '명(' + 백분율_(축.부정, N) + '%)',
        서술뽑기_(저점자, '개선점', '개선점')));
    }
  }

  // ── 규칙 1·2·10 확장 : 게임 고유 선형배율 문항 ──
  //   공통 6축과 같은 잣대를 게임이 따로 묻는 점수 문항에도 적용한다.
  //   (어센디아처럼 회사 문항에 1~5점 척도가 있는 경우)
  for (var sc = 0; sc < 문항집계.length; sc++) {
    var 항0 = 문항집계[sc];
    if (항0.유형 !== '선형배율' || !항0.통계 || 항0.통계.평균 === null) continue;
    var st = 항0.통계;
    // 5점 만점이 아닌 척도는 5점으로 환산해 같은 임계값을 쓴다
    var 환산 = (st.평균원값 - st.최소) / (st.최대 - st.최소) * 4 + 1;
    var 저점 = [], 고점 = [];
    for (var sr = 0; sr < N; sr++) {
      var 셀0 = null;
      for (var sq = 0; sq < 응답[sr].고유.length; sq++) if (응답[sr].고유[sq].문항 === 항0.문항) { 셀0 = 응답[sr].고유[sq]; break; }
      var 점0 = 셀0 ? 숫자_(셀0.답) : null;
      if (점0 === null) continue;
      if (점0 <= st.최소 + 1) 저점.push(응답[sr]);
      else if (점0 >= st.최대) 고점.push(응답[sr]);
    }
    var 꼬리 = ' (' + st.최소 + '~' + st.최대 + '점 척도 · 응답 ' + st.N + '명 · 낮은 쪽 ' + st.부정 + '명 · 높은 쪽 ' + st.긍정 + '명)';
    if (환산 < T.육각평균_Critical) {
      out.push(플래그_('Critical', '고유점수', 항0.문항 + ' 평균 ' + st.평균.toFixed(2) + '점',
        '평균 ' + st.평균.toFixed(2) + 꼬리 + ' · 기준 ' + T.육각평균_Critical + ' 미만',
        서술뽑기_(저점, '개선점', '개선점')));
    } else if (환산 < T.육각평균_High) {
      out.push(플래그_('High', '고유점수', 항0.문항 + ' 평균 ' + st.평균.toFixed(2) + '점',
        '평균 ' + st.평균.toFixed(2) + 꼬리 + ' · 기준 ' + T.육각평균_High + ' 미만',
        서술뽑기_(저점, '개선점', '개선점')));
    } else if (환산 >= T.강점_평균) {
      out.push(플래그_('강점', '고유점수', 항0.문항 + ' 평균 ' + st.평균.toFixed(2) + '점',
        '평균 ' + st.평균.toFixed(2) + 꼬리 + ' · 기준 ' + T.강점_평균 + ' 이상',
        서술뽑기_(고점, '개발팀메시지', '개발팀에 전하고 싶은 말')));
    }
    if (st.표준편차 !== null && st.표준편차 >= T.검토필요_표준편차) {
      out.push(플래그_('검토필요', '고유점수', 항0.문항 + ' 은(는) 평가가 갈렸습니다',
        '표준편차 ' + st.표준편차.toFixed(2) + 꼬리 + ' · 기준 ' + T.검토필요_표준편차 + ' 이상',
        서술뽑기_(고점, '개발팀메시지', '고득점자 메시지').concat(서술뽑기_(저점, '개선점', '저득점자 개선점'))));
    }
  }

  // ── 규칙 10 : 강점 ──
  for (var s = 0; s < 지표.육각.length; s++) {
    var 축2 = 지표.육각[s];
    if (축2.평균 === null || 축2.평균원값 < T.강점_평균) continue;
    var 만점자 = [];
    for (var t = 0; t < N; t++) if (응답[t].육각[s] === 5) 만점자.push(응답[t]);
    out.push(플래그_('강점', '강점', 축2.이름 + ' 은(는) 지키는 것이 최선입니다',
      축2.이름 + ' 평균 ' + 축2.평균.toFixed(2) + ' (기준 ' + T.강점_평균 + ' 이상) · 4~5점 ' + 축2.긍정 + '명(' + 백분율_(축2.긍정, N) + '%)',
      서술뽑기_(만점자, '개발팀메시지', '개발팀에 전하고 싶은 말')));
  }

  // ── 규칙 11 : 표준편차 ──
  var 전체축 = 지표.육각.concat(지표.추가);
  for (var u = 0; u < 전체축.length; u++) {
    var 축3 = 전체축[u];
    if (축3.표준편차 === null || 축3.표준편차 < T.검토필요_표준편차) continue;
    var idx = u < 지표.육각.length ? u : -1;
    var 고득 = [], 저득 = [];
    for (var v = 0; v < N; v++) {
      var 점 = idx >= 0 ? 응답[v].육각[idx] : 응답[v][축3.키];
      if (점 >= 4) 고득.push(응답[v]); else if (점 <= 2) 저득.push(응답[v]);
    }
    out.push(플래그_('검토필요', '표준편차', 축3.이름 + ' 은(는) 사람마다 평가가 갈렸습니다',
      축3.이름 + ' 표준편차 ' + 축3.표준편차.toFixed(2) + ' (기준 ' + T.검토필요_표준편차 + ' 이상) · 4~5점 ' + 축3.긍정 + '명 vs 1~2점 ' + 축3.부정 + '명',
      서술뽑기_(고득, '개발팀메시지', '고득점자 메시지').concat(서술뽑기_(저득, '개선점', '저득점자 개선점'))));
  }

  // ── 규칙 7 : 튜토리얼 '어려움' ──
  var 튜 = cfg.게임_튜토리얼문항[코드];
  var 튜문항정규 = 튜 ? 헤더정규화_(튜.문항) : null;
  if (튜) {
    var 열 = -1;
    for (var w = 0; w < 응답[0].고유.length; w++) if (응답[0].고유[w].문항 === 튜문항정규) { 열 = w; break; }
    if (열 >= 0) {
      var 어려운사람 = [];
      for (var x = 0; x < N; x++) {
        if (튜.어려움.indexOf(응답[x].고유[열].답) >= 0) 어려운사람.push(응답[x]);
      }
      var 비율 = 어려운사람.length / N;
      if (비율 >= T.튜토리얼어려움) {
        out.push(플래그_('Critical', '튜토리얼', '튜토리얼을 어려워한 응답자가 ' + 백분율_(어려운사람.length, N) + '% 입니다',
          튜문항정규 + " — '" + 튜.어려움.join("' · '") + "' " + 어려운사람.length + '명(' + 백분율_(어려운사람.length, N) + '%, 기준 ' +
          반올림_(T.튜토리얼어려움 * 100) + '% 이상) · 진행도 정체 ' + 지표.진행도정체.인원 + '명(' + 지표.진행도정체.비율 + '%)',
          서술뽑기_(어려운사람, '개선점', '개선점')));
      }
    }
  }

  // ── 규칙 8 : 진행도 정체 ──
  if (지표.진행도정체.인원 / N >= T.진행도정체) {
    var 정체자 = [];
    for (var y = 0; y < N; y++) if (cfg.진행도_정체단계.indexOf(응답[y].진행도) >= 0) 정체자.push(응답[y]);
    out.push(플래그_('Critical', '진행도', '응답자 ' + 지표.진행도정체.비율 + '% 가 본편에 들어가지 못했습니다',
      '진행도 ' + cfg.진행도_정체단계.join(' · ') + ' ' + 지표.진행도정체.인원 + '명(' + 지표.진행도정체.비율 + '%, 기준 ' +
      반올림_(T.진행도정체 * 100) + '% 이상)',
      서술뽑기_(정체자, '개선점', '개선점').concat(서술뽑기_(정체자, '개발팀메시지', '개발팀에 전하고 싶은 말'))));
  }

  // ── 규칙 5·6 : 버그 ──
  if (지표.버그.진행불가 >= T.진행불가버그_건수) {
    var 진행불가자 = [];
    for (var z = 0; z < N; z++) if (응답[z].버그경험 === cfg.버그선택지.진행불가) 진행불가자.push(응답[z]);
    out.push(플래그_('Critical', '버그', "'진행이 불가능할 정도' 버그가 " + 지표.버그.진행불가 + '건 보고됐습니다',
      "'" + cfg.버그선택지.진행불가 + "' " + 지표.버그.진행불가 + '명(' + 백분율_(지표.버그.진행불가, N) + '%, 기준 ' + T.진행불가버그_건수 + '건 이상)',
      서술뽑기_(진행불가자, '버그상황', '버그 상황')));
  }
  if (지표.버그.지장 / N >= T.지장버그_High) {
    var 지장자 = [];
    for (var aa = 0; aa < N; aa++) if (응답[aa].버그경험 === cfg.버그선택지.지장) 지장자.push(응답[aa]);
    out.push(플래그_('High', '버그', '플레이에 지장을 준 버그가 ' + 지표.버그.지장비율 + '% 에게서 나왔습니다',
      "'" + cfg.버그선택지.지장 + "' " + 지표.버그.지장 + '명(' + 지표.버그.지장비율 + '%, 기준 ' +
      반올림_(T.지장버그_High * 100) + '% 이상) · 기술 안정성 ' + (지표.추가[1].평균 !== null ? 지표.추가[1].평균.toFixed(2) : '-') + '점',
      서술뽑기_(지장자, '버그상황', '버그 상황')));
  }

  // ── 규칙 9 : NPS 비추천 ──
  if (지표.NPS.N && 지표.NPS.비추천 / 지표.NPS.N >= T.NPS비추천_High) {
    var 비추천자 = [];
    for (var bb = 0; bb < N; bb++) if (typeof 응답[bb].추천의향 === 'number' && 응답[bb].추천의향 <= 6) 비추천자.push(응답[bb]);
    out.push(플래그_('High', 'NPS', '비추천(0~6점) 응답자가 ' + 지표.NPS.비추천율 + '% 입니다',
      'NPS ' + 지표.NPS.값 + ' · 비추천 ' + 지표.NPS.비추천 + '명(' + 지표.NPS.비추천율 + '%, 기준 ' +
      반올림_(T.NPS비추천_High * 100) + '% 이상) · 추천 ' + 지표.NPS.추천 + '명 · 중립 ' + 지표.NPS.중립 + '명',
      서술뽑기_(비추천자, '개선점', '개선점')));
  }

  // ── 규칙 3·4 : 부정 선택지 응답률 ──
  //   전용 규칙(튜토리얼·진행도)이 이미 잡은 문항은 중복 판정하지 않는다.
  var 부정정의 = cfg.게임_부정선택지[코드] || {};
  var 부정정규 = {};
  for (var 키 in 부정정의) 부정정규[헤더정규화_(키)] = 부정정의[키];

  for (var cc = 0; cc < 문항집계.length; cc++) {
    var 항 = 문항집계[cc];
    var 부정목록 = null;
    if (항.출처 === '고유') {
      if (튜문항정규 && 항.문항 === 튜문항정규) continue;      // 튜토리얼 규칙과 중복
      부정목록 = 부정정규[항.문항];
    } else if (항.키 && cfg.공통_부정선택지[항.키]) {
      if (항.키 === '진행도') continue;                        // 진행도 규칙과 중복
      부정목록 = cfg.공통_부정선택지[항.키];
    }
    if (!부정목록 || !부정목록.length) continue;

    for (var dd = 0; dd < 부정목록.length; dd++) {
      var 선택지 = 부정목록[dd], 인원 = 0;
      for (var ee = 0; ee < 항.집계.length; ee++) if (항.집계[ee].답 === 선택지) { 인원 = 항.집계[ee].인원; break; }
      if (!인원) continue;
      var 율 = 인원 / N;
      if (율 < T.부정선택지_High) continue;
      var 심각 = 율 >= T.부정선택지_Critical ? 'Critical' : 'High';

      var 고른사람 = [];
      for (var ff = 0; ff < N; ff++) {
        var 답들;
        if (항.출처 === '고유') {
          var 셀2 = null;
          for (var gg = 0; gg < 응답[ff].고유.length; gg++) if (응답[ff].고유[gg].문항 === 항.문항) { 셀2 = 응답[ff].고유[gg]; break; }
          답들 = 셀2 ? 셀2.값 : [];
        } else {
          답들 = 응답[ff][항.키] ? [응답[ff][항.키]] : [];
        }
        if (답들.indexOf(선택지) >= 0) 고른사람.push(응답[ff]);
      }
      out.push(플래그_(심각, '부정선택지', 항.문항 + " — '" + 선택지 + "' " + 백분율_(인원, N) + '%',
        "'" + 선택지 + "' " + 인원 + '명 / ' + N + '명 (' + 백분율_(인원, N) + '%, 기준 ' +
        반올림_(T.부정선택지_High * 100) + '% 이상 High · ' + 반올림_(T.부정선택지_Critical * 100) + '% 이상 Critical)',
        서술뽑기_(고른사람, '개선점', '개선점')));
    }
  }

  // 심각도 순 정렬
  var 순위 = { Critical: 0, High: 1, 검토필요: 2, 강점: 3 };
  out.sort(function (a, b) {
    var d = (순위[a.심각도] === undefined ? 9 : 순위[a.심각도]) - (순위[b.심각도] === undefined ? 9 : 순위[b.심각도]);
    return d !== 0 ? d : 0;
  });
  return out;
}

/**
 * 게임 하나를 통째로 집계한다. 파싱된 응답을 받아 모든 계산 결과를 돌려준다.
 * 시트를 건드리지 않으므로 Node 에서 그대로 돌릴 수 있다.
 */
function 게임집계_(응답, 게임설정, cfg) {
  var 지표 = 지표계산_(응답, cfg);
  var 문항 = 문항집계_(응답, 게임설정, cfg);
  return {
    게임: 게임설정,
    응답: 응답,
    지표: 지표,
    문항집계: 문항,
    세그먼트: 세그먼트_(응답, 게임설정, cfg),
    플래그: 플래그판정_(지표, 문항, 응답, 게임설정, cfg),
    서술모음: 서술모음_(응답)
  };
}

/** 부록 B 원천 — 공통 서술형 4종 + 게임 고유 서술형 */
function 서술모음_(응답) {
  var 공통 = [
    { 키: '개선점',       라벨: '현재 빌드에서 수정 · 개선되었으면 하는 점' },
    { 키: '버그상황',     라벨: '버그 · 오류 발생 상황' },
    { 키: '개발팀메시지',라벨: '개발팀에 전하고 싶은 말' }
  ];
  var out = [];
  for (var i = 0; i < 공통.length; i++) {
    var 항목 = [];
    for (var j = 0; j < 응답.length; j++) {
      if (!무응답_(응답[j][공통[i].키])) 항목.push({ ID: 응답[j].ID, 글: 응답[j][공통[i].키] });
    }
    out.push({ 라벨: 공통[i].라벨, 출처: '공통', 건수: 항목.length, 항목: 항목 });
  }
  return out;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ [B] 시트 입출력                                                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/** 마스터 시트(스크립트가 붙어 있는 스프레드시트) */
function 마스터_() { return SpreadsheetApp.getActiveSpreadsheet(); }

/**
 * 시트에 최소 이만큼의 행 · 열이 있게 만든다.
 * 새 시트는 기본이 1000행 × 26열이라, 열이 26개를 넘거나 행이 1000개를 넘으면
 * setValues 가 "범위를 벗어났습니다" 로 죽는다. 미리 늘려 둔다.
 */
function 크기확보_(sh, 필요행, 필요열) {
  var 행 = sh.getMaxRows(), 열 = sh.getMaxColumns();
  if (필요행 > 행) sh.insertRowsAfter(행, 필요행 - 행);
  if (필요열 > 열) sh.insertColumnsAfter(열, 필요열 - 열);
}

/** 탭을 가져오거나 없으면 만든다. '_' 로 시작하면 숨긴다. */
function 탭_(이름, 헤더) {
  var ss = 마스터_(), sh = ss.getSheetByName(이름);
  if (!sh) {
    sh = ss.insertSheet(이름);
    if (이름.charAt(0) === '_') sh.hideSheet();
  }
  if (헤더 && 헤더.length) {
    크기확보_(sh, 1, 헤더.length);
    sh.getRange(1, 1, 1, 헤더.length).setValues([헤더]).setFontWeight('bold').setBackground('#F1F6FB');
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * 헤더 1행만 남기고 지운다.
 * clearContent 가 아니라 clear 를 쓰는 이유: _플래그 탭은 심각도별로
 * 배경색을 칠하므로, 내용만 지우면 지난번 색이 빈 줄에 남는다.
 */
function 탭비우기_(sh) {
  var 마지막 = sh.getLastRow();
  if (마지막 > 1) sh.getRange(2, 1, 마지막 - 1, sh.getMaxColumns()).clear();
}

/** 이름 정규화 — 명부 대조용 */
function 이름정규화_(s) {
  var t = 문자_(s);
  return t.replace(/\s+/g, '');
}

/**
 * _명부 시트를 읽는다. → { 이름키: {ID, 유형, 이름} }
 * 시트가 없으면 만든다.
 */
function 명부읽기_() {
  var cfg = CONFIG;
  var sh = 탭_(cfg.시트.명부, ['이름', 'ID', '유형', '비고']);
  var 마지막 = sh.getLastRow();
  var 맵 = {}, 목록 = [], 사용된ID = {}, 중복 = [];
  if (마지막 >= 2) {
    var 값 = sh.getRange(2, 1, 마지막 - 1, 4).getValues();
    for (var i = 0; i < 값.length; i++) {
      var 이름 = 문자_(값[i][0]);
      if (!이름) continue;
      var 키 = 이름정규화_(이름);
      var 항 = { 이름: 이름, ID: 문자_(값[i][1]), 유형: 문자_(값[i][2]) || cfg.응답자.기본유형, 행: i + 2 };
      if (맵[키]) 중복.push(이름); else 맵[키] = 항;
      if (항.ID) 사용된ID[항.ID] = true;
      목록.push(항);
    }
  }
  return { 시트: sh, 맵: 맵, 목록: 목록, 사용된ID: 사용된ID, 중복: 중복 };
}

/** 다음 빈 응답자 ID */
function 다음ID_(사용된ID) {
  var cfg = CONFIG.응답자;
  for (var n = 1; n <= 999; n++) {
    var s = String(n);
    while (s.length < cfg.자리수) s = '0' + s;
    var id = cfg.접두사 + s;
    if (!사용된ID[id]) return id;
  }
  throw new Error('응답자 ID 가 바닥났습니다.');
}

/**
 * 응답에 ID · 유형을 채운다. 명부에 없는 이름은 새 ID 를 발급해 명부에 추가한다.
 * 이름은 여기서만 쓰이고 산출물에는 절대 나가지 않는다.
 */
function 명부적용_(모든응답, 명부) {
  var cfg = CONFIG, 추가 = [];
  for (var i = 0; i < 모든응답.length; i++) {
    var r = 모든응답[i];
    var 키 = 이름정규화_(r.이름);
    if (!키) { r.ID = ''; r.유형 = cfg.응답자.미상유형; continue; }
    var 항 = 명부.맵[키];
    if (!항) {
      var 새ID = 다음ID_(명부.사용된ID);
      명부.사용된ID[새ID] = true;
      항 = { 이름: r.이름, ID: 새ID, 유형: cfg.응답자.미상유형 };
      명부.맵[키] = 항;
      추가.push([r.이름, 새ID, cfg.응답자.미상유형, '응답에서 자동 등록 — 유형을 확인해 주세요']);
    } else if (!항.ID) {
      항.ID = 다음ID_(명부.사용된ID);
      명부.사용된ID[항.ID] = true;
      명부.시트.getRange(항.행, 2).setValue(항.ID);
    }
    r.ID = 항.ID;
    r.유형 = 항.유형 || cfg.응답자.기본유형;
  }
  if (추가.length) {
    명부.시트.getRange(명부.시트.getLastRow() + 1, 1, 추가.length, 4).setValues(추가);
  }
  return 추가.length;
}

/** 게임 하나의 응답 시트를 읽는다. 원본은 절대 수정하지 않는다. */
function 응답읽기_(게임설정) {
  if (!게임설정.응답시트ID) {
    return { 오류: '응답시트ID 가 비어 있습니다 (Config.gs 의 GAMES 를 채워 주세요)', 헤더: [], 행: [] };
  }
  var ss;
  try {
    ss = SpreadsheetApp.openById(게임설정.응답시트ID);
  } catch (e) {
    return { 오류: '응답 시트를 열 수 없습니다: ' + e.message, 헤더: [], 행: [] };
  }
  var sh = 게임설정.탭이름 ? ss.getSheetByName(게임설정.탭이름) : ss.getSheets()[0];
  if (!sh) return { 오류: "탭 '" + 게임설정.탭이름 + "' 이 없습니다", 헤더: [], 행: [] };
  if (sh.getLastRow() < 1) return { 오류: null, 헤더: [], 행: [] };

  var 값 = sh.getDataRange().getValues();
  return { 오류: null, 헤더: 값[0], 행: 값.slice(1), 시트이름: sh.getName() };
}

/**
 * 전체 집계 실행. 메뉴 [플레이테스트] → 집계 새로고침 의 알맹이.
 * @return 게임별 집계 결과 배열
 */
function 집계실행() {
  var cfg = CONFIG;
  var 시작 = new Date();
  var 명부 = 명부읽기_();
  var 결과 = [];
  var 경고 = [];

  for (var i = 0; i < cfg.GAMES.length; i++) {
    var 게임 = cfg.GAMES[i];
    var 원시 = 응답읽기_(게임);
    if (원시.오류) {
      경고.push('[' + 게임.게임명 + '] ' + 원시.오류);
      결과.push({ 게임: 게임, 오류: 원시.오류, 응답: [], 지표: null });
      continue;
    }
    var 파싱 = 응답파싱_(원시.헤더, 원시.행, 게임, cfg);
    if (파싱.헤더맵.누락.length) {
      경고.push('[' + 게임.게임명 + '] 못 찾은 공통 문항: ' + 파싱.헤더맵.누락.join(', '));
    }
    if (파싱.헤더맵.중복.length) {
      경고.push('[' + 게임.게임명 + '] 같은 공통 문항에 두 열이 걸렸습니다: ' +
                파싱.헤더맵.중복.map(function (x) { return x.키; }).join(', '));
    }
    명부적용_(파싱.응답, 명부);
    var 집계 = 게임집계_(파싱.응답, 게임, cfg);
    집계.헤더맵 = 파싱.헤더맵;
    결과.push(집계);
  }

  집계쓰기_(결과);
  대시보드갱신_(결과, 명부, 경고);
  로그쓰기_('집계 새로고침', 시작, new Date(), 결과, 경고);
  return 결과;
}

/** 집계 결과를 _집계_* 탭에 쓴다 */
function 집계쓰기_(결과) {
  var cfg = CONFIG;

  // ── _집계_게임 : 게임당 한 줄 ──
  var 헤더1 = ['게임코드', '게임명', '개발사', '응답수', '6축 평균'];
  for (var a = 0; a < cfg.육각축.length; a++) 헤더1.push(cfg.육각축[a].이름);
  for (var b = 0; b < cfg.추가축.length; b++) 헤더1.push(cfg.추가축[b].이름);
  헤더1 = 헤더1.concat(['NPS', '추천', '중립', '비추천', '구매 의향%', '유료 고려%',
                        '진행도 정체%', '진행불가 버그', '지장 버그', '플래그 Critical', '플래그 High', '갱신 시각']);
  var sh1 = 탭_(cfg.시트.집계_게임, 헤더1);
  탭비우기_(sh1);

  var 행들 = [], 지금 = new Date();
  for (var i = 0; i < 결과.length; i++) {
    var R = 결과[i];
    if (!R.지표) { 행들.push([R.게임.코드, R.게임.게임명, R.게임.개발사, 0, R.오류 || '']); continue; }
    var m = R.지표, 행 = [R.게임.코드, R.게임.게임명, R.게임.개발사, m.N, m.육각총평균];
    for (var c = 0; c < m.육각.length; c++) 행.push(m.육각[c].평균);
    for (var d = 0; d < m.추가.length; d++) 행.push(m.추가[d].평균);
    var crit = 0, high = 0;
    for (var e = 0; e < R.플래그.length; e++) {
      if (R.플래그[e].심각도 === 'Critical') crit++;
      else if (R.플래그[e].심각도 === 'High') high++;
    }
    행 = 행.concat([m.NPS.값, m.NPS.추천, m.NPS.중립, m.NPS.비추천,
                    m.구매의향률.비율, m.유료고려.비율, m.진행도정체.비율,
                    m.버그.진행불가, m.버그.지장, crit, high, 지금]);
    행들.push(행);
  }
  if (행들.length) 쓰기_(sh1, 2, 행들);

  // ── _집계_문항 : 게임 × 문항 × 선택지 ──
  var sh2 = 탭_(cfg.시트.집계_문항,
    ['게임코드', '게임명', '출처', '문항', '유형', '선택지', '인원', '비율%', '평균', '표준편차']);
  탭비우기_(sh2);
  var 행2 = [];
  for (var f = 0; f < 결과.length; f++) {
    var R2 = 결과[f];
    if (!R2.문항집계) continue;
    for (var g = 0; g < R2.문항집계.length; g++) {
      var 항 = R2.문항집계[g];
      if (항.유형 === '서술형') {
        행2.push([R2.게임.코드, R2.게임.게임명, 항.출처, 항.문항, 항.유형, '(서술형)', 항.서술.length, '', '', '']);
        continue;
      }
      // 선형배율은 첫 줄에만 평균 · 표준편차를 적는다
      var 평균 = 항.통계 ? 항.통계.평균 : '';
      var 편차 = 항.통계 ? 항.통계.표준편차 : '';
      for (var h = 0; h < 항.집계.length; h++) {
        행2.push([R2.게임.코드, R2.게임.게임명, 항.출처, 항.문항, 항.유형,
                  항.집계[h].답, 항.집계[h].인원, 항.집계[h].비율,
                  h === 0 ? 평균 : '', h === 0 ? 편차 : '']);
      }
    }
  }
  if (행2.length) 쓰기_(sh2, 2, 행2);

  // ── _집계_응답자 : 부록 C 원천 ──
  var 헤더3 = ['게임코드', '게임명', 'ID', '유형', '연령대', '성별', '주 장르'];
  for (var i3 = 0; i3 < cfg.육각축.length; i3++) 헤더3.push(cfg.육각축[i3].이름);
  헤더3 = 헤더3.concat(['진행 흐름', '기술 안정성', 'NPS', '진행도', '구매 의향', '적정 가격', '버그 경험', '제출 시각']);
  var sh3 = 탭_(cfg.시트.집계_응답자, 헤더3);
  탭비우기_(sh3);
  var 행3 = [];
  for (var j = 0; j < 결과.length; j++) {
    var R3 = 결과[j];
    for (var k = 0; k < (R3.응답 || []).length; k++) {
      var r = R3.응답[k];
      var 줄 = [R3.게임.코드, R3.게임.게임명, r.ID, r.유형, r.연령대, r.성별, r.선호장르[0] || ''];
      for (var l = 0; l < r.육각.length; l++) 줄.push(r.육각[l]);
      줄 = 줄.concat([r.진행흐름, r.기술안정성, r.추천의향, r.진행도, r.구매의향, r.적정가격, r.버그경험, r.타임스탬프]);
      행3.push(줄);
    }
  }
  if (행3.length) 쓰기_(sh3, 2, 행3);

  // ── _플래그 ──
  var sh4 = 탭_(cfg.시트.플래그, ['게임코드', '게임명', '심각도', '규칙', '제목', '근거 수치', '인용 건수', '관련 응답자']);
  탭비우기_(sh4);
  var 행4 = [];
  for (var n = 0; n < 결과.length; n++) {
    var R4 = 결과[n];
    for (var o = 0; o < (R4.플래그 || []).length; o++) {
      var F = R4.플래그[o], ids = {}, 목록 = [];
      for (var p = 0; p < F.첨부.length; p++) if (!ids[F.첨부[p].ID]) { ids[F.첨부[p].ID] = true; 목록.push(F.첨부[p].ID); }
      행4.push([R4.게임.코드, R4.게임.게임명, F.심각도, F.규칙, F.제목, F.근거, F.첨부.length, 목록.join(' ')]);
    }
  }
  if (행4.length) {
    쓰기_(sh4, 2, 행4);
    var 색 = { Critical: '#FDE7E9', High: '#FFF4E5', 검토필요: '#F1F6FB', 강점: '#EAF7EF' };
    var 범위 = sh4.getRange(2, 1, 행4.length, 8);
    var 배경 = [];
    for (var q = 0; q < 행4.length; q++) {
      var c2 = 색[행4[q][2]] || '#FFFFFF', 줄색 = [];
      for (var s = 0; s < 8; s++) 줄색.push(c2);
      배경.push(줄색);
    }
    범위.setBackgrounds(배경);
  }
}

/** 2차원 배열을 열 길이 맞춰 쓴다 */
function 쓰기_(sh, 시작행, 행들) {
  if (!행들.length) return;
  var 폭 = 0;
  for (var i = 0; i < 행들.length; i++) if (행들[i].length > 폭) 폭 = 행들[i].length;
  for (var j = 0; j < 행들.length; j++) {
    while (행들[j].length < 폭) 행들[j].push('');
    // null 은 빈 칸으로. 응답이 없어 평균이 null 인 셀이 섞일 수 있다.
    for (var c = 0; c < 폭; c++) if (행들[j][c] === null || 행들[j][c] === undefined) 행들[j][c] = '';
  }
  크기확보_(sh, 시작행 + 행들.length - 1, 폭);
  sh.getRange(시작행, 1, 행들.length, 폭).setValues(행들);
}

/** 실행 로그 한 줄 */
function 로그쓰기_(작업, 시작, 끝, 결과, 경고) {
  var sh = 탭_(CONFIG.시트.실행로그, ['시각', '작업', '소요(초)', '요약', '경고']);
  var 총응답 = 0;
  for (var i = 0; i < 결과.length; i++) 총응답 += (결과[i].응답 || []).length;
  sh.appendRow([끝, 작업, 반올림_((끝 - 시작) / 1000, 1),
                '게임 ' + 결과.length + '개 · 응답 ' + 총응답 + '건',
                (경고 || []).join(' / ')]);
}

// Node 테스트 하네스용
if (typeof module !== 'undefined') {
  module.exports = {
    반올림_: 반올림_, 평균_: 평균_, 표본표준편차_: 표본표준편차_, 백분율_: 백분율_,
    헤더정규화_: 헤더정규화_, 헤더맵만들기_: 헤더맵만들기_, 복수답분해_: 복수답분해_,
    무응답_: 무응답_, 응답파싱_: 응답파싱_, 지표계산_: 지표계산_, 문항집계_: 문항집계_,
    세그먼트_: 세그먼트_, 플래그판정_: 플래그판정_, 게임집계_: 게임집계_, 빈도표_: 빈도표_
  };
}
