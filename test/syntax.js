/**
 * test/syntax.js — src/*.gs 문법 검사
 * ============================================================================
 * clasp push 하기 전에 문법 오류를 잡는다. Apps Script 편집기에 붙여 넣고
 * 실행해 봐야 알 수 있는 오타를 여기서 먼저 걸러 낸다.
 * 실행하지 않고 파싱만 하므로 SpreadsheetApp 이 없어도 된다.
 *
 *   node test/syntax.js
 * ============================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const 파일들 = fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).sort();

let 실패 = 0;
console.log('── src/*.gs 문법 검사 ' + '─'.repeat(44));

for (const f of 파일들) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  try {
    new vm.Script(src, { filename: f });
    console.log(`  OK  ${f.padEnd(18)} ${String(src.split('\n').length).padStart(5)}줄`);
  } catch (e) {
    실패++;
    console.log(`  NG  ${f} — ${e.message}`);
  }
}

// appsscript.json 도 확인
const 매니페스트 = path.join(SRC, 'appsscript.json');
try {
  const j = JSON.parse(fs.readFileSync(매니페스트, 'utf8'));
  if (j.runtimeVersion !== 'V8') { 실패++; console.log('  NG  appsscript.json — runtimeVersion 이 V8 이 아닙니다'); }
  else console.log(`  OK  appsscript.json     스코프 ${(j.oauthScopes || []).length}개 · ${j.timeZone}`);
} catch (e) {
  실패++;
  console.log('  NG  appsscript.json — ' + e.message);
}

// 함수 이름 중복 검사 — Apps Script 는 파일 경계가 없어서 같은 이름이 있으면 뒤엣것이 이긴다
const 정의 = {};
const 중복 = [];
for (const f of 파일들) {
  const src = fs.readFileSync(path.join(SRC, f), 'utf8');
  const re = /^function\s+([^\s(]+)\s*\(/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (정의[m[1]]) 중복.push(`${m[1]}  (${정의[m[1]]} · ${f})`);
    else 정의[m[1]] = f;
  }
}
if (중복.length) {
  실패++;
  console.log('  NG  함수 이름 중복 — Apps Script 는 전역 하나라 뒤엣것이 앞엣것을 덮습니다:');
  중복.forEach(s => console.log('        · ' + s));
} else {
  console.log(`  OK  함수 이름 중복 없음   전역 함수 ${Object.keys(정의).length}개`);
}

console.log('═'.repeat(66));
console.log(실패 ? `  문법 검사 실패 ${실패}건` : '  문법 검사 통과');
console.log('═'.repeat(66));
process.exit(실패 ? 1 : 0);
