# -*- coding: utf-8 -*-
r"""문체 검증 — skills/game-report-writing 의 검증 절차

  · docx 본문에 습니다체 · 구어체가 0건인가
  · 담당자 안내 문구가 본문에 남지 않았는가 (별도 체크리스트로 옮겼다)
  · 코드 내부 용어가 새어 나오지 않았는가
  · '은(는)' '이(가)' 같은 괄호 조사 표기가 없는가

설문 문항 문구와 응답자가 쓴 답은 그대로 싣는 것이 목적이므로 검사에서 뺀다.
줄에서 그 원문을 먼저 지우고, 남은 부분(= 생성기가 쓴 문장)만 본다.

  python -X utf8 py/test_style.py
"""
import csv
import glob
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from docx import Document                                    # noqa: E402
from docx.oxml.ns import qn                                  # noqa: E402
from docx.table import Table                                 # noqa: E402
from docx.text.paragraph import Paragraph                    # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "out")

금지 = [
    ("습니다체", re.compile(r"(습니다|합니다|됩니다|입니다|십시오|세요)")),
    ("담당자 안내", re.compile(r"(담당자가 할 일|여기에 권고를|확정 필요|확정해|"
                               r"자동 배치한 초안|해석할 때 감안할 점|골라 주|지워 주)")),
    ("코드 내부 용어", re.compile(r"(Config|config\.py|py/|src/|임계값을 조정|플래그 규칙)")),
    ("괄호 조사", re.compile(r"(은\(는\)|이\(가\)|을\(를\)|와\(과\))")),
    ("구어 보조용언", re.compile(r"(해 주세|봐 주세|보시는|드립니다|편이 안전|편이 좋)")),
]


def 본문(path):
    """문단과 표 칸의 텍스트를 문서 순서대로"""
    doc = Document(path)
    출력 = []
    for child in doc.element.body.iterchildren():
        if child.tag == qn("w:p"):
            t = Paragraph(child, doc).text.strip()
            if t:
                출력.append(t)
        elif child.tag == qn("w:tbl"):
            for row in Table(child, doc).rows:
                for c in row.cells:
                    t = " ".join(pp.text for pp in c.paragraphs).strip()
                    if t:
                        출력.append(t)
    return 출력


def 원문목록():
    """검사에서 빼야 할 남의 글 — 설문 문항 · 선택지 · 응답자가 쓴 답.
    긴 것부터 지워야 부분 문자열이 남지 않는다."""
    모음 = set()

    참조 = os.path.join(ROOT, "참조")
    if 참조 not in sys.path:
        sys.path.insert(0, 참조)
    try:
        import survey_data as SD
        섹션 = [SD.SECTION_N, SD.SECTION_A, SD.SECTION_D, SD.SECTION_E]
        for f in SD.FORMS:
            섹션 += list(f["sections"])
        for sec in 섹션:
            for q in sec["questions"]:
                모음.add(q["text"])
                for o in (q.get("options") or []):
                    모음.add(str(o))
    except Exception as e:                                    # noqa: BLE001
        print(f"  [경고] survey_data 를 못 읽었다: {e}")

    for f in glob.glob(os.path.join(ROOT, "data", "응답", "*.csv")):
        with open(f, encoding="utf-8-sig", newline="") as fp:
            for row in csv.reader(fp):
                for cell in row:
                    c = cell.strip()
                    if len(c) >= 3:
                        모음.add(c)

    모음 |= {re.sub(r"^\s*\d+\.\s*", "", x) for x in list(모음)}
    # 문서에는 정규화된 형태로 실린다 (따옴표 · 대시 · 중점 통일, 번호 제거)
    from py.ingest import 정규화
    모음 |= {정규화(x) for x in list(모음)}
    return sorted((x for x in 모음 if len(x) >= 3), key=len, reverse=True)


def 검사(path, 원문):
    걸린것 = []
    for 줄 in 본문(path):
        남은 = 줄
        for 원 in 원문:
            if 원 in 남은:
                남은 = 남은.replace(원, " ")
        for 이름, 패턴 in 금지:
            m = 패턴.search(남은)
            if m:
                걸린것.append((이름, m.group(0), 줄[:76]))
                break
    return 걸린것


def main():
    if not os.path.isdir(OUT):
        print("out/ 이 없다. python run.py --dummy 를 먼저 돌린다.")
        return 1

    원문 = 원문목록()
    파일들 = sorted(glob.glob(os.path.join(OUT, "**", "*.docx"), recursive=True))
    총걸림, 리포트, 카드 = 0, 0, 0
    표본 = []
    걸린파일 = set()

    for f in 파일들:
        걸린 = 검사(f, 원문)
        if "개별카드" in f:
            카드 += 1
        else:
            리포트 += 1
        if 걸린:
            총걸림 += len(걸린)
            걸린파일.add(os.path.relpath(f, ROOT))
            if len(표본) < 15:
                for g in 걸린[:3]:
                    표본.append((os.path.relpath(f, ROOT), g))

    print("── 문체 검증 " + "─" * 56)
    print(f"  검사 대상 — 종합 리포트 {리포트}건 · 개별 카드 {카드}건")
    print(f"  검사 제외 — 설문 문항 · 선택지 · 응답 원문 {len(원문)}종 (그대로 싣는 글)")
    print(f"  검사 항목 — " + " · ".join(이름 for 이름, _ in 금지))
    print()
    if 총걸림:
        print(f"  NG  {총걸림}건 / 문서 {len(걸린파일)}개")
        for 경로, (이름, 조각, 줄) in 표본:
            print(f"    [{이름}] «{조각}»  {경로}")
            print(f"        {줄}")
        if 총걸림 > len(표본):
            print(f"    … 외 {총걸림 - len(표본)}건")
    else:
        print(f"  OK  문서 {len(파일들)}개에서 0건")
    print("═" * 70)
    return 1 if 총걸림 else 0


if __name__ == "__main__":
    sys.exit(main())
