# -*- coding: utf-8 -*-
"""개별 응답 카드 (1~2페이지)

한 사람이 한 게임에 대해 답한 내용을 그대로 담는다.
해석 · 평가 문장은 넣지 않는다. 원문과 위치 정보만 보여 주는 문서다.

  머리말      게임명 · 응답자 ID · 제출 일시 · 응답자 유형
  응답자 정보  연령대 · 성별 · 선호 장르
  평가 차트    육각형 6축 — 본인 점수와 전체 평균을 겹쳐 표시
  항목별 응답  선택형 문항 전체를 표로. 소수 의견인 항목은 표시
  서술형 원문  게임 고유 서술형 + 공통 서술형 전문
  요약 한 줄   진행도 · 구매 의향 · 추천 점수만 자동 문장화

응답자 실명은 어디에도 쓰지 않는다.
"""
import os

from docx.shared import Pt

from . import config as C
from .aggregate import 백분율, 찾기
from .docxkit import (ACCENT, GRAY, body_p, card, caption, datatable, 문서만들기,
                      fixed_table, h, pic, run, shade, spacer, white_borders,
                      cell_margins, set_cell_width)
from .ingest import 무응답, 숫자


def _소수의견(항, 답, N):
    """전체에서 이 답을 고른 비율이 기준 미만이면 표시를 붙인다"""
    if not 답 or N == 0:
        return ""
    인원 = 찾기(항["집계"], 답)["인원"]
    if 인원 == 0:
        return ""
    비율 = 인원 / N
    if 비율 < C.임계값["소수의견_비율"]:
        return f"  ◂ 소수 의견 {인원}/{N}명"
    return f"  ({인원}/{N}명)"


def 만들기(r, 집계, 경로, 차트경로):
    """카드 한 장. r=응답, 집계=게임집계() 결과"""
    지표 = 집계["지표"]
    게임 = 집계["게임"]
    N = 지표["N"]
    doc = 문서만들기()

    # ── 머리말 ──
    p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(2)
    run(p, C.사업명, size=8.5, bold=True, color=ACCENT)
    p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(3)
    run(p, f"「{게임['게임명']}」 응답 카드", size=20, bold=True)
    p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(12)
    제출 = r.타임스탬프 if isinstance(r.타임스탬프, str) else str(r.타임스탬프)
    run(p, f"응답자 {r.ID}  ·  {r.유형}  ·  제출 {제출}  ·  개발사 {게임['개발사']}",
        size=9.5, color=GRAY)

    # ── 응답자 정보 ──
    t = fixed_table(doc, [1606 * 2, 1606 * 2, 1606 * 2])
    항목들 = [("연령대", r.연령대 or "-"), ("성별", r.성별 or "-"),
              ("선호 장르", " · ".join(r.선호장르) if r.선호장르 else "-")]
    for i, (라벨, 값) in enumerate(항목들):
        c = t.rows[0].cells[i]
        white_borders(c); shade(c, "F1F6FB"); cell_margins(c, 110, 120, 110, 120)
        c.paragraphs[0].text = ""
        c.paragraphs[0].paragraph_format.space_after = Pt(2)
        run(c.paragraphs[0], 라벨, size=8, color=GRAY, bold=True)
        p2 = c.add_paragraph(); p2.paragraph_format.space_after = Pt(0)
        run(p2, 값, size=10, bold=True)
    spacer(doc, 10)

    # ── 평가 차트 ──
    h(doc, "게임 전체 평가", 12, ACCENT, before=4, after=4, rule=True)
    if os.path.exists(차트경로):
        pic(doc, 차트경로, 10.5)
        caption(doc, f"육각형 6축 — 파란 실선이 {r.ID}, 회색 점선이 응답자 {N}명 평균")

    행 = []
    for i, (_, 이름) in enumerate(C.육각축):
        내점수 = r.육각[i]
        평균 = 지표["육각"][i]["평균"]
        차 = (내점수 - 평균) if (내점수 is not None and 평균 is not None) else None
        행.append([이름, 내점수 if 내점수 is not None else "-",
                   f"{평균:.2f}" if 평균 is not None else "-",
                   ("+" if 차 and 차 > 0 else "") + (f"{차:.2f}" if 차 is not None else "-")])
    for k, (키, 이름) in enumerate(C.추가축):
        내점수 = getattr(r, 키)
        평균 = 지표["추가"][k]["평균"]
        차 = (내점수 - 평균) if (내점수 is not None and 평균 is not None) else None
        행.append([이름, 내점수 if 내점수 is not None else "-",
                   f"{평균:.2f}" if 평균 is not None else "-",
                   ("+" if 차 and 차 > 0 else "") + (f"{차:.2f}" if 차 is not None else "-")])
    datatable(doc, ["항목", "내 점수", "전체 평균", "차이"], 행,
              [3600, 1800, 2000, 2237], sizes=(8.5, 8.8))
    spacer(doc, 8)

    # ── 선택형 응답 ──
    h(doc, "항목별 응답", 12, ACCENT, before=8, after=4, rule=True)
    행2 = []
    for 항 in 집계["문항집계"]:
        if 항["유형"] == "서술형":
            continue
        if 항["출처"] == "고유":
            셀 = next((c for c in r.고유 if c["문항"] == 항["문항"]), None)
            답 = 셀["답"] if 셀 else ""
            값들 = 셀["값"] if 셀 else []
        else:
            답 = getattr(r, 항["키"]) or ""
            값들 = [답] if 답 else []
        if not 답:
            행2.append([항["문항"], "(무응답)", ""])
            continue

        if 항["유형"] == "선형배율" and 항["통계"]:
            # 점수 문항은 '소수 의견'이 아니라 평균 대비 위치를 보여 주는 편이 맞다
            내점수 = 숫자(답)
            평균 = 항["통계"]["평균"]
            if 내점수 is not None and 평균 is not None:
                차 = 내점수 - 평균
                비고 = f"전체 평균 {평균:.2f}  ({'+' if 차 > 0 else ''}{차:.2f})"
            else:
                비고 = ""
        else:
            조각 = []
            for v in 값들:
                인원 = 찾기(항["집계"], v)["인원"]
                조각.append(f"{인원}/{N}" + ("◂소수" if 인원 and 인원 / N < C.임계값["소수의견_비율"] else ""))
            비고 = " · ".join(조각)
        행2.append([항["문항"], 답, 비고])
    if 행2:
        datatable(doc, ["문항", "응답", "전체 대비"], 행2, [4200, 3600, 1837], sizes=(8.3, 8.3))
    spacer(doc, 8)

    # ── 서술형 원문 ──
    서술항목 = []
    for 항 in 집계["문항집계"]:
        if 항["출처"] == "고유" and 항["유형"] == "서술형":
            셀 = next((c for c in r.고유 if c["문항"] == 항["문항"]), None)
            서술항목.append((항["문항"], 셀["답"] if 셀 else ""))
    for 키, 라벨 in [("개선점", "현재 빌드에서 수정 · 개선되었으면 하는 점"),
                     ("버그상황", "버그 · 오류 발생 상황"),
                     ("개발팀메시지", "개발팀에 전하고 싶은 말")]:
        서술항목.append((라벨, getattr(r, 키)))

    쓴것 = [(라벨, 글) for 라벨, 글 in 서술항목 if not 무응답(글)]
    h(doc, f"서술형 응답  ({len(쓴것)}/{len(서술항목)}건 작성)", 12, ACCENT, before=8, after=4, rule=True)
    if not 쓴것:
        body_p(doc, "서술형 문항에 작성한 내용이 없습니다.", size=9, color=GRAY)
    for 라벨, 글 in 쓴것:
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(6); p.paragraph_format.space_after = Pt(2)
        run(p, 라벨, size=8.5, bold=True, color=GRAY)
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.left_indent = Pt(8)
        p.paragraph_format.line_spacing = 1.35
        run(p, 글, size=9.5)

    # ── 요약 한 줄 ──
    spacer(doc, 6)
    body = card(doc, ACCENT, "F1F6FB")
    p = body.paragraphs[0]; p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.35
    개인평균 = [v for v in r.육각 if v is not None]
    조각 = []
    if 개인평균:
        조각.append(f"6축 평균 {sum(개인평균)/len(개인평균):.2f}점")
    if r.진행도:
        조각.append(f"진행도 '{r.진행도}'")
    if r.구매의향:
        조각.append(f"구매 의향 '{r.구매의향}'")
    if r.추천의향 is not None:
        구분 = "추천" if r.추천의향 >= 9 else ("중립" if r.추천의향 >= 7 else "비추천")
        조각.append(f"추천 점수 {r.추천의향}점({구분})")
    run(p, "요약  ", size=8.5, bold=True, color=ACCENT)
    run(p, " · ".join(조각) if 조각 else "요약할 수치가 없습니다.", size=9.5)

    doc.save(경로)
    return 경로


def 파일명(게임, r):
    안전 = 게임["게임명"].replace("/", "／").replace(":", "：")
    return f"「{안전}」_{r.ID}_응답카드.docx"
