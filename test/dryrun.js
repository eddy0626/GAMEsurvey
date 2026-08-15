/**
 * test/dryrun.js — 가짜 구글 시트 위에서 집계실행() 을 진짜로 돌린다
 * ============================================================================
 * 구글 계정 없이 Apps Script 코드를 실행해 보기 위한 하네스.
 * SpreadsheetApp · Utilities · Session · Logger · PropertiesService 를
 * Node 에서 흉내 내고, 실제 src/*.gs 를 그대로 불러 집계실행() 을 호출한다.
 *
 * 이걸로 잡는 것 — 순수 계산 테스트가 못 건드리는 시트 입출력 코드
 *   · 탭_() · 크기확보_() · 쓰기_() · 탭비우기_() 의 범위 계산
 *   · 집계쓰기_() 가 헤더 폭과 데이터 폭을 맞추는지
 *   · 대시보드갱신_() 이 병합 · 배경 · 행 수를 어긋나지 않게 그리는지
 *   · 명부적용_() 이 ID 를 발급하고 명부에 덧붙이는지
 *
 * 못 잡는 것 — 진짜 구글에서만 확인되는 것
 *   · 레이더 차트 렌더링 (Charts 서비스)
 *   · 드라이브 폴더 · 문서 템플릿
 *   · 권한 승인 · 6분 실행 시간 제한
 *
 *   node test/dryrun.js
 * ============================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const 폼들 = JSON.parse(fs.readFileSync(path.join(__dirname, 'headers_all_forms.json'), 'utf8'));
const 미스트 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture_mistworld.json'), 'utf8'));

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ 가짜 구글 서비스                                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const 호출된메서드 = new Set();

/** 구현하지 않은 메서드는 자기 자신을 돌려주는 no-op 으로 흘려보낸다 (서식 메서드 등) */
function 체이너블(대상, 이름) {
  return new Proxy(대상, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop !== 'string') return undefined;
      return function () { 호출된메서드.add(`${이름}.${prop}`); return t.__proxy || t; };
    }
  });
}

class FakeRange {
  constructor(sheet, r, c, nr, nc) {
    this.sheet = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc;
    this.__proxy = 체이너블(this, 'Range');
    return this.__proxy;
  }
  setValues(v) {
    if (v.length !== this.nr) throw new Error(`setValues 행 수 불일치: 범위 ${this.nr} vs 값 ${v.length}`);
    for (const row of v) {
      if (row.length !== this.nc) throw new Error(`setValues 열 수 불일치: 범위 ${this.nc} vs 값 ${row.length}`);
    }
    if (this.r + this.nr - 1 > this.sheet.maxRows) throw new Error(`행 범위 초과: ${this.r + this.nr - 1} > ${this.sheet.maxRows} (${this.sheet.name})`);
    if (this.c + this.nc - 1 > this.sheet.maxCols) throw new Error(`열 범위 초과: ${this.c + this.nc - 1} > ${this.sheet.maxCols} (${this.sheet.name})`);
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet.set(this.r + i, this.c + j, v[i][j]);
    return this.__proxy;
  }
  setValue(v) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet.set(this.r + i, this.c + j, v);
    return this.__proxy;
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(this.sheet.get(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  getValue() { return this.sheet.get(this.r, this.c); }
  setBackgrounds(bg) {
    if (bg.length !== this.nr) throw new Error(`setBackgrounds 행 수 불일치: ${this.nr} vs ${bg.length}`);
    for (const row of bg) if (row.length !== this.nc) throw new Error(`setBackgrounds 열 수 불일치: ${this.nc} vs ${row.length}`);
    return this.__proxy;
  }
  merge() {
    // 이미 병합된 칸과 겹치면 구글은 오류를 낸다. 그 상황을 재현한다.
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) {
      const k = `${this.r + i},${this.c + j}`;
      if (this.sheet.merged.has(k)) throw new Error(`이미 병합된 셀과 겹칩니다: ${this.sheet.name} ${k}`);
    }
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet.merged.add(`${this.r + i},${this.c + j}`);
    return this.__proxy;
  }
  breakApart() {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet.merged.delete(`${this.r + i},${this.c + j}`);
    return this.__proxy;
  }
  clearContent() {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet.set(this.r + i, this.c + j, '');
    return this.__proxy;
  }
  clear() { return this.clearContent(); }
}

class FakeSheet {
  constructor(name, ss, rows, cols) {
    this.name = name; this.ss = ss;
    this.maxRows = rows || 1000; this.maxCols = cols || 26;
    this.cells = new Map();
    this.merged = new Set();
    this.hidden = false;
    this.__proxy = 체이너블(this, 'Sheet');
    return this.__proxy;
  }
  key(r, c) { return `${r},${c}`; }
  set(r, c, v) { this.cells.set(this.key(r, c), v === undefined ? '' : v); }
  get(r, c) { const v = this.cells.get(this.key(r, c)); return v === undefined ? '' : v; }
  getName() { return this.name; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  insertRowsAfter(after, n) { this.maxRows += n; return this.__proxy; }
  insertColumnsAfter(after, n) { this.maxCols += n; return this.__proxy; }
  getLastRow() {
    let m = 0;
    for (const k of this.cells.keys()) {
      const [r, c] = k.split(',').map(Number);
      if (this.cells.get(k) !== '' && r > m) m = r;
    }
    return m;
  }
  getLastColumn() {
    let m = 0;
    for (const k of this.cells.keys()) {
      const [r, c] = k.split(',').map(Number);
      if (this.cells.get(k) !== '' && c > m) m = c;
    }
    return m;
  }
  getRange(r, c, nr, nc) { return new FakeRange(this, r, c, nr === undefined ? 1 : nr, nc === undefined ? 1 : nc); }
  getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(v) {
    const r = this.getLastRow() + 1;
    if (r > this.maxRows) this.insertRowsAfter(this.maxRows, 100);
    if (v.length > this.maxCols) this.insertColumnsAfter(this.maxCols, v.length - this.maxCols);
    for (let j = 0; j < v.length; j++) this.set(r, j + 1, v[j]);
    return this.__proxy;
  }
  hideSheet() { this.hidden = true; return this.__proxy; }
  isSheetHidden() { return this.hidden; }
  getCharts() { return []; }
  getIndex() { return this.ss.sheets.indexOf(this.__proxy) + 1; }
  /** 내용은 지우지만 병합은 남긴다 — 구글 시트와 같은 동작.
   *  (그래서 대시보드가 다시 그리기 전에 breakApart 를 해야 한다) */
  clear() { this.cells.clear(); return this.__proxy; }
}

class FakeSpreadsheet {
  constructor(id, name) {
    this.id = id; this.name = name; this.sheets = [];
    this.__proxy = 체이너블(this, 'Spreadsheet');
    return this.__proxy;
  }
  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return `https://docs.google.com/spreadsheets/d/${this.id}/edit`; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(n) { return this.sheets.filter(s => s.getName() === n)[0] || null; }
  insertSheet(n, pos) {
    const sh = new FakeSheet(n, this);
    if (pos === undefined) this.sheets.push(sh); else this.sheets.splice(pos, 0, sh);
    return sh;
  }
  getActiveSheet() { return this.sheets[0]; }
}

// ── 응답 시트 5개 만들기 ────────────────────────────────────────────────────
const 응답시트 = {};
function 응답시트준비(코드, 시트ID, 헤더, 행들, 이름) {
  const ss = new FakeSpreadsheet(시트ID, 이름);
  const sh = ss.insertSheet('설문지 응답 시트1');
  const 폭 = Math.max(헤더.length, 26);
  if (폭 > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), 폭 - sh.getMaxColumns());
  sh.getRange(1, 1, 1, 헤더.length).setValues([헤더]);
  if (행들.length) sh.getRange(2, 1, 행들.length, 헤더.length).setValues(행들);
  응답시트[시트ID] = ss;
  return ss;
}

// ── 어센디아 가상 응답 5건 (선형배율 · 체크박스 출력을 보기 위한 것) ──────────
function 어센디아가상(폼) {
  const H = 폼.헤더;
  const 열 = 부분 => H.findIndex(h => h.indexOf(부분) >= 0);
  const Q3 = [2, 2, 3, 1, 2], Q4 = [5, 5, 4, 5, 4];
  const 육각 = [[3,3,4,3,2,3],[2,2,4,2,2,2],[4,4,5,4,3,4],[2,1,4,2,2,2],[3,3,4,3,3,3]];
  const 행 = [];
  for (let i = 0; i < 5; i++) {
    const r = new Array(H.length).fill('');
    r[0] = `2026-08-20 14:0${i}:00`;
    r[열('이름을 적어')] = ['김가상', '이가상', '박가상', '최가상', '정가상'][i];
    r[열('연령대를')] = ['20대', '30대', '20대', '10대', '20대'][i];
    r[열('성별을')] = ['남성', '여성', '남성', '남성', '여성'][i];
    r[열('평소 즐겨 하는')] = ['RPG, 액션 · 액션 어드벤처', '퍼즐', 'RPG', '방치형 · 캐주얼', 'RPG, 전략 · 턴제'][i];
    r[열('가장 재미있거나 인상 깊었던 요소')] = ['전투, 탐색, 그래픽 · 캐릭터', '그래픽 · 캐릭터', '전투, 아스트라 및 빌드 구성', '음악 · 효과음', '전투, 스토리 · 세계관'][i];
    r[열('알아차리셨나요')] = ['잘 모르겠다', '잘 모르겠다', '명확하게 느꼈다', '어느 정도 느꼈다', '설명을 듣고 알았다'][i];
    r[열('흥미롭게 느껴지셨나요')] = Q3[i];
    r[열('확인해 보고 싶다는 생각이')] = Q4[i];
    r[열('이해하기 어렵거나 불편했던')] = i === 3 ? '아스트라가 뭔지 끝까지 몰랐습니다.' : '없음';
    r[열('다시 플레이한다면')] = ['다른 엔딩', '새로운 히든 직업, 다른 엔딩', '이전과 다른 아스트라와 빌드', '', '다른 엔딩, 더 강한 적이나 전투 콘텐츠'][i];
    r[열('가장 좋았던 점을')] = i === 2 ? '빌드 짜는 맛이 있습니다.' : '';
    ['재미 —','조작성 —','그래픽 · 아트 —','몰입도 —','완성도 —','정식 출시 기대감 —']
      .forEach((a, k) => { r[열(a)] = 육각[i][k]; });
    r[열('진행이 막히지 않았다')] = [3, 2, 4, 1, 3][i];
    r[열('기술적인 문제가')] = [4, 4, 5, 3, 4][i];
    r[열('어디까지 진행하셨나요')] = ['초반 콘텐츠를 조금 경험했다','튜토리얼까지 마쳤다','여러 콘텐츠를 두루 경험했다','튜토리얼을 마치지 못했다','초반 콘텐츠를 조금 경험했다'][i];
    r[열('수정되거나 개선되었으면')] = ['아스트라 설명이 필요합니다.','전직 효과가 안 보입니다.','없음','뭘 해야 하는지 모르겠습니다.','난이도 조절이 필요합니다.'][i];
    r[열('구매할 의향이 있으신가요')] = ['할인하면 구매할 것 같다','무료라면 해보겠다','구매할 의향이 있다','구매하지 않을 것 같다','할인하면 구매할 것 같다'][i];
    r[열('적정 가격은')] = ['10,000~14,900원','5,000원 미만','15,000~19,900원','5,000원 미만','10,000~14,900원'][i];
    r[열('추천하고 싶은 정도')] = [6, 4, 8, 2, 6][i];
    r[열('버그나 오류를 겪으셨나요')] = ['겪지 않았다','있었지만 플레이에 지장은 없었다','겪지 않았다','진행이 불가능할 정도였다','겪지 않았다'][i];
    r[열('어떤 상황이었는지')] = i === 3 ? '2층 계단에서 떨어지면 맵 밖으로 나가 못 돌아옵니다.' : '';
    r[열('개발팀에 전하고 싶은')] = ['빌드가 재밌습니다.','','방향은 좋습니다.','어려워요.','전투 손맛이 좋습니다.'][i];
    행.push(r);
  }
  return 행;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║ 실행                                                                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const 마스터 = new FakeSpreadsheet('MASTER_FAKE_ID', '2026 플레이테스트 마스터');
마스터.insertSheet('시트1');

const 로그 = [];
const sandbox = {
  console, Math, Date, JSON, String, Number, Object, Array, isNaN, RegExp, Error,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => 마스터,
    getActive: () => 마스터,
    openById: id => {
      if (!응답시트[id]) throw new Error(`요청한 문서를 찾을 수 없습니다: ${id}`);
      return 응답시트[id];
    },
    flush: () => {},
    getUi: () => { throw new Error('UI 없음 (편집기 밖 실행)'); }
  },
  Utilities: {
    formatDate: (d, tz, fmt) => {
      const p = n => String(n).padStart(2, '0');
      return fmt.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1))
                .replace('dd', p(d.getDate())).replace('HH', p(d.getHours()))
                .replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds()));
    }
  },
  Session: { getScriptTimeZone: () => 'Asia/Seoul' },
  Logger: { log: s => 로그.push(String(s)) },
  PropertiesService: {
    getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} })
  }
};
vm.createContext(sandbox);
for (const f of ['Config.gs', 'Aggregate.gs', 'Chart.gs', 'Dashboard.gs', 'Code.gs']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox, { filename: f });
}
const CONFIG = sandbox.CONFIG;

// 응답 시트 준비 — 미스트월드는 실제 15건, 어센디아는 가상 5건, 나머지는 0건
for (const 폼 of 폼들) {
  const G = CONFIG.게임찾기(폼.코드);
  let 행 = [];
  if (폼.코드 === 'G01') 행 = 미스트.행;
  else if (폼.코드 === 'G04') 행 = 어센디아가상(폼);
  응답시트준비(폼.코드, G.응답시트ID, 폼.헤더, 행, `「${폼.게임명}」 플레이테스트 설문 (응답)`);
}

// 명부 — 미스트월드 15명만 등록 (어센디아 5명은 일부러 빼서 자동 발급을 본다)
{
  const sh = 마스터.insertSheet('_명부');
  sh.getRange(1, 1, 1, 4).setValues([['이름', 'ID', '유형', '비고']]);
  const 명부 = 미스트.명부.map(r => r.slice());
  sh.getRange(2, 1, 명부.length, 4).setValues(명부);
}

console.log('═'.repeat(78));
console.log('  집계실행() 실행 — 가짜 구글 시트 위에서 src/*.gs 를 그대로 돌린다');
console.log('═'.repeat(78));
console.log('  미스트월드  실제 응답 15건 (기준선 데이터)');
console.log('  어센디아    가상 응답 5건  (선형배율 · 체크박스 출력 확인용)');
console.log('  나머지 3개  응답 0건       (테스트 전 상태)');
console.log('');

const 시작 = Date.now();
let 결과;
try {
  결과 = sandbox.집계실행();
} catch (e) {
  console.log('!! 실행 중 오류\n   ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 6).join('\n'));
  process.exit(1);
}
console.log(`실행 완료 — ${Date.now() - 시작}ms · 만들어진 탭 ${마스터.getSheets().length}개\n`);

// ── 결과 출력 ───────────────────────────────────────────────────────────────
function 탭찍기(이름, 최대행) {
  const sh = 마스터.getSheetByName(이름);
  if (!sh) { console.log(`(${이름} 탭이 없습니다)\n`); return; }
  const R = sh.getLastRow(), C = sh.getLastColumn();
  console.log(`── ${이름}  (${R}행 × ${C}열${sh.isSheetHidden() ? ' · 숨김' : ''}) ${'─'.repeat(Math.max(0, 40 - 이름.length))}`);
  if (!R) { console.log('  (비어 있음)\n'); return; }
  const 값 = sh.getRange(1, 1, Math.min(R, 최대행 || 999), C).getValues();
  const 폭 = [];
  for (let c = 0; c < C; c++) 폭[c] = Math.min(30, Math.max(...값.map(r => 표시(r[c]).length)));
  for (const row of 값) {
    console.log('  ' + row.map((v, c) => 자르기(표시(v), 폭[c])).join(' │ ').replace(/\s+$/, ''));
  }
  if (R > (최대행 || 999)) console.log(`  … 나머지 ${R - 최대행}행 생략`);
  console.log('');
}
function 표시(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 16).replace('T', ' ');
  return String(v === null || v === undefined ? '' : v);
}
function 자르기(s, n) { return (s.length > n ? s.slice(0, n - 1) + '…' : s).padEnd(n); }

탭찍기('대시보드', 40);
탭찍기('_집계_게임');
탭찍기('_플래그', 26);
탭찍기('_집계_문항', 22);
탭찍기('_집계_응답자', 8);
탭찍기('_명부', 24);
탭찍기('_실행로그');

console.log('── Logger 출력 ' + '─'.repeat(48));
console.log(로그.length ? 로그.join('\n') : '  (없음)');
console.log('');

// ── 두 번 돌려 본다 — 재실행에서 깨지는 코드가 제일 흔하다 ──────────────────
console.log('── 재실행 (병합 · 배경 · 범위가 두 번째에도 버티는가) ' + '─'.repeat(20));
try {
  const t = Date.now();
  sandbox.집계실행();
  console.log(`  OK  두 번째 실행 성공 — ${Date.now() - t}ms`);
  const g = 마스터.getSheetByName('_집계_게임');
  console.log(`  OK  _집계_게임 행 수 그대로 ${g.getLastRow()}행 (누적되지 않음)`);
  const l = 마스터.getSheetByName('_실행로그');
  console.log(`  OK  _실행로그 는 누적 ${l.getLastRow() - 1}건`);
} catch (e) {
  console.log('  NG  두 번째 실행 실패: ' + e.message);
  process.exit(1);
}

console.log('');
console.log('── 흘려보낸 서식 메서드 (구현 안 해도 되는 것들) ' + '─'.repeat(24));
console.log('  ' + [...호출된메서드].sort().join(', '));
console.log('');
console.log('═'.repeat(78));
console.log('  드라이런 통과 — 시트 입출력 코드가 실제로 돕니다.');
console.log('  차트 렌더 · 드라이브 · 권한은 구글에서만 확인됩니다.');
console.log('═'.repeat(78));
