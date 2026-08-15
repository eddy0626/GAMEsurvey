# -*- coding: utf-8 -*-
"""참조/survey_data.py + 참조/report_data.py → test/fixture_mistworld.json

구글 폼이 만드는 응답 시트와 똑같은 모양(헤더 문구 · 번호 접두사 · 체크박스 쉼표 결합)의
2차원 배열을 만든다. 이것으로 Aggregate.gs 를 Node 에서 그대로 돌려
수작업 리포트(미스트월드_플레이테스트_결과리포트.docx)의 수치와 대조한다.

    python tools/make_fixture.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "참조"))

from survey_data import FORM01, numbered          # noqa: E402
from report_data import R                          # noqa: E402

# 응답 dict 의 키 → 문항 ID
KEY_BY_ID = {
    "A1": "age", "A2": "gender", "A3": "genres",
    "Q1": "tut", "Q2": "battle_sys", "Q3": "battle_diff", "Q4": "breakg",
    "Q5": "story", "Q6": "uiux", "Q7": "dice", "Q8": "search",
    "Q9": "job", "Q10": "unfair",
    "D7": "flow", "D8": "tech",
    "E1": "progress", "E2": "improve", "E3": "buy", "E4": "price",
    "E5": "nps", "E6": "bug", "E7": "bugdesc", "E8": "message",
}
HEX_ID = {"D1": 0, "D2": 1, "D3": 2, "D4": 3, "D5": 4, "D6": 5}


def cell(q, r, idx):
    qid = q["id"]
    if qid == "N1":
        # 실명 자리. 명부 대조를 시험하려고 서로 다른 이름을 넣는다.
        return "테스트응답자%02d" % (idx + 1)
    if qid in ("N2", "N3"):
        return "동의합니다"
    if qid in HEX_ID:
        return r["hex"][HEX_ID[qid]]
    key = KEY_BY_ID.get(qid)
    if key is None:
        return ""
    v = r.get(key, "")
    if isinstance(v, list):
        return ", ".join(v)        # 구글 폼 체크박스 결합 방식
    return v


def build():
    rows = [(no, q) for _sec, pairs in numbered(FORM01) for no, q in pairs]

    header = ["타임스탬프"] + ["%d. %s" % (no, q["text"]) for no, q in rows]

    data = []
    for i, r in enumerate(R):
        # 제출 시각은 순서대로 1분씩
        ts = "2026-08-14 13:%02d:00" % i
        data.append([ts] + [cell(q, r, i) for _no, q in rows])

    out = {
        "게임": {"코드": "G01", "게임명": "미스트월드", "개발사": "프로젝트 미스트"},
        "설명": "survey_data.FORM01 문항 순서 · report_data.R 15명 응답을 "
                "구글 폼 응답 시트 모양으로 옮긴 것",
        "헤더": header,
        "행": data,
        "명부": [["테스트응답자%02d" % (i + 1),
                  "P%02d" % (i + 1),
                  "전문가" if i >= 13 else "교육생", ""] for i in range(len(R))],
    }

    path = os.path.join(ROOT, "test", "fixture_mistworld.json")
    with open(path, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)
    print("saved:", path)
    print("열 %d개 · 행 %d개" % (len(header), len(data)))
    for n, hh in list(enumerate(header))[:8]:
        print("  %2d  %s" % (n, hh))
    print("  ...")
    for n in range(len(header) - 8, len(header)):
        print("  %2d  %s" % (n, header[n]))


if __name__ == "__main__":
    build()
