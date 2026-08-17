# -*- coding: utf-8 -*-
"""플레이테스트 리포트 생성기 — 진입점

  python run.py --dummy            더미 응답을 만들고 전체를 생성한다
  python run.py                    data/ 의 CSV 를 읽어 전체를 생성한다
  python run.py --game G01         한 게임만
  python run.py --cards-only       카드만
  python run.py --reports-only     리포트만

입력   data/응답/*.csv   구글 폼 시트나 데스크탑 앱이 내보낸 응답
                        (파일명 앞 두 자리가 폼 번호)
       data/명부.csv     이름 · ID · 유형 · 비고
출력   out/<게임명>/      개별 카드 · 종합 리포트 · 담당자 체크리스트

생성() 은 데스크탑 앱(app/api.py)도 부른다. 그래서 print 를 직접 하지 않고
말하기 · 진행 콜백으로 뺐다.
"""
import argparse
import csv
import glob
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from py import card, charts, checklist, config as C, diagrams as D, report
# dummy 는 참조/survey_data.py 를 읽는다. --dummy 를 쓸 때만 불러온다.
# (exe 로 묶으면 참조/ 가 없어서 앱 시작이 통째로 막힌다)
from py.aggregate import 게임집계
from py.ingest import 이름키, 명부적용, 자동읽기, 파싱

def _루트():
    """입력과 산출물을 놓는 곳.

    exe(onedir) 로 묶으면 이 파일은 실행 파일 옆 _internal 안으로 들어간다.
    그때 __file__ 을 쓰면 응답도 문서도 그 안을 가리켜, 담당자는 out 폴더를
    찾을 수 없다. 묶였을 때는 실행 파일 옆을 쓴다.

    app/settings.py 의 앱폴더() 와 같은 기준이어야 한다. 어긋나면 CSV 를 쓰는
    곳과 읽는 곳이 갈려 아무 말 없이 문서 0건이 된다 (2026-08-17 에 그랬다).
    test_paths.py 가 둘이 같은지 본다.
    """
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


ROOT = _루트()
DATA = os.path.join(ROOT, "data")
응답폴더 = os.path.join(DATA, "응답")
명부경로 = os.path.join(DATA, "명부.csv")
OUT = os.path.join(ROOT, "out")
차트폴더 = os.path.join(OUT, "_charts")

_폼번호 = {"G01": "01", "G02": "02", "G03": "03", "G04": "04", "G05": "05"}


# ── 명부 ─────────────────────────────────────────────────────────────────

def 명부읽기():
    명부 = {}
    if not os.path.exists(명부경로):
        return 명부
    with open(명부경로, encoding="utf-8-sig", newline="") as fp:
        for row in csv.DictReader(fp):
            이름 = (row.get("이름") or "").strip()
            if not 이름:
                continue
            명부[이름키(이름)] = dict(이름=이름, ID=(row.get("ID") or "").strip(),
                                      유형=(row.get("유형") or "").strip() or C.응답자["기본유형"])
    return 명부


def 명부쓰기(명부):
    os.makedirs(os.path.dirname(명부경로), exist_ok=True)
    with open(명부경로, "w", encoding="utf-8-sig", newline="") as fp:
        w = csv.writer(fp)
        w.writerow(["이름", "ID", "유형", "비고"])
        for v in sorted(명부.values(), key=lambda d: d["ID"]):
            w.writerow([v["이름"], v["ID"], v["유형"],
                        "응답에서 자동 등록 — 유형을 확인해 주세요"
                        if v["유형"] == C.응답자["미상유형"] else ""])


def 응답파일찾기(코드):
    번호 = _폼번호[코드]
    for p in sorted(glob.glob(os.path.join(응답폴더, "*"))):
        이름 = os.path.basename(p)
        if 이름.startswith(번호 + "_") and 이름.lower().endswith((".csv", ".xlsx")):
            return p
    return None


def 안전이름(s):
    return s.replace("/", "／").replace(":", "：").replace("\\", "＼")


# ── 생성 본체 ────────────────────────────────────────────────────────────

def 생성(게임코드=None, 카드만=False, 리포트만=False, 진행=None, 말하기=None):
    """문서를 만든다. CLI 와 데스크탑 앱이 함께 쓴다.

    게임코드 — 하나만 만들 때. None 이면 전부
    진행     — 진행 상황 문자열을 받는 콜백 (앱이 화면에 띄운다)
    말하기   — 로그 출력 함수. None 이면 조용히 돈다
    @return  요약 dict
    """
    말 = 말하기 or (lambda *a, **k: None)
    알림 = 진행 or (lambda s: None)

    t0 = time.time()
    잠긴파일 = []

    def 저장시도(만들기, 경로, *args):
        """Word 로 열어 둔 파일은 덮어쓸 수 없다. 죽이지 말고 건너뛰고 모아서 알린다."""
        try:
            만들기(*args)
            return True
        except PermissionError:
            잠긴파일.append(경로)
            return False

    os.makedirs(차트폴더, exist_ok=True)
    명부 = 명부읽기()
    말(f"\n명부 {len(명부)}명 로드")

    게임들 = [g for g in C.GAMES if (not 게임코드 or g["코드"] == 게임코드)]
    요약, 총문서 = [], 0

    for 순번, 게임 in enumerate(게임들, 1):
        알림(f'{게임["게임명"]} — {순번}/{len(게임들)}')
        경로 = 응답파일찾기(게임["코드"])
        말(f'\n── {게임["코드"]} {게임["게임명"]} ' + "─" * max(0, 44 - len(게임["게임명"])))
        if not 경로:
            말(f"  응답 파일이 없다 ({응답폴더}/{_폼번호[게임['코드']]}_*.csv) — 건너뛴다")
            요약.append(dict(게임=게임, 응답=0, 카드=0, 리포트=0, 집계=None,
                             경고=["응답 파일 없음"]))
            continue

        헤더, 행들 = 자동읽기(경로)
        응답, 맵 = 파싱(헤더, 행들, 게임)
        경고 = []
        if 맵["누락"]:
            경고.append("못 찾은 공통 문항: " + ", ".join(맵["누락"]))
        if 맵["중복"]:
            경고.append("중복 매핑: " + ", ".join(맵["중복"]))
        for w in 경고:
            말(f"  [경고] {w}")

        새로 = 명부적용(응답, 명부)
        if 새로:
            말(f'  명부에 없던 응답자 {len(새로)}명을 자동 등록했다 '
              f'({", ".join(v["ID"] for v in 새로)})')

        A = 게임집계(응답, 게임)
        지표 = A["지표"]
        말(f'  {os.path.basename(경로)} — {len(헤더)}열 · 응답 {지표["N"]}명 · '
          f'고유 문항 {len(맵["고유"])}개')
        if 지표["N"]:
            말(f'  6축 평균 {지표["육각총평균"]:.2f} · NPS {지표["NPS"]["값"]} · '
              f'진행도 정체 {지표["진행도정체"]["비율"]}% · 플래그 {len(A["플래그"])}개')

        폴더 = os.path.join(OUT, 안전이름(게임["게임명"]))
        os.makedirs(폴더, exist_ok=True)
        카드수 = 리포트수 = 0

        if not 리포트만 and 지표["N"]:
            카드폴더 = os.path.join(폴더, "개별카드")
            os.makedirs(카드폴더, exist_ok=True)
            평균 = [a["평균"] for a in 지표["육각"]]
            평균8 = 평균 + [a["평균"] for a in 지표["추가"]]
            항목명 = [이름 for _, 이름 in C.육각축] + [이름 for _, 이름 in C.추가축]
            for i, r in enumerate(A["응답"], 1):
                알림(f'{게임["게임명"]} — 개별 카드 {i}/{지표["N"]}')
                기본 = os.path.join(차트폴더, f'{게임["코드"]}_{r.ID}')
                차트 = charts.레이더_개인(r.육각, 평균, 기본 + ".png", r.ID)
                편차 = D.편차_막대(항목명, [*r.육각, r.진행흐름, r.기술안정성], 평균8,
                                   기본 + "_dev.png", r.ID)
                띠 = D.위치_띠(C.진행도순서, r.진행도, r.추천의향, 기본 + "_pos.png")
                경로K = os.path.join(카드폴더, card.파일명(게임, r))
                if 저장시도(card.만들기, 경로K, r, A, 경로K, 차트, 편차, 띠):
                    카드수 += 1
            말(f"  개별 카드 {카드수}건 → {os.path.relpath(카드폴더, ROOT)}")

        if not 카드만 and not 지표["N"]:
            # 응답 0건으로도 문서는 만들어진다. 표와 그림이 비어 있을 뿐이다.
            # 그럴듯한 빈 리포트는 경고보다 나쁘다 — 담당자가 응답이 들어온 줄 안다.
            말("  응답이 0건이다 — 리포트를 만들지 않는다")
            경고.append("응답 0건 — 리포트를 만들지 않았다")

        elif not 카드만:
            알림(f'{게임["게임명"]} — 종합 리포트')
            경로R = os.path.join(폴더, report.파일명(게임))
            if 저장시도(report.만들기, 경로R, A, 경로R, 차트폴더):
                리포트수 = 1
                말(f"  종합 리포트 1건 → {os.path.relpath(경로R, ROOT)} "
                  f"({os.path.getsize(경로R)/1024:.0f} KB)")
            else:
                말("  [건너뜀] 종합 리포트 — 다른 프로그램이 열고 있다")
            경로C = os.path.join(폴더, checklist.파일명())
            checklist.만들기(A, 경로C, report.파일명(게임), 카드수)
            말(f"  담당자 체크리스트 → {os.path.relpath(경로C, ROOT)}")

        총문서 += 카드수 + 리포트수
        요약.append(dict(게임=게임, 응답=지표["N"], 카드=카드수, 리포트=리포트수,
                         집계=A, 경고=경고))

    명부쓰기(명부)
    알림("끝")

    return {
        "총문서": 총문서,
        "초": round(time.time() - t0, 1),
        # 문서가 0건일 때 "어디를 봤는지" 를 화면에 띄우기 위해 함께 돌려준다
        "입력폴더": 응답폴더,
        "출력폴더": OUT,
        "잠긴파일": [os.path.relpath(f, ROOT) for f in 잠긴파일],
        "게임": [
            {
                "코드": r["게임"]["코드"],
                "게임명": r["게임"]["게임명"],
                "응답": r["응답"],
                "카드": r["카드"],
                "리포트": r["리포트"],
                "6축": r["집계"]["지표"]["육각총평균"] if (r["집계"] and r["응답"]) else None,
                "NPS": r["집계"]["지표"]["NPS"]["값"] if (r["집계"] and r["응답"]) else None,
                "플래그": len(r["집계"]["플래그"]) if r["집계"] else 0,
                "경고": r.get("경고") or [],
            }
            for r in 요약
        ],
    }


# ── CLI ──────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dummy", action="store_true", help="더미 응답을 새로 만든다")
    ap.add_argument("--game", help="게임 코드 하나만 (G01~G05)")
    ap.add_argument("--cards-only", action="store_true")
    ap.add_argument("--reports-only", action="store_true")
    ap.add_argument("--인원", type=int, default=16)
    args = ap.parse_args()

    print("=" * 76)
    print("  플레이테스트 리포트 생성기")
    print("=" * 76)

    if args.dummy:
        from py import dummy
        만든것 = dummy.전체생성(응답폴더, args.인원)
        dummy.명부생성(명부경로, args.인원)
        print(f"\n더미 응답 생성 — {응답폴더}")
        for 번호, 게임, 경로, 열, 행 in 만든것:
            print(f"  {번호}  {게임[:24]:<26} {열:>2}열 × {행}명   {os.path.basename(경로)}")
        print(f"  명부 {args.인원}명 — {os.path.basename(명부경로)}")

    R = 생성(게임코드=args.game, 카드만=args.cards_only,
             리포트만=args.reports_only, 말하기=print)

    print("\n" + "=" * 76)
    print(f'  {"게임":<24}{"응답":>5}{"카드":>6}{"리포트":>7}{"6축":>7}{"NPS":>6}{"플래그":>7}')
    print("  " + "-" * 72)
    for g in R["게임"]:
        if g["응답"]:
            print(f'  {g["게임명"][:22]:<24}{g["응답"]:>5}{g["카드"]:>6}{g["리포트"]:>7}'
                  f'{g["6축"]:>7.2f}{g["NPS"]:>6}{g["플래그"]:>7}')
        else:
            print(f'  {g["게임명"][:22]:<24}{g["응답"]:>5}{g["카드"]:>6}{g["리포트"]:>7}'
                  f'{"-":>7}{"-":>6}{"-":>7}')
    print("  " + "-" * 72)
    print(f'  문서 {R["총문서"]}건 · {R["초"]}초 · 출력 {os.path.relpath(OUT, ROOT)}/')
    print("=" * 76)

    if R["잠긴파일"]:
        print("")
        print(f'  [주의] 다른 프로그램(대개 Word)이 열고 있어 덮어쓰지 못한 파일 {len(R["잠긴파일"])}건')
        for f in R["잠긴파일"][:10]:
            print(f"    {f}")
        if len(R["잠긴파일"]) > 10:
            print(f'    외 {len(R["잠긴파일"]) - 10}건')
        print("  해당 문서를 닫고 다시 실행하면 갱신된다.")


if __name__ == "__main__":
    main()
