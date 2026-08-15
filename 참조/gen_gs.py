# -*- coding: utf-8 -*-
"""Apps Script 1회 실행으로 5개 폼 + 응답 시트를 만드는 .gs 생성."""
import json
from survey_data import FORMS, HEX_AXES, CONFIRM_MSG, intro, numbered, total_questions

import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", '2026_플레이테스트_구글폼_자동생성.gs')


def jq(q, no=None):
    d = {"id": q["id"], "text": q["text"], "type": q["type"],
         "required": bool(q.get("required"))}
    if no is not None:
        d["no"] = no
    if q.get("help"):
        d["help"] = q["help"]
    if q.get("options") and q["type"] in ("객관식", "체크박스"):
        d["options"] = list(q["options"])
    if q.get("other"):
        d["other"] = True
    if q["type"] == "선형배율":
        d["bounds"] = list(q["bounds"])
        d["labels"] = list(q["labels"])
    if q.get("axis"):
        d["axis"] = q["axis"]
    return d


def build():
    forms = []
    for f in FORMS:
        secs = [{"title": sec["title"], "desc": sec.get("desc", ""),
                 "questions": [jq(q, no) for no, q in rows]}
                for sec, rows in numbered(f)]
        forms.append({
            "no": f["no"],
            "title": f"「{f['game']}」 플레이테스트 설문",
            "description": intro(f["game"], f["studio"], f["minutes"]),
            "sections": secs,
        })

    data = json.dumps(forms, ensure_ascii=False, indent=2)

    gs = '''/**
 * 2026 충북 인디게임 플레이테스트 — 구글폼 5종 자동 생성
 * ---------------------------------------------------------------
 * 사용법
 *   1. https://script.google.com 접속 → 새 프로젝트
 *   2. 기본 코드를 전부 지우고 이 파일 내용을 붙여넣기
 *   3. 상단 함수 선택창에서 createAllForms 선택 → 실행
 *   4. 첫 실행 시 권한 승인
 *      권한 검토 → 계정 선택 → "Google에서 확인하지 않은 앱" 경고 →
 *      고급 → 프로젝트 이름(안전하지 않음)으로 이동 → 허용
 *   5. 하단 실행 로그에 폼 5개의 편집 URL · 응답 URL · 응답 시트 URL이 출력됨
 *
 * 만들어지는 위치: 실행한 계정의 내 드라이브 최상위
 *
 * 주의
 *   · 첫 섹션은 참여 동의입니다. N2 · N3는 선택지가 "동의합니다" 하나뿐인 필수 문항이라
 *     동의하지 않으면 제출이 되지 않습니다.
 *   · 게임 전체 평가의 D1~D6이 육각형(레이더) 차트의 여섯 축입니다.
 *     축 순서를 바꾸면 차트 모양이 달라지니 다섯 폼에서 동일하게 유지하세요.
 *   · 하굣길 폼의 조건부 문항(Q1-2 · Q2-2 · Q3-2)은 문항 앞에 조건을 명시하는
 *     방식으로 만들어집니다. 실제 섹션 분기가 필요하면 편집기에서 설정하세요.
 *   · 폼 5개를 한 번에 만들면 실행 시간이 1~2분 걸립니다.
 *   · 특정 폼만 다시 만들려면 createOneForm("03") 처럼 순번을 넘기세요.
 */

// ── 설정 ────────────────────────────────────────────────────
var CONFIG = {
  createResponseSheet: true,   // 응답 스프레드시트 동시 생성
  progressBar: true,           // 상단 진행률 표시줄
  collectEmail: false,         // 이메일 주소 수집 (경품·추첨이 있으면 true)
  shuffleQuestions: false,     // 문항 순서 섞기 (플레이테스트에서는 false 권장)
  confirmationMessage: %CONFIRM%
};

// ── 폼 정의 (survey_data 기준 자동 생성) ────────────────────
var FORMS = %DATA%;

// ── 실행 진입점 ─────────────────────────────────────────────
//
//  ※ 이 함수는 다시 돌려도 폼이 새로 생기지 않는다.
//    같은 제목의 폼이 드라이브에 이미 있으면 건너뛰고 기존 URL 만 찍는다.
//    2026-08-15 에 이걸 두 번 돌려 폼이 세 벌이 되고 응답이 갈릴 뻔했다.
//    정말 새로 만들어야 하면 createAllForms(true) 로 명시한다.
//    만들기 전에 listForms() 로 현재 상태를 먼저 보는 편이 안전하다.

function createAllForms(force) {
  var log = [], 만듦 = 0, 건너뜀 = 0;
  for (var i = 0; i < FORMS.length; i++) {
    var 기존 = findExistingForm_(FORMS[i].title);
    if (기존 && !force) {
      log.push(describeExisting_(FORMS[i], 기존));
      건너뜀++;
    } else {
      if (기존) log.push("[주의] 같은 제목의 폼이 이미 있는데 또 만듭니다: " + FORMS[i].title);
      log.push(buildForm_(FORMS[i]));
      만듦++;
    }
  }

  var 머리 = "\\n\\n===== 실행 결과 =====\\n새로 만든 폼 " + 만듦 + "개  ·  건너뛴 폼 " + 건너뜀 + "개\\n";
  if (건너뜀) {
    머리 += "\\n이미 있는 폼은 만들지 않고 기존 URL 을 아래에 찍었습니다."
         +  "\\n정말 새로 만들어야 하면 createAllForms(true) 를 실행하세요."
         +  "\\n다만 그러면 같은 제목의 폼이 두 벌이 되고, 이미 뿌린 응답 URL 로는"
         +  "\\n옛 폼에 응답이 계속 쌓입니다. 옛 폼을 먼저 휴지통으로 보내는 편이 안전합니다.\\n";
  }
  if (force) {
    머리 += "\\n[경고] force=true 로 실행했습니다. 중복 폼이 생기지 않았는지 드라이브를 확인하세요.\\n";
  }
  Logger.log(머리 + "\\n" + log.join("\\n\\n"));
}

function createOneForm(no, force) {
  for (var i = 0; i < FORMS.length; i++) {
    if (FORMS[i].no === String(no)) {
      var 기존 = findExistingForm_(FORMS[i].title);
      if (기존 && !force) {
        Logger.log(describeExisting_(FORMS[i], 기존)
          + "\\n\\n이미 있어서 만들지 않았습니다."
          + "\\n정말 새로 만들려면 createOneForm(\\"" + no + "\\", true) 를 실행하세요.");
        return;
      }
      Logger.log(buildForm_(FORMS[i]));
      return;
    }
  }
  throw new Error("순번 " + no + " 에 해당하는 폼이 없습니다. (01~05)");
}

/**
 * 만들지 않고 현재 상태만 본다.
 * 어느 폼이 살아 있고 응답이 몇 건 들어왔는지, 응답 시트 ID 가 무엇인지 확인할 때 쓴다.
 */
function listForms() {
  var log = [];
  for (var i = 0; i < FORMS.length; i++) {
    var 기존 = findExistingForm_(FORMS[i].title);
    log.push(기존 ? describeExisting_(FORMS[i], 기존)
                  : "[" + FORMS[i].no + "] " + FORMS[i].title + "\\n  없음 — 아직 만들지 않았습니다");
  }
  Logger.log("\\n\\n===== 현재 폼 상태 =====\\n" + log.join("\\n\\n"));
}

/** 같은 제목의 구글 폼을 찾는다 (휴지통 제외). 여러 개면 가장 최근 것. */
function findExistingForm_(title) {
  var it = DriveApp.getFilesByName(title), 최근 = null;
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType() !== MimeType.GOOGLE_FORMS) continue;
    if (f.isTrashed()) continue;
    if (!최근 || f.getDateCreated() > 최근.getDateCreated()) 최근 = f;
  }
  return 최근;
}

/** 이미 있는 폼의 URL 과 응답 현황을 문자열로 */
function describeExisting_(def, file) {
  var out = "[" + def.no + "] " + def.title + "  — 이미 있음";
  try {
    var form = FormApp.openById(file.getId());
    out += "\\n  생성 일시 : " + Utilities.formatDate(file.getDateCreated(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")
        +  "\\n  편집 URL : " + form.getEditUrl()
        +  "\\n  응답 URL : " + form.getPublishedUrl()
        +  "\\n  받은 응답 : " + form.getResponses().length + "건";
    var dest = form.getDestinationId();
    if (dest) {
      var ss = SpreadsheetApp.openById(dest);
      out += "\\n  응답 시트 : " + ss.getUrl()
          +  "\\n  시트 ID  : " + dest
          +  "\\n  시트 열 수: " + ss.getSheets()[0].getLastColumn();
    } else {
      out += "\\n  응답 시트 : 연결 안 됨";
    }
  } catch (e) {
    out += "\\n  [열 수 없음] " + e.message;
  }
  return out;
}

// ── 폼 빌더 ─────────────────────────────────────────────────
function buildForm_(def) {
  var form = FormApp.create(def.title);
  form.setTitle(def.title)
      .setDescription(def.description)
      .setProgressBar(CONFIG.progressBar)
      .setCollectEmail(CONFIG.collectEmail)
      .setShuffleQuestions(CONFIG.shuffleQuestions)
      .setConfirmationMessage(CONFIG.confirmationMessage)
      .setAllowResponseEdits(false)
      .setLimitOneResponsePerUser(false);

  for (var s = 0; s < def.sections.length; s++) {
    var sec = def.sections[s];
    if (s === 0) {
      // 첫 섹션은 폼 설명 아래에 제목/설명 항목으로 배치
      var head = form.addSectionHeaderItem().setTitle(sec.title);
      if (sec.desc) head.setHelpText(sec.desc);
    } else {
      var page = form.addPageBreakItem().setTitle(sec.title);
      if (sec.desc) page.setHelpText(sec.desc);
    }
    for (var q = 0; q < sec.questions.length; q++) {
      addQuestion_(form, sec.questions[q]);
    }
  }

  var out = "[" + def.no + "] " + def.title
          + "\\n  편집 URL : " + form.getEditUrl()
          + "\\n  응답 URL : " + form.getPublishedUrl();

  if (CONFIG.createResponseSheet) {
    var ss = SpreadsheetApp.create(def.title + " (응답)");
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    out += "\\n  응답 시트 : " + ss.getUrl();
  }
  return out;
}

// ── 문항 생성 ───────────────────────────────────────────────
function addQuestion_(form, q) {
  // 응답자에게는 폼 전체 연속번호로 보이고, 내부 ID(q.id)는 노출하지 않는다
  var title = (q.no ? q.no + ". " : "") + q.text;
  var item;

  switch (q.type) {
    case "객관식":
      item = form.addMultipleChoiceItem().setTitle(title);
      applyChoices_(item, q);
      break;

    case "체크박스":
      item = form.addCheckboxItem().setTitle(title);
      applyChoices_(item, q);
      break;

    case "단답형":
      item = form.addTextItem().setTitle(title);
      break;

    case "장문형":
      item = form.addParagraphTextItem().setTitle(title);
      break;

    case "선형배율":
      item = form.addScaleItem()
                 .setTitle(title)
                 .setBounds(q.bounds[0], q.bounds[1])
                 .setLabels(q.labels[0], q.labels[1]);
      break;

    default:
      throw new Error("알 수 없는 문항 유형: " + q.type);
  }

  if (q.help) item.setHelpText(q.help);
  item.setRequired(!!q.required);
}

function applyChoices_(item, q) {
  var choices = [];
  for (var i = 0; i < q.options.length; i++) {
    choices.push(item.createChoice(q.options[i]));
  }
  item.setChoices(choices);
  if (q.other) item.showOtherOption(true);
}

// ── 점검용: 생성될 문항 수를 미리 확인 ──────────────────────
function previewHexAxes() {
  Logger.log("육각형 축 순서: " + %HEX% .join("  ·  "));
  var f = FORMS[0], out = [];
  for (var s = 0; s < f.sections.length; s++) {
    for (var q = 0; q < f.sections[s].questions.length; q++) {
      var it = f.sections[s].questions[q];
      if (it.axis) out.push(it.no + "번 " + it.axis);
    }
  }
  Logger.log("응답 시트 열 위치(01번 폼 기준): " + out.join(" / "));
}

function previewCounts() {
  var lines = [];
  for (var i = 0; i < FORMS.length; i++) {
    var f = FORMS[i], n = 0, parts = [];
    for (var s = 0; s < f.sections.length; s++) {
      n += f.sections[s].questions.length;
      parts.push(f.sections[s].title + "(" + f.sections[s].questions.length + ")");
    }
    lines.push("[" + f.no + "] " + f.title + " — 총 " + n + "문항\\n      " + parts.join(" · "));
  }
  Logger.log(lines.join("\\n"));
}
'''
    gs = gs.replace("%HEX%", json.dumps(HEX_AXES, ensure_ascii=False))
    gs = gs.replace("%CONFIRM%", json.dumps(CONFIRM_MSG, ensure_ascii=False))
    gs = gs.replace("%DATA%", data)

    with open(OUT, "w", encoding="utf-8") as fp:
        fp.write(gs)
    print("saved:", OUT, "/", len(gs), "chars")


if __name__ == "__main__":
    build()
