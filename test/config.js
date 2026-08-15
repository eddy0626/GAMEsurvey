/**
 * test/config.js — Config.gs 를 5개 폼 전부에 대해 검증
 * ============================================================================
 * 구글 계정 없이, survey_data.py 로 재현한 5개 폼의 실제 헤더 행에 대고
 * Config.gs 에 적은 것이 하나라도 어긋나는지 본다.
 *
 *   · 응답 시트 ID 가 채워졌고 형식이 맞는가
 *   · 총 열 수가 실제 시트(김영범 확인분)와 같은가
 *   · 공통 문항 22개가 5개 폼에서 전부 매핑되는가 (번호가 폼마다 달라도)
 *   · Config 에 적은 문항 텍스트가 그 폼에 실재하는가          ← 오타 검출
 *   · Config 에 적은 선택지 문구가 그 문항에 실재하는가         ← 오타 검출
 *   · 체크박스 문항을 빠뜨리거나 잘못 넣지 않았는가             ← 누락 검출
 *
 *   node test/config.js
 * ============================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const sandbox = { console, Math, Date, JSON, String, Number, Object, Array, isNaN };
vm.createContext(sandbox);
for (const f of ['Config.gs', 'Aggregate.gs']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox, { filename: f });
}
const CONFIG = sandbox.CONFIG;
const N = sandbox.헤더정규화_;
const 폼들 = JSON.parse(fs.readFileSync(path.join(__dirname, 'headers_all_forms.json'), 'utf8'));

let 통과 = 0, 실패 = 0; const 실패목록 = [];
function eq(라벨, 실제, 기대) {
  const ok = String(실제) === String(기대);
  ok ? 통과++ : (실패++, 실패목록.push(`${라벨} — 기대 ${기대} / 실제 ${실제}`));
  console.log(`  ${ok ? 'OK ' : 'NG '} ${라벨.padEnd(56)} ${String(실제).padStart(4)}  (기대 ${기대})`);
}
function 절(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 62 - t.length))}`); }

절('0. GAMES — 응답 시트 ID');
for (const 폼 of 폼들) {
  const G = CONFIG.게임찾기(폼.코드);
  eq(`${폼.코드} Config 에 있음`, !!G, true);
  if (!G) continue;
  eq(`${폼.코드} 게임명이 설문 원본과 같음`, G.게임명, 폼.게임명);
  eq(`${폼.코드} 개발사가 설문 원본과 같음`, G.개발사, 폼.개발사);
  eq(`${폼.코드} 응답시트ID 형식`, /^[A-Za-z0-9_-]{40,50}$/.test(G.응답시트ID), true);
}
{
  const ids = CONFIG.GAMES.map(g => g.응답시트ID);
  eq('응답시트ID 5개가 서로 다름', new Set(ids).size, 5);
}

절('1. 총 열 수 — 김영범 확인분과 대조');
for (const 폼 of 폼들) {
  eq(`${폼.코드} ${폼.게임명.slice(0, 12)} 총 열`, 폼.헤더.length, 폼.확인된총열);
}

절('2. 공통 문항 매핑 — 폼마다 번호가 달라도 전부 찾는가');
const 공통키수 = Object.keys(CONFIG.공통문항).length;
for (const 폼 of 폼들) {
  const 맵 = sandbox.헤더맵만들기_(폼.헤더, CONFIG.공통문항);
  eq(`${폼.코드} 공통 문항 ${공통키수}개 전부 찾음`, Object.keys(맵.공통).length, 공통키수);
  if (맵.누락.length) console.log(`       누락: ${맵.누락.join(', ')}`);
  eq(`${폼.코드} 중복 매핑 없음`, 맵.중복.length, 0);
  eq(`${폼.코드} 고유 문항 수`, 맵.고유.length, 폼.고유문항수);

  // 6축이 실제로 이어진 6개 열에 순서대로 있는가
  const 축열 = CONFIG.육각축.map(a => 맵.공통[a.키]);
  eq(`${폼.코드} 6축이 연속된 열에 순서대로`,
     축열.every((c, i) => i === 0 || c === 축열[i - 1] + 1), true);
}

절('3. Config 에 적은 문항 텍스트가 실재하는가 (오타 검출)');
for (const 폼 of 폼들) {
  const 있음 = new Set(폼.고유문항.map(q => N(q.text)));
  const 확인 = [];
  const 부정 = CONFIG.게임_부정선택지[폼.코드] || {};
  for (const k of Object.keys(부정)) 확인.push(['부정선택지', k]);
  for (const k of (CONFIG.체크박스문항[폼.코드] || [])) 확인.push(['체크박스문항', k]);
  const 튜 = CONFIG.게임_튜토리얼문항[폼.코드];
  if (튜) 확인.push(['튜토리얼문항', 튜.문항]);
  for (const k of Object.keys(CONFIG.게임_문항유형[폼.코드] || {})) 확인.push(['문항유형', k]);

  const 없는것 = 확인.filter(([, t]) => !있음.has(N(t)));
  eq(`${폼.코드} Config 문항 ${확인.length}개 전부 실재`, 없는것.length, 0);
  없는것.forEach(([종류, t]) => console.log(`       ${종류} → «${t}»`));
}

절('4. Config 에 적은 선택지 문구가 실재하는가 (오타 검출)');
for (const 폼 of 폼들) {
  const 선택지맵 = {};
  폼.고유문항.forEach(q => { 선택지맵[N(q.text)] = new Set((q.options || []).map(N)); });

  let 확인수 = 0; const 없는것 = [];
  const 부정 = CONFIG.게임_부정선택지[폼.코드] || {};
  for (const 문항 of Object.keys(부정)) {
    const 있음 = 선택지맵[N(문항)];
    for (const 선택 of 부정[문항]) {
      확인수++;
      if (!있음 || !있음.has(N(선택))) 없는것.push(`${문항.slice(0, 18)}… → «${선택}»`);
    }
  }
  const 튜 = CONFIG.게임_튜토리얼문항[폼.코드];
  if (튜) {
    const 있음 = 선택지맵[N(튜.문항)];
    for (const 선택 of 튜.어려움) {
      확인수++;
      if (!있음 || !있음.has(N(선택))) 없는것.push(`튜토리얼 → «${선택}»`);
    }
  }
  eq(`${폼.코드} 선택지 ${확인수}개 전부 실재`, 없는것.length, 0);
  없는것.forEach(s => console.log(`       ${s}`));
}

절('5. 체크박스 · 선형배율 문항을 빠뜨리거나 잘못 넣지 않았는가');
for (const 폼 of 폼들) {
  const 진짜 = 폼.고유문항.filter(q => q.type === '체크박스').map(q => N(q.text)).sort();
  const 적은것 = (CONFIG.체크박스문항[폼.코드] || []).map(N).sort();
  eq(`${폼.코드} 체크박스 목록 일치 (실제 ${진짜.length}개)`, 적은것.join(' | '), 진짜.join(' | '));
}
for (const 폼 of 폼들) {
  // 게임 고유 선형배율 문항 — 빠뜨리면 평균 대신 빈도표가 나오고 플래그도 안 뜬다
  const 진짜 = 폼.고유문항.filter(q => q.type === '선형배율');
  const 적은것 = (CONFIG.게임_선형배율문항[폼.코드] || []);
  eq(`${폼.코드} 선형배율 목록 일치 (실제 ${진짜.length}개)`,
     적은것.map(x => N(x.문항)).sort().join(' | '), 진짜.map(q => N(q.text)).sort().join(' | '));
  // 척도 범위(최소·최대)가 설문 원본과 같은가 — 긍정/부정 인원 계산이 여기 달렸다
  for (const q of 진짜) {
    const 정의 = 적은것.filter(x => N(x.문항) === N(q.text))[0];
    if (!정의) continue;
    eq(`${폼.코드} «${q.text.slice(0, 16)}…» 척도 범위`,
       `${정의.최소}~${정의.최대}`, `${q.bounds[0]}~${q.bounds[1]}`);
  }
}

절('6. 공통 문항 선택지 — Config 값이 설문 원본과 일치하는가');
{
  // 5개 폼 공통이므로 첫 폼의 공통 문항 선택지를 원본에서 다시 읽는다
  const 원본 = JSON.parse(fs.readFileSync(path.join(__dirname, 'common_options.json'), 'utf8'));
  function 확인(라벨, 문항키, 값들) {
    const 있음 = new Set((원본[문항키] || []).map(N));
    const 없는것 = 값들.filter(v => !있음.has(N(v)));
    eq(라벨, 없는것.length ? 없는것.join(', ') : 0, 0);
  }
  확인('버그 선택지 4개',        '버그경험', Object.keys(CONFIG.버그선택지).map(k => CONFIG.버그선택지[k]));
  확인('구매 의향 선택지 5개',   '구매의향', Object.keys(CONFIG.구매선택지).map(k => CONFIG.구매선택지[k]));
  확인('가격 구간 6개',         '적정가격', CONFIG.가격구간);
  확인('진행도 정체 단계 2개',  '진행도',   CONFIG.진행도_정체단계);
  확인('공통 부정선택지 · 구매의향', '구매의향', CONFIG.공통_부정선택지.구매의향);
  확인('공통 부정선택지 · 진행도',   '진행도',   CONFIG.공통_부정선택지.진행도);
  eq('가격 구간 순서가 원본과 같음', CONFIG.가격구간.join('|'), (원본.적정가격 || []).join('|'));

  // 코어 장르가 실제 장르 선택지에 있는가
  const 장르 = new Set((원본.선호장르 || []).map(N));
  for (const 코드 of Object.keys(CONFIG.게임_코어장르)) {
    const 없는것 = CONFIG.게임_코어장르[코드].filter(g => !장르.has(N(g)));
    eq(`${코드} 코어 장르가 장르 선택지에 실재`, 없는것.length ? 없는것.join(', ') : 0, 0);
  }
}

절('7. 육각 6축 순서 고정');
eq('6축 순서', CONFIG.육각축.map(a => a.이름).join(' / '),
   '재미 / 조작성 / 그래픽 · 아트 / 몰입도 / 완성도 / 정식 출시 기대감');

console.log('\n' + '═'.repeat(72));
console.log(`  통과 ${통과} · 실패 ${실패}`);
if (실패) { console.log('\n실패 항목'); 실패목록.forEach(s => console.log('  · ' + s)); }
console.log('═'.repeat(72));
process.exit(실패 ? 1 : 0);
