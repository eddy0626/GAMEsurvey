# -*- coding: utf-8 -*-
"""참조/survey_data.py → test/headers_all_forms.json

5개 폼 각각의 응답 시트 헤더 행을 구글 폼이 만드는 것과 똑같이 재현한다.
(gen_gs.py 가 `번호 + ". " + 문항텍스트` 로 제목을 만들고, 그것이 그대로 시트 헤더가 된다)

이걸로 Config.gs 의 문항 매핑을 구글 계정 없이 5개 폼 전부에 대해 검증한다.

    python tools/make_headers.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "참조"))

from survey_data import (FORMS, numbered, SECTIONS_PRE, SECTIONS_POST,  # noqa: E402
                         SECTION_A, SECTION_E)

CODE_BY_NO = {"01": "G01", "02": "G02", "03": "G03", "04": "G04", "05": "G05"}

# 김영범이 확인해 준 실제 응답 시트의 총 열 수 (2026-08-15)
REPORTED_COLS = {"G01": 33, "G02": 33, "G03": 36, "G04": 28, "G05": 39}


def build():
    out = []
    npre = sum(len(s["questions"]) for s in SECTIONS_PRE)
    npost = sum(len(s["questions"]) for s in SECTIONS_POST)

    for f in FORMS:
        rows = [(no, q) for _sec, pairs in numbered(f) for no, q in pairs]
        header = ["타임스탬프"] + ["%d. %s" % (no, q["text"]) for no, q in rows]
        code = CODE_BY_NO[f["no"]]

        고유 = [q for _no, q in rows][npre:len(rows) - npost]
        out.append({
            "코드": code,
            "게임명": f["game"],
            "개발사": f["studio"],
            "헤더": header,
            "총열": len(header),
            "확인된총열": REPORTED_COLS[code],
            "고유문항수": len(고유),
            "고유문항": [{"id": q["id"], "text": q["text"], "type": q["type"],
                          "options": list(q.get("options") or [])} for q in 고유],
        })

    path = os.path.join(ROOT, "test", "headers_all_forms.json")
    with open(path, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)

    print("saved:", path)
    for o in out:
        mark = "OK" if o["총열"] == o["확인된총열"] else "!!"
        print("  %s %-4s %-24s 총열 %2d (확인 %2d) · 고유 %2d문항"
              % (mark, o["코드"], o["게임명"][:22], o["총열"], o["확인된총열"], o["고유문항수"]))

    # 공통 객관식 문항의 선택지 — Config.gs 에 손으로 옮겨 적은 값을 대조하는 데 쓴다
    by_id = {}
    for sec in (SECTION_A, SECTION_E):
        for q in sec["questions"]:
            by_id[q["id"]] = list(q.get("options") or [])
    공통 = {
        "연령대": by_id["A1"], "성별": by_id["A2"], "선호장르": by_id["A3"],
        "진행도": by_id["E1"], "구매의향": by_id["E3"],
        "적정가격": by_id["E4"], "버그경험": by_id["E6"],
    }
    path2 = os.path.join(ROOT, "test", "common_options.json")
    with open(path2, "w", encoding="utf-8") as fp:
        json.dump(공통, fp, ensure_ascii=False, indent=1)
    print("saved:", path2)


if __name__ == "__main__":
    build()
