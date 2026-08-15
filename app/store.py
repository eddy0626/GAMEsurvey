# -*- coding: utf-8 -*-
"""응답 저장 · 읽기 · 합치기 · CSV 내보내기

응답 한 건을 파일 하나로 남긴다.
  앱데이터/응답/G01_20260820_143012_P05.json

파일 하나에 한 건이라 USB 로 모을 때 복사만 하면 되고,
같은 사람이 두 번 제출해도 둘 다 남아 나중에 골라낼 수 있다.

CSV 로 내보낼 때는 구글 폼 응답 시트와 형식을 맞춘다.
헤더도 '1. 이름을 적어 주세요.' 처럼 번호 접두사까지 그대로다.
그래야 기존 py/ 파이프라인을 한 줄도 고치지 않고 쓴다.
"""
import csv
import hashlib
import json
import os
import re
import shutil
from datetime import datetime

from . import settings

앱버전 = "1.0"
_안전 = re.compile(r"[^0-9A-Za-z가-힣_]+")


# ── 설문 정의 ────────────────────────────────────────────────────────────

_설문캐시 = None


def 설문전체():
    global _설문캐시
    if _설문캐시 is None:
        경로 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web", "survey.json")
        with open(경로, encoding="utf-8") as fp:
            _설문캐시 = json.load(fp)
    return _설문캐시


def 폼(게임코드):
    for f in 설문전체()["폼"]:
        if f["코드"] == 게임코드:
            return f
    return None


def 게임목록():
    return [{"코드": f["코드"], "게임명": f["게임명"], "개발사": f["개발사"],
             "문항수": f["문항수"]} for f in 설문전체()["폼"]]


# ── 명부 ─────────────────────────────────────────────────────────────────

def 명부경로():
    return os.path.join(settings.데이터폴더(), "명부.csv")


def 명부():
    """[{이름, ID, 유형}] — 없으면 빈 목록"""
    경로 = 명부경로()
    if not os.path.exists(경로):
        return []
    out = []
    try:
        with open(경로, encoding="utf-8-sig", newline="") as fp:
            for row in csv.DictReader(fp):
                이름 = (row.get("이름") or "").strip()
                if 이름:
                    out.append({"이름": 이름,
                                "ID": (row.get("ID") or "").strip(),
                                "유형": (row.get("유형") or "").strip() or "교육생"})
    except OSError:
        return []
    return out


# ── 응답 파일 ────────────────────────────────────────────────────────────

def _파일명(게임코드, 시각, ID, 이름):
    꼬리 = _안전.sub("", ID or 이름 or "익명")[:12] or "익명"
    return f'{게임코드}_{시각.strftime("%Y%m%d_%H%M%S")}_{꼬리}.json'


def 저장(응답):
    """응답 한 건을 파일로. 저장된 파일명을 돌려준다."""
    이제 = datetime.now()
    응답 = dict(응답)
    응답.setdefault("게임코드", settings.읽기()["게임코드"])
    응답["제출시각"] = 이제.strftime("%Y-%m-%d %H:%M:%S")
    응답["앱버전"] = 앱버전

    이름 = _파일명(응답["게임코드"], 이제, 응답.get("ID"), 응답.get("이름"))
    경로 = os.path.join(settings.응답폴더(), 이름)
    with open(경로, "w", encoding="utf-8") as fp:
        json.dump(응답, fp, ensure_ascii=False, indent=1)
    return 이름


def 목록(게임코드=None, 최근순=False):
    """저장된 응답. 기본은 제출 순(오래된 것 먼저).

    파일명에 타임스탬프가 들어 있어 이름 순 = 제출 순이다.
    구글 폼 응답 시트도 오래된 것이 위에 있으므로 CSV 내보내기는 이 순서를 쓴다.
    현황 화면만 최근순=True 로 뒤집어 본다."""
    폴더 = settings.응답폴더()
    out = []
    for f in sorted(os.listdir(폴더), reverse=최근순):
        if not f.endswith(".json") or f.startswith("_"):
            continue
        try:
            with open(os.path.join(폴더, f), encoding="utf-8") as fp:
                d = json.load(fp)
        except (json.JSONDecodeError, OSError):
            out.append({"파일": f, "오류": "파일을 읽을 수 없다"})
            continue
        if 게임코드 and d.get("게임코드") != 게임코드:
            continue
        out.append({"파일": f, "게임코드": d.get("게임코드"), "ID": d.get("ID"),
                    "이름": d.get("이름"), "유형": d.get("유형"),
                    "제출시각": d.get("제출시각"), "답수": len(d.get("답") or {})})
    return out


def 읽기(파일명):
    with open(os.path.join(settings.응답폴더(), 파일명), encoding="utf-8") as fp:
        return json.load(fp)


def 삭제(파일명):
    경로 = os.path.join(settings.응답폴더(), 파일명)
    버림 = os.path.join(settings.데이터폴더(), "버린응답")
    os.makedirs(버림, exist_ok=True)
    shutil.move(경로, os.path.join(버림, 파일명))   # 지우지 않고 옮긴다
    return True


def 이미응답한사람(게임코드):
    return {d.get("ID") for d in 목록(게임코드) if d.get("ID")}


# ── 작성 중 임시 저장 ────────────────────────────────────────────────────

def _임시경로():
    return os.path.join(settings.응답폴더(), "_작성중.json")


def 임시저장(부분):
    with open(_임시경로(), "w", encoding="utf-8") as fp:
        json.dump(부분, fp, ensure_ascii=False)
    return True


def 임시불러오기():
    try:
        with open(_임시경로(), encoding="utf-8") as fp:
            return json.load(fp)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def 임시삭제():
    try:
        os.remove(_임시경로())
    except OSError:
        pass
    return True


# ── 합치기 ───────────────────────────────────────────────────────────────

def _해시(경로):
    with open(경로, "rb") as fp:
        return hashlib.sha256(fp.read()).hexdigest()


def 폴더합치기(가져올폴더):
    """USB 로 가져온 다른 PC 의 응답 폴더를 이 PC 로 복사한다.
    같은 파일명이면 내용이 같을 때 건너뛰고, 다르면 뒤에 _2 를 붙인다."""
    if not os.path.isdir(가져올폴더):
        return {"오류": f"폴더가 없다: {가져올폴더}"}

    대상 = settings.응답폴더()
    가져옴, 건너뜀, 이름바꿈, 실패 = 0, 0, 0, []
    for f in sorted(os.listdir(가져올폴더)):
        if not f.endswith(".json") or f.startswith("_"):
            continue
        원본 = os.path.join(가져올폴더, f)
        새경로 = os.path.join(대상, f)
        try:
            if os.path.exists(새경로):
                if _해시(원본) == _해시(새경로):
                    건너뜀 += 1
                    continue
                줄기, 확장 = os.path.splitext(f)
                n = 2
                while os.path.exists(os.path.join(대상, f"{줄기}_{n}{확장}")):
                    n += 1
                새경로 = os.path.join(대상, f"{줄기}_{n}{확장}")
                이름바꿈 += 1
            shutil.copy2(원본, 새경로)
            가져옴 += 1
        except OSError as e:
            실패.append(f"{f} — {e}")
    return {"가져옴": 가져옴, "건너뜀": 건너뜀, "이름바꿈": 이름바꿈, "실패": 실패}


# ── CSV 내보내기 ─────────────────────────────────────────────────────────

def _칸(값, 유형):
    """응답 값 → 구글 폼 시트의 한 칸"""
    if 값 is None or 값 == "":
        return ""
    if 유형 == "체크박스":
        return ", ".join(str(v) for v in 값) if isinstance(값, list) else str(값)
    if 유형 == "선형배율":
        return 값
    return str(값)


def CSV내보내기(내보낼폴더=None):
    """게임별로 구글 폼 응답 시트와 같은 형식의 CSV 를 만든다.
    기존 py/ 파이프라인이 그대로 읽는다."""
    내보낼폴더 = 내보낼폴더 or os.path.join(settings.앱폴더(), "data", "응답")
    os.makedirs(내보낼폴더, exist_ok=True)

    모든응답 = []
    for 정보 in 목록():
        if 정보.get("오류"):
            continue
        try:
            d = 읽기(정보["파일"])
            d["_파일"] = 정보["파일"]
            모든응답.append(d)
        except (json.JSONDecodeError, OSError):
            continue

    결과 = []
    for f in 설문전체()["폼"]:
        코드 = f["코드"]
        해당 = [r for r in 모든응답 if r.get("게임코드") == 코드]
        해당.sort(key=lambda r: (r.get("제출시각") or "", r.get("_파일") or ""))

        문항들 = [q for s in f["섹션"] for q in s["questions"]]
        헤더 = f["헤더"]
        행들 = []
        for r in 해당:
            답 = r.get("답") or {}
            행 = [r.get("제출시각", "")]
            for q in 문항들:
                행.append(_칸(답.get(q["id"]), q["type"]))
            행들.append(행)

        안전게임 = f["게임명"].replace("/", "／").replace(":", "：")
        경로 = os.path.join(내보낼폴더, f'{f["no"]}_{안전게임}.csv')
        with open(경로, "w", encoding="utf-8-sig", newline="") as fp:
            w = csv.writer(fp)
            w.writerow(헤더)
            w.writerows(행들)
        결과.append({"코드": 코드, "게임명": f["게임명"], "응답": len(행들),
                     "열": len(헤더), "경로": 경로})

    # 명부도 같이 내보낸다 — 파이프라인이 이름 → ID 대조에 쓴다
    명부목록 = 명부()
    if 명부목록:
        명부출력 = os.path.join(os.path.dirname(내보낼폴더), "명부.csv")
        with open(명부출력, "w", encoding="utf-8-sig", newline="") as fp:
            w = csv.writer(fp)
            w.writerow(["이름", "ID", "유형", "비고"])
            for p in 명부목록:
                w.writerow([p["이름"], p["ID"], p["유형"], ""])

    return {"폴더": 내보낼폴더, "게임": 결과,
            "총응답": sum(g["응답"] for g in 결과), "명부": len(명부목록)}
