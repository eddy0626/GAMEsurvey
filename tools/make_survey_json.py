# -*- coding: utf-8 -*-
"""참조/survey_data.py → app/web/survey.json

앱이 문항을 그리는 데 쓰는 파일. 문항 단일 원본은 여전히 survey_data.py 다.
문항이 바뀌면 이 스크립트를 다시 돌린다.

구글 폼과 같은 헤더를 만들어야 하므로 연속번호(no)를 함께 담는다.
앱이 CSV 로 내보낼 때 `{no}. {text}` 로 헤더를 만든다.

    python -X utf8 tools/make_survey_json.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "참조"))

from survey_data import (CONFIRM_MSG, FORMS, HEX_AXES, SECTIONS_POST,  # noqa: E402
                         SECTIONS_PRE, intro, numbered)

CODE_BY_NO = {"01": "G01", "02": "G02", "03": "G03", "04": "G04", "05": "G05"}


def 문항(no, q):
    d = {
        "no": no,
        "id": q["id"],
        "text": q["text"],
        "type": q["type"],
        "required": bool(q.get("required")),
    }
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
    폼들 = []
    for f in FORMS:
        섹션 = []
        for sec, rows in numbered(f):
            섹션.append({
                "title": sec["title"],
                "desc": sec.get("desc", ""),
                "questions": [문항(no, q) for no, q in rows],
            })
        모든문항 = [q for s in 섹션 for q in s["questions"]]
        폼들.append({
            "코드": CODE_BY_NO[f["no"]],
            "no": f["no"],
            "게임명": f["game"],
            "개발사": f["studio"],
            "제목": f'「{f["game"]}」 플레이테스트 설문',
            "설명": intro(f["game"], f["studio"]),
            "섹션": 섹션,
            "문항수": len(모든문항),
            "열수": len(모든문항) + 1,          # 타임스탬프 포함
            "헤더": ["타임스탬프"] + [f'{q["no"]}. {q["text"]}' for q in 모든문항],
        })

    out = {
        "생성": "tools/make_survey_json.py",
        "원본": "참조/survey_data.py",
        "육각축": list(HEX_AXES),
        "완료문구": CONFIRM_MSG,
        "공통섹션수": {"앞": len(SECTIONS_PRE), "뒤": len(SECTIONS_POST)},
        "폼": 폼들,
    }

    폴더 = os.path.join(ROOT, "app", "web")
    os.makedirs(폴더, exist_ok=True)
    경로 = os.path.join(폴더, "survey.json")
    with open(경로, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)

    print("saved:", os.path.relpath(경로, ROOT))
    for f in 폼들:
        유형 = {}
        for s in f["섹션"]:
            for q in s["questions"]:
                유형[q["type"]] = 유형.get(q["type"], 0) + 1
        print(f'  {f["코드"]}  {f["게임명"][:22]:<24} {f["문항수"]:>2}문항 · {f["열수"]}열 · '
              f'섹션 {len(f["섹션"])}  {유형}')
    return 경로


if __name__ == "__main__":
    build()
