/* 플레이테스트 설문 앱 — 화면 동작
   파이썬은 window.pywebview.api 로 부른다. 함수 이름은 app/api.py 에 있다. */

'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const 상태 = {
  설정: null,
  폼: null,
  명부: [],
  사람: null,          // {이름, ID, 유형}
  섹션: 0,
  답: {},              // 문항ID → 값
  완료타이머: null,
};

// ── 파이썬 부르기 ────────────────────────────────────────
async function 파이썬(이름, ...인자) {
  const api = window.pywebview && window.pywebview.api;
  if (!api || typeof api[이름] !== 'function') {
    throw new Error(`파이썬 함수를 찾을 수 없다: ${이름}`);
  }
  const r = await api[이름](...인자);
  if (r && r.오류) {
    console.error(이름, r);
    throw new Error(r.오류);
  }
  return r;
}

// ── 화면 전환 ────────────────────────────────────────────
function 화면(이름) {
  $$('.화면').forEach((el) => el.classList.toggle('보임', el.id === 이름));
  $$('.탭').forEach((el) => el.classList.toggle('활성', el.dataset.화면 === 이름));
  $('#본문').scrollTop = 0;
  const 설문중 = 이름 === '설문';
  $('#진행바').style.visibility = 설문중 ? 'visible' : 'hidden';
  if (!설문중 && 상태.완료타이머) { clearTimeout(상태.완료타이머); 상태.완료타이머 = null; }
}

function 대화(제목, 글, 버튼들) {
  $('#대화제목').textContent = 제목;
  $('#대화글').textContent = 글;
  const 칸 = $('#대화버튼');
  칸.innerHTML = '';
  버튼들.forEach(([라벨, 종류, 할일]) => {
    const b = document.createElement('button');
    b.className = '버튼' + (종류 ? ' ' + 종류 : '');
    b.textContent = 라벨;
    b.onclick = () => { $('#덮개').classList.remove('보임'); if (할일) 할일(); };
    칸.appendChild(b);
  });
  $('#덮개').classList.add('보임');
}

function 알림상자(종류, 글) {
  const d = document.createElement('div');
  d.className = '알림 ' + 종류;
  d.textContent = 글;
  return d;
}

// ── 시작 ─────────────────────────────────────────────────
async function 시동() {
  try {
    상태.설정 = await 파이썬('설정');
  } catch (e) {
    document.body.innerHTML =
      `<div style="padding:40px;font-family:Malgun Gothic">
         <h2>앱을 시작할 수 없다</h2><pre>${e.message}</pre></div>`;
    return;
  }

  빌드표시();
  await 게임그리기();

  if (!상태.설정.게임코드) {
    화면('설정');
    대화('먼저 게임을 정해 주세요',
         '이 PC 가 어느 게임의 설문을 받을지 한 번만 정하면 됩니다.\n정한 뒤에는 참가자가 게임을 고를 일이 없습니다.',
         [['알겠습니다', '주', null]]);
    return;
  }

  await 대기그리기();

  // 작성하다 만 응답이 있으면 이어서 할지 묻는다
  const 임시 = await 파이썬('임시불러오기');
  if (임시 && 임시.사람) {
    대화('작성하던 응답이 있습니다',
         `${임시.사람.이름} 님이 답하던 내용이 남아 있습니다.\n이어서 하시겠어요?`,
         [['새로 시작', '', async () => { await 파이썬('임시삭제'); }],
          ['이어서 하기', '주', () => {
            상태.사람 = 임시.사람;
            상태.답 = 임시.답 || {};
            상태.섹션 = 임시.섹션 || 0;
            설문그리기();
            화면('설문');
          }]]);
  }
}

function 빌드표시() {
  // 설치본이 온전하면 아무것도 안 띄운다. 빠진 게 있을 때만 알린다.
  const 자리 = $('#빌드');
  if (자리) 자리.textContent = 상태.설정.빌드 || '';
  if (상태.설정.리포트가능) return;
  const 칸 = $('#리포트 .가운데');
  if (칸 && !칸.querySelector('.설치문제')) {
    const 줄바꿈 = String.fromCharCode(10);
    const 글 = ['이 설치본에 문서 생성 라이브러리가 빠져 있습니다.',
                '폴더를 다시 복사하거나, 명령 프롬프트에서',
                '플레이테스트설문.exe --자가검사 를 돌려 무엇이 빠졌는지 확인하세요.'
               ].join(줄바꿈);
    const d = 알림상자('위험', 글);
    d.classList.add('설치문제');
    칸.insertBefore(d, 칸.children[1]);
  }
}

async function 게임그리기() {
  const sel = $('#게임선택');
  sel.innerHTML = '<option value="">— 고르지 않음 —</option>';
  (상태.설정.게임목록 || []).forEach((g) => {
    const o = document.createElement('option');
    o.value = g.코드;
    o.textContent = `${g.게임명}  (${g.개발사} · ${g.문항수}문항)`;
    if (g.코드 === 상태.설정.게임코드) o.selected = true;
    sel.appendChild(o);
  });
  $('#PC이름').value = 상태.설정.PC이름 || '';
  $('#자동복귀').value = 상태.설정.자동복귀초 ?? 5;
  $('#명부경로').textContent = (상태.설정.데이터폴더 || '') + '\\명부.csv';
  $('#내폴더').textContent = 상태.설정.응답폴더 || '';
  await 명부상태그리기();
}

async function 대기그리기() {
  상태.폼 = await 파이썬('설문');
  $('#대기게임').textContent = 상태.폼.게임명;
  $('#대기개발사').textContent = `개발사 ${상태.폼.개발사}  ·  ${상태.폼.문항수}문항`;
  $('#대기사업').textContent = 상태.설정.사업명;
  document.title = `${상태.폼.게임명} 플레이테스트 설문`;

  const m = await 파이썬('명부');
  상태.명부 = m.사람 || [];
  $('#수응답').textContent = m.응답수;
  const 남음 = 상태.명부.filter((p) => !p.응답함).length;
  $('#수남음').textContent = 상태.명부.length ? 남음 : '—';
  $('#탭우측').textContent =
    `${상태.폼.게임명}${상태.설정.PC이름 ? ' · ' + 상태.설정.PC이름 : ''}`;
}

// ── 이름 적기 ────────────────────────────────────────────
//   참가자가 직접 적는다. 명부가 있으면 적은 글자에 맞는 이름만 제안한다.
//   전체 명단을 띄우지 않으면서도 오타로 ID 가 갈리는 것을 막는다.

function 이름정규(s) { return String(s || '').replace(/\s+/g, ''); }

function 이름그리기() {
  const 칸 = $('#이름칸');
  칸.value = '';
  $('#제안').innerHTML = '';
  $('#이름안내').textContent = '';
  $('#이름안내').className = '이름안내';
  $('#이름시작').disabled = true;
  setTimeout(() => 칸.focus(), 80);
}

function 이름맞춤(글자) {
  const q = 이름정규(글자);
  if (!q || !상태.명부.length) return [];
  const 시작 = 상태.명부.filter((p) => 이름정규(p.이름).startsWith(q));
  const 포함 = 상태.명부.filter((p) => !시작.includes(p) && 이름정규(p.이름).includes(q));
  return 시작.concat(포함).slice(0, 6);
}

function 이름입력바뀜() {
  const 글자 = $('#이름칸').value.trim();
  const 안내 = $('#이름안내');
  const 제안칸 = $('#제안');
  $('#이름시작').disabled = !글자;
  제안칸.innerHTML = '';
  안내.className = '이름안내';
  안내.textContent = '';
  if (!글자) return;

  const 정확 = 상태.명부.find((p) => 이름정규(p.이름) === 이름정규(글자));
  if (정확) {
    안내.className = '이름안내 ' + (정확.응답함 ? '주의' : '맞음');
    안내.textContent = 정확.응답함
      ? 정확.이름 + ' 님은 이 게임에 이미 응답했습니다'
      : 정확.이름 + ' 님' + (정확.유형 ? ' · ' + 정확.유형 : '');
    return;
  }

  이름맞춤(글자).forEach((p) => {
    const b = document.createElement('button');
    b.className = p.응답함 ? '완료' : '';
    b.innerHTML = escapeHtml(p.이름) +
      (p.응답함 ? '<span class="꼬리">이미 응답함</span>' : '');
    b.onclick = () => { $('#이름칸').value = p.이름; 이름입력바뀜(); $('#이름칸').focus(); };
    제안칸.appendChild(b);
  });

  if (상태.명부.length && !제안칸.children.length) {
    안내.textContent = '명부에 없는 이름입니다. 그대로 진행하면 담당자가 나중에 확인합니다.';
  }
}

function 이름확인후시작() {
  const 글자 = $('#이름칸').value.trim();
  if (!글자) { $('#이름칸').focus(); return; }
  const 정확 = 상태.명부.find((p) => 이름정규(p.이름) === 이름정규(글자));
  const 사람 = 정확
    ? { 이름: 정확.이름, ID: 정확.ID || '', 유형: 정확.유형 || '' }
    : { 이름: 글자, ID: '', 유형: '' };

  if (정확 && 정확.응답함) {
    대화('이미 응답하셨습니다',
         정확.이름 + ' 님은 이 게임에 이미 응답했습니다.\n다시 하면 응답이 두 건 남습니다.',
         [['취소', '', null],
          ['그래도 진행', '위험', () => 설문시작(사람)]]);
    return;
  }
  설문시작(사람);
}


function 설문시작(p) {
  상태.사람 = { 이름: p.이름, ID: p.ID || '', 유형: p.유형 || '' };
  상태.답 = {};
  상태.섹션 = 0;
  // 이름 문항(N1)은 고른 이름으로 미리 채운다
  const n1 = 모든문항().find((q) => q.id === 'N1');
  if (n1) 상태.답.N1 = p.이름;
  설문그리기();
  화면('설문');
}

// ── 설문 ─────────────────────────────────────────────────
function 모든문항() {
  return 상태.폼.섹션.flatMap((s) => s.questions);
}

function 설문그리기() {
  const 섹 = 상태.폼.섹션[상태.섹션];
  $('#섹션제목').textContent = 섹.title;
  $('#섹션설명').textContent = 섹.desc || '';
  $('#섹션설명').style.display = 섹.desc ? '' : 'none';

  const 칸 = $('#문항칸');
  칸.innerHTML = '';
  // 이름(N1)은 앞 화면에서 이미 받았다. 두 번 묻지 않는다.
  섹.questions.filter((q) => q.id !== 'N1')
             .forEach((q) => 칸.appendChild(문항그리기(q)));

  $('#이전').disabled = 상태.섹션 === 0;
  const 마지막 = 상태.섹션 === 상태.폼.섹션.length - 1;
  $('#다음').textContent = 마지막 ? '제출하기' : '다음';
  $('#설문상태').textContent =
    `${상태.섹션 + 1} / ${상태.폼.섹션.length} 단계 · ${상태.사람.이름}`;
  $('#진행바 > div').style.width =
    `${((상태.섹션) / 상태.폼.섹션.length) * 100}%`;
  $('#본문').scrollTop = 0;
}

function 문항그리기(q) {
  const box = document.createElement('div');
  box.className = '문항';
  box.dataset.qid = q.id;

  const 머리 = document.createElement('div');
  머리.innerHTML =
    `<div class="번호">${q.no}번</div>
     <div class="질문">${escapeHtml(q.text)}${q.required ? '<span class="필수">*</span>' : ''}</div>
     ${q.help ? `<div class="도움">${escapeHtml(q.help)}</div>` : ''}`;
  box.appendChild(머리);

  if (q.type === '객관식' || q.type === '체크박스') {
    const 복수 = q.type === '체크박스';
    const 목록 = document.createElement('div');
    목록.className = '선택지';
    (q.options || []).forEach((o, i) => {
      const lab = document.createElement('label');
      lab.className = '선택';
      const inp = document.createElement('input');
      inp.type = 복수 ? 'checkbox' : 'radio';
      inp.name = q.id;
      inp.value = o;
      const 현재 = 상태.답[q.id];
      inp.checked = 복수 ? Array.isArray(현재) && 현재.includes(o) : 현재 === o;
      if (inp.checked) lab.classList.add('고름');
      inp.onchange = () => {
        if (복수) {
          const 고른 = Array.from(목록.querySelectorAll('input:checked')).map((x) => x.value);
          상태.답[q.id] = 고른;
        } else {
          상태.답[q.id] = o;
        }
        목록.querySelectorAll('.선택').forEach((el) =>
          el.classList.toggle('고름', el.querySelector('input').checked));
        box.classList.remove('빠짐');
        임시저장();
      };
      const sp = document.createElement('span');
      sp.textContent = o;
      lab.appendChild(inp); lab.appendChild(sp);
      목록.appendChild(lab);
    });
    box.appendChild(목록);

  } else if (q.type === '선형배율') {
    const [lo, hi] = q.bounds;
    const 줄 = document.createElement('div');
    줄.className = '배율';
    for (let v = lo; v <= hi; v++) {
      const b = document.createElement('button');
      b.className = '배율칸' + (상태.답[q.id] === v ? ' 고름' : '');
      b.textContent = v;
      b.onclick = () => {
        상태.답[q.id] = v;
        줄.querySelectorAll('.배율칸').forEach((el) =>
          el.classList.toggle('고름', Number(el.textContent) === v));
        box.classList.remove('빠짐');
        임시저장();
      };
      줄.appendChild(b);
    }
    box.appendChild(줄);
    if (q.labels) {
      const lab = document.createElement('div');
      lab.className = '배율라벨';
      lab.innerHTML = `<span>${escapeHtml(q.labels[0])}</span><span>${escapeHtml(q.labels[1])}</span>`;
      box.appendChild(lab);
    }

  } else if (q.type === '장문형') {
    const t = document.createElement('textarea');
    t.value = 상태.답[q.id] || '';
    t.placeholder = '자유롭게 적어 주세요';
    t.oninput = () => { 상태.답[q.id] = t.value; box.classList.remove('빠짐'); };
    t.onblur = 임시저장;
    box.appendChild(t);

  } else {
    const t = document.createElement('input');
    t.type = 'text';
    t.value = 상태.답[q.id] || '';
    t.oninput = () => { 상태.답[q.id] = t.value; box.classList.remove('빠짐'); };
    t.onblur = 임시저장;
    box.appendChild(t);
  }

  const 경고 = document.createElement('div');
  경고.className = '경고';
  경고.textContent = '이 문항은 답해야 다음으로 넘어갑니다.';
  box.appendChild(경고);
  return box;
}

function 답했나(q) {
  const v = 상태.답[q.id];
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim() !== '';
  return true;
}

function 섹션검사() {
  const 섹 = 상태.폼.섹션[상태.섹션];
  let 첫빠짐 = null;
  섹.questions.forEach((q) => {
    if (q.id === 'N1') return;
    const box = $(`.문항[data-qid="${q.id}"]`);
    if (!box) return;
    const 빠짐 = q.required && !답했나(q);
    box.classList.toggle('빠짐', 빠짐);
    if (빠짐 && !첫빠짐) 첫빠짐 = box;
  });
  if (첫빠짐) 첫빠짐.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return !첫빠짐;
}

async function 임시저장() {
  try {
    await 파이썬('임시저장', {
      사람: 상태.사람, 답: 상태.답, 섹션: 상태.섹션,
      게임코드: 상태.설정.게임코드,
    });
  } catch (e) { console.warn('임시저장 실패', e); }
}

async function 제출() {
  const 응답 = {
    게임코드: 상태.설정.게임코드,
    이름: 상태.사람.이름,
    ID: 상태.사람.ID,
    유형: 상태.사람.유형,
    PC: 상태.설정.PC이름 || '',
    답: 상태.답,
  };
  try {
    await 파이썬('제출', 응답);
  } catch (e) {
    대화('저장하지 못했습니다', e.message + '\n\n작성한 내용은 남아 있습니다. 다시 시도해 주세요.',
         [['다시 시도', '주', 제출]]);
    return;
  }
  $('#진행바 > div').style.width = '100%';
  $('#완료문구').textContent = await 파이썬('완료문구');
  화면('완료');

  const 초 = Number(상태.설정.자동복귀초 ?? 5);
  if (초 > 0) {
    let 남 = 초;
    $('#완료복귀').textContent = `${남}초 뒤 처음 화면으로 돌아갑니다`;
    const t = setInterval(() => {
      남 -= 1;
      $('#완료복귀').textContent = `${남}초 뒤 처음 화면으로 돌아갑니다`;
      if (남 <= 0) clearInterval(t);
    }, 1000);
    상태.완료타이머 = setTimeout(async () => {
      clearInterval(t);
      await 대기그리기();
      화면('대기');
    }, 초 * 1000);
  } else {
    $('#완료복귀').textContent = '';
  }
}

// ── 현황 ─────────────────────────────────────────────────
async function 현황그리기() {
  const 목록 = await 파이썬('응답목록', true);
  const 표 = $('#현황표');
  $('#현황요약').textContent = `${목록.length}건`;
  if (!목록.length) {
    표.innerHTML = '<div class="빈줄">아직 이 PC 에 저장된 응답이 없습니다.</div>';
  } else {
    표.innerHTML =
      `<table class="표"><thead><tr>
         <th>제출 시각</th><th>ID</th><th>이름</th><th>유형</th><th>답</th><th></th>
       </tr></thead><tbody>${목록.map((r) => `
         <tr>
           <td>${escapeHtml(r.제출시각 || '')}</td>
           <td>${escapeHtml(r.ID || '')}</td>
           <td>${escapeHtml(r.이름 || '')}</td>
           <td>${escapeHtml(r.유형 || '')}</td>
           <td>${r.답수 ?? ''}</td>
           <td><button class="버튼 작게 위험" data-지움="${escapeHtml(r.파일)}">삭제</button></td>
         </tr>`).join('')}</tbody></table>`;
    표.querySelectorAll('[data-지움]').forEach((b) => {
      b.onclick = () => 대화('이 응답을 지울까요?',
        '완전히 지우지 않고 「버린응답」 폴더로 옮깁니다. 되돌릴 수 있습니다.',
        [['취소', '', null],
         ['옮기기', '위험', async () => {
           await 파이썬('응답삭제', b.dataset.지움);
           await 현황그리기(); await 대기그리기();
         }]]);
    });
  }

  const m = await 파이썬('명부');
  const 안함 = (m.사람 || []).filter((p) => !p.응답함);
  $('#미응답').innerHTML = !m.사람.length
    ? '<div class="빈줄">명부가 없어 대조할 수 없습니다.</div>'
    : (안함.length
        ? `<div class="줄">${안함.map((p) =>
            `<span class="칩 주의">${escapeHtml(p.이름)} ${escapeHtml(p.ID || '')}</span>`).join('')}</div>`
        : '<div class="알림 양호">명부에 있는 사람 모두 응답했습니다.</div>');
}

// ── 모으기 ───────────────────────────────────────────────
async function 폴더고르고합치기() {
  const r = await 파이썬('폴더고르기');
  if (r.취소) return;
  $('#고른폴더').textContent = r.경로;
  const 결과 = await 파이썬('폴더합치기', r.경로);
  const 칸 = $('#합치기결과');
  칸.innerHTML = '';
  if (결과.오류) { 칸.appendChild(알림상자('위험', 결과.오류)); return; }
  칸.appendChild(알림상자('양호',
    `가져옴 ${결과.가져옴}건 · 이미 있어 건너뜀 ${결과.건너뜀}건` +
    (결과.이름바꿈 ? ` · 이름 바꿔 저장 ${결과.이름바꿈}건` : '')));
  if (결과.실패 && 결과.실패.length) {
    칸.appendChild(알림상자('위험', '실패 ' + 결과.실패.length + '건\n' + 결과.실패.join('\n')));
  }
  await 대기그리기();
}

// ── 리포트 ───────────────────────────────────────────────
async function CSV내보내기() {
  const 칸 = $('#csv결과');
  칸.innerHTML = '';
  const r = await 파이썬('CSV내보내기');
  칸.appendChild(알림상자('양호',
    `응답 ${r.총응답}건을 ${r.게임.length}개 CSV 로 내보냈습니다.\n${r.폴더}`));
  const t = document.createElement('table');
  t.className = '표';
  t.style.marginTop = '12px';
  t.innerHTML = `<thead><tr><th>게임</th><th>응답</th><th>열</th></tr></thead><tbody>${
    r.게임.map((g) => `<tr><td>${escapeHtml(g.게임명)}</td><td>${g.응답}명</td><td>${g.열}열</td></tr>`).join('')
  }</tbody></table>`;
  칸.appendChild(t);
}

async function 리포트만들기() {
  $('#리포트버튼').disabled = true;
  $('#리포트결과').innerHTML = '';
  $('#진행표시').classList.add('보임');
  $('#진행글').textContent = '준비 중';
  await 파이썬('리포트생성');

  const 확인 = setInterval(async () => {
    let p;
    try { p = await 파이썬('진행상황'); } catch (e) { return; }
    $('#진행글').textContent = p.단계 || '진행 중';
    if (!p.끝남) return;

    clearInterval(확인);
    $('#진행표시').classList.remove('보임');
    $('#리포트버튼').disabled = false;

    const 칸 = $('#리포트결과');
    const R = p.결과 || {};
    if (R.오류) { 칸.appendChild(알림상자('위험', R.오류)); return; }

    const g = R.생성 || {};
    // 0건은 성공이 아니다. 초록 상자로 덮으면 담당자가 빈 폴더를 뒤지게 된다.
    if (!g.총문서) {
      const 읽은응답 = (g.게임 || []).reduce((a, x) => a + (x.응답 || 0), 0);
      칸.appendChild(알림상자('위험', 읽은응답
        ? `응답 ${읽은응답}건을 읽었는데 문서가 하나도 만들어지지 않았습니다.\n`
          + '아래 표의 경고를 확인해 주세요.'
        : '문서가 하나도 만들어지지 않았습니다. 읽을 응답이 없습니다.\n'
          + `찾아본 곳: ${g.입력폴더 || '(알 수 없음)'}\n`
          + '[1. 응답을 CSV 로 내보내기] 를 먼저 눌렀는지, '
          + '[모으기] 로 응답을 가져왔는지 확인해 주세요.'));
    } else {
      칸.appendChild(알림상자('양호',
        `문서 ${g.총문서}건을 ${g.초}초에 만들었습니다.\n${g.출력폴더}`));
    }
    const t = document.createElement('table');
    t.className = '표';
    t.style.marginTop = '12px';
    t.innerHTML = `<thead><tr><th>게임</th><th>응답</th><th>카드</th><th>리포트</th>
      <th>6축</th><th>NPS</th><th>플래그</th></tr></thead><tbody>${
      (g.게임 || []).map((x) => `<tr>
        <td>${escapeHtml(x.게임명)}</td><td>${x.응답}</td><td>${x.카드}</td><td>${x.리포트}</td>
        <td>${x['6축'] ?? '—'}</td><td>${x.NPS ?? '—'}</td><td>${x.플래그}</td></tr>`).join('')
    }</tbody></table>`;
    칸.appendChild(t);

    const 경고들 = (g.게임 || []).flatMap((x) => (x.경고 || []).map((w) => `${x.게임명} — ${w}`));
    if (경고들.length) {
      칸.appendChild(알림상자('주의', `확인이 필요한 것 ${경고들.length}건\n` + 경고들.join('\n')));
    }

    if (g.잠긴파일 && g.잠긴파일.length) {
      칸.appendChild(알림상자('주의',
        `다른 프로그램(대개 Word)이 열고 있어 덮어쓰지 못한 파일 ${g.잠긴파일.length}건\n` +
        g.잠긴파일.slice(0, 8).join('\n') + '\n해당 문서를 닫고 다시 만들면 갱신됩니다.'));
    }
    const b = document.createElement('button');
    b.className = '버튼';
    b.style.marginTop = '12px';
    b.textContent = '결과 폴더 열기';
    b.onclick = () => 파이썬('폴더열기', g.출력폴더);
    칸.appendChild(b);
  }, 700);
}

// ── 설정 ─────────────────────────────────────────────────
async function 명부상태그리기() {
  const m = await 파이썬('명부');
  $('#명부상태').innerHTML = '';
  $('#명부상태').appendChild(m.사람.length
    ? 알림상자('양호', `명부 ${m.사람.length}명을 읽었습니다.`)
    : 알림상자('주의', '명부가 없습니다. 참가자가 이름을 직접 적게 됩니다.'));
}

// ── 붙이기 ───────────────────────────────────────────────
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

document.addEventListener('DOMContentLoaded', () => {
  $$('.탭').forEach((b) => {
    b.onclick = async () => {
      const 이름 = b.dataset.화면;
      화면(이름);
      if (이름 === '현황') await 현황그리기();
      if (이름 === '대기') await 대기그리기();
      if (이름 === '설정') await 명부상태그리기();
    };
  });

  $('#시작버튼').onclick = async () => {
    await 대기그리기();
    이름그리기();
    화면('이름');
  };
  $('#이름뒤로').onclick = () => 화면('대기');
  $('#이름칸').oninput = 이름입력바뀜;
  $('#이름칸').onkeydown = (e) => { if (e.key === 'Enter') 이름확인후시작(); };
  $('#이름시작').onclick = 이름확인후시작;

  $('#이전').onclick = () => {
    if (상태.섹션 === 0) { 화면('이름'); return; }
    상태.섹션 -= 1; 설문그리기(); 임시저장();
  };
  $('#다음').onclick = async () => {
    if (!섹션검사()) return;
    if (상태.섹션 === 상태.폼.섹션.length - 1) { await 제출(); return; }
    상태.섹션 += 1; 설문그리기(); 임시저장();
  };

  $('#현황새로').onclick = 현황그리기;
  $('#폴더열기').onclick = () => 파이썬('폴더열기', 상태.설정.응답폴더);
  $('#내폴더열기').onclick = () => 파이썬('폴더열기', 상태.설정.응답폴더);
  $('#데이터폴더열기').onclick = () => 파이썬('폴더열기', 상태.설정.데이터폴더);
  $('#명부새로').onclick = 명부상태그리기;
  $('#폴더고르기').onclick = 폴더고르고합치기;
  $('#csv버튼').onclick = CSV내보내기;
  $('#리포트버튼').onclick = 리포트만들기;

  $('#설정저장').onclick = async () => {
    상태.설정 = await 파이썬('설정저장', {
      게임코드: $('#게임선택').value,
      PC이름: $('#PC이름').value.trim(),
      자동복귀초: Number($('#자동복귀').value) || 0,
    });
    상태.설정 = await 파이썬('설정');
    $('#설정상태').textContent = '저장했습니다';
    setTimeout(() => { $('#설정상태').textContent = ''; }, 2200);
    if (상태.설정.게임코드) await 대기그리기();
  };

  if (window.pywebview) 시동();
  else window.addEventListener('pywebviewready', 시동);
});
