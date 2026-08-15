# -*- coding: utf-8 -*-
"""앱 저장 · 내보내기 검증 (창 없이)

가장 중요한 것 하나 — 앱이 내보낸 CSV 를 기존 py/ingest.py 가 읽을 수 있는가.
읽히지 않으면 설계가 무너진다. 열 수 · 공통 문항 매핑 · 값 형식을 전부 본다.

    python -X utf8 app/test_store.py
"""
import json
import os
import shutil
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app import settings, store                                  # noqa: E402
from py import config as C                                       # noqa: E402
from py.aggregate import 게임집계                                  # noqa: E402
from py.ingest import 명부적용, 이름키, 자동읽기, 파싱               # noqa: E402

통과 = 실패 = 0
실패목록 = []


def eq(라벨, 실제, 기대):
    global 통과, 실패
    ok = str(실제) == str(기대)
    if ok:
        통과 += 1
    else:
        실패 += 1
        실패목록.append(f"{라벨} — 기대 {기대} / 실제 {실제}")
    print(f"  {'OK ' if ok else 'NG '} {라벨:<50} {str(실제):>8}  (기대 {기대})")


def 절(t):
    print(f"\n── {t} " + "─" * max(0, 56 - len(t)))


# 임시 폴더에서 돌린다. 진짜 앱데이터를 건드리지 않는다.
임시 = tempfile.mkdtemp(prefix="설문앱검증_")
settings.앱폴더 = lambda: 임시                                     # noqa: E731

절("0. 설문 정의")
전체 = store.설문전체()
eq("폼 5개", len(전체["폼"]), 5)
기대열 = {"G01": 33, "G02": 33, "G03": 36, "G04": 30, "G05": 40}
for f in 전체["폼"]:
    eq(f'{f["코드"]} 열 수', f["열수"], 기대열[f["코드"]])
    eq(f'{f["코드"]} 헤더 길이', len(f["헤더"]), 기대열[f["코드"]])
eq("첫 헤더는 타임스탬프", 전체["폼"][0]["헤더"][0], "타임스탬프")
eq("두 번째 헤더에 번호 접두사", 전체["폼"][0]["헤더"][1].startswith("1. "), True)

절("1. 설정")
settings.쓰기({"게임코드": "G01", "PC이름": "1번 부스"})
eq("게임 코드 저장됨", settings.읽기()["게임코드"], "G01")
eq("응답 폴더 생김", os.path.isdir(settings.응답폴더()), True)

절("2. 명부")
with open(store.명부경로(), "w", encoding="utf-8-sig", newline="") as fp:
    fp.write("이름,ID,유형,비고\n")
    for i in range(1, 17):
        fp.write(f"검증{i:02d},P{i:02d},{'전문가' if i > 14 else '교육생'},\n")
eq("명부 16명", len(store.명부()), 16)

절("3. 응답 저장")
폼G1 = store.폼("G01")
문항들 = [q for s in 폼G1["섹션"] for q in s["questions"]]


def 답만들기(사람번호):
    답 = {}
    for q in 문항들:
        t = q["type"]
        if q["id"] == "N1":
            답[q["id"]] = f"검증{사람번호:02d}"
        elif t == "객관식":
            답[q["id"]] = q["options"][사람번호 % len(q["options"])]
        elif t == "체크박스":
            n = 1 + (사람번호 % 2)
            답[q["id"]] = q["options"][:n]
        elif t == "선형배율":
            lo, hi = q["bounds"]
            답[q["id"]] = lo + (사람번호 % (hi - lo + 1))
        elif t == "장문형":
            답[q["id"]] = "" if 사람번호 % 3 == 0 else f"검증{사람번호:02d} 의 서술 응답이다."
        else:
            답[q["id"]] = f"응답{사람번호:02d}"
    return 답


for i in range(1, 17):
    store.저장({"게임코드": "G01", "이름": f"검증{i:02d}", "ID": f"P{i:02d}",
                "유형": "전문가" if i > 14 else "교육생", "답": 답만들기(i)})
eq("저장된 응답 16건", len(store.목록("G01")), 16)
eq("이미 응답한 사람 16명", len(store.이미응답한사람("G01")), 16)

절("4. 임시 저장")
store.임시저장({"사람": {"이름": "검증01"}, "답": {"N1": "검증01"}, "섹션": 2})
eq("임시 불러오기", (store.임시불러오기() or {}).get("섹션"), 2)
eq("임시는 응답 목록에 안 섞인다", len(store.목록("G01")), 16)
store.임시삭제()
eq("임시 삭제됨", store.임시불러오기(), None)

절("5. 폴더 합치기")
남의PC = os.path.join(임시, "USB", "응답")
os.makedirs(남의PC, exist_ok=True)
for i in range(1, 4):
    with open(os.path.join(남의PC, f"G02_20260820_10000{i}_P{i:02d}.json"),
              "w", encoding="utf-8") as fp:
        json.dump({"게임코드": "G02", "이름": f"검증{i:02d}", "ID": f"P{i:02d}",
                   "유형": "교육생", "제출시각": f"2026-08-20 10:00:0{i}",
                   "답": {"N1": f"검증{i:02d}"}}, fp, ensure_ascii=False)
r = store.폴더합치기(남의PC)
eq("가져옴 3건", r["가져옴"], 3)
r2 = store.폴더합치기(남의PC)
eq("같은 폴더 또 합치면 전부 건너뜀", r2["건너뜀"], 3)
eq("이름 바꿔 저장 0건", r2["이름바꿈"], 0)
eq("전체 응답 19건", len(store.목록()), 19)

절("6. CSV 내보내기 — 구글 폼 시트와 같은 형식인가")
내보냄 = store.CSV내보내기(os.path.join(임시, "data", "응답"))
eq("게임 5개 모두 파일 생성", len(내보냄["게임"]), 5)
맵 = {g["코드"]: g for g in 내보냄["게임"]}
eq("G01 응답 16건", 맵["G01"]["응답"], 16)
eq("G02 응답 3건", 맵["G02"]["응답"], 3)
for 코드, 열 in 기대열.items():
    eq(f"{코드} CSV 열 수", 맵[코드]["열"], 열)

절("7. 기존 파이프라인이 읽는가 — 가장 중요한 검사")
헤더, 행들 = 자동읽기(맵["G01"]["경로"])
eq("CSV 열 수", len(헤더), 33)
eq("CSV 행 수", len(행들), 16)

게임 = C.게임찾기("G01")
응답, 매핑 = 파싱(헤더, 행들, 게임)
eq("공통 문항 누락 0", len(매핑["누락"]), 0)
if 매핑["누락"]:
    print("     누락:", ", ".join(매핑["누락"]))
eq("공통 문항 중복 0", len(매핑["중복"]), 0)
eq("고유 문항 10개", len(매핑["고유"]), 10)
eq("파싱된 응답 16건", len(응답), 16)

명부 = {이름키(p["이름"]): dict(이름=p["이름"], ID=p["ID"], 유형=p["유형"])
        for p in store.명부()}
명부적용(응답, 명부)
eq("첫 응답자 ID", 응답[0].ID, "P01")
eq("6축 점수가 숫자로 읽힌다", all(isinstance(v, (int, float)) for v in 응답[0].육각), True)
eq("체크박스가 배열로 쪼개진다", isinstance(응답[0].선호장르, list), True)
eq("선호장르 비어 있지 않다", len(응답[0].선호장르) > 0, True)
eq("추천의향이 숫자", isinstance(응답[0].추천의향, (int, float)), True)

A = 게임집계(응답, 게임)
eq("집계 N", A["지표"]["N"], 16)
eq("6축 평균이 나온다", A["지표"]["육각총평균"] is not None, True)
eq("NPS 가 나온다", A["지표"]["NPS"]["값"] is not None, True)
eq("문항 집계가 나온다", len(A["문항집계"]) > 0, True)
eq("플래그 판정이 죽지 않는다", isinstance(A["플래그"], list), True)
print(f'     6축 {A["지표"]["육각총평균"]} · NPS {A["지표"]["NPS"]["값"]} · '
      f'플래그 {len(A["플래그"])}개')

절("8. 어센디아(선형배율 고유 문항) 도 읽히는가")
settings.쓰기({"게임코드": "G04"})
폼G4 = store.폼("G04")
문항G4 = [q for s in 폼G4["섹션"] for q in s["questions"]]
for i in range(1, 6):
    답 = {}
    for q in 문항G4:
        t = q["type"]
        if q["id"] == "N1":
            답[q["id"]] = f"검증{i:02d}"
        elif t == "객관식":
            답[q["id"]] = q["options"][i % len(q["options"])]
        elif t == "체크박스":
            답[q["id"]] = q["options"][: 1 + (i % 2)]
        elif t == "선형배율":
            lo, hi = q["bounds"]
            답[q["id"]] = lo + (i % (hi - lo + 1))
        else:
            답[q["id"]] = f"검증{i:02d} 서술"
    store.저장({"게임코드": "G04", "이름": f"검증{i:02d}", "ID": f"P{i:02d}",
                "유형": "교육생", "답": 답})
내보냄2 = store.CSV내보내기(os.path.join(임시, "data", "응답"))
맵2 = {g["코드"]: g for g in 내보냄2["게임"]}
헤더4, 행4 = 자동읽기(맵2["G04"]["경로"])
응답4, 매핑4 = 파싱(헤더4, 행4, C.게임찾기("G04"))
eq("G04 열 수", len(헤더4), 30)
eq("G04 공통 문항 누락 0", len(매핑4["누락"]), 0)
eq("G04 고유 문항 7개", len(매핑4["고유"]), 7)
명부적용(응답4, {})
A4 = 게임집계(응답4, C.게임찾기("G04"))
선형 = [x for x in A4["문항집계"] if x["유형"] == "선형배율"]
eq("G04 선형배율 문항 2개로 잡힌다", len(선형), 2)
eq("선형배율 평균이 계산된다", 선형[0]["통계"]["평균"] is not None, True)

shutil.rmtree(임시, ignore_errors=True)

print("\n" + "═" * 74)
print(f"  통과 {통과} · 실패 {실패}")
for s in 실패목록:
    print("  · " + s)
print("═" * 74)
sys.exit(1 if 실패 else 0)
