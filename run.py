# -*- coding: utf-8 -*-
"""플레이테스트 리포트 생성기 — 진입점

  python run.py --dummy            더미 응답을 만들고 전체를 생성한다
  python run.py                    data/ 의 CSV 를 읽어 전체를 생성한다
  python run.py --game G01         한 게임만
  python run.py --cards-only       카드만
  python run.py --reports-only     리포트만

입력   data/응답/*.csv   구글 시트에서 내려받은 응답 (파일명 앞 두 자리가 폼 번호)
       data/명부.csv     이름 · ID · 유형 · 비고
출력   out/<게임명>/      개별 카드 · 종합 리포트
"""
import argparse
import csv
import glob
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from py import card, charts, checklist, config as C, diagrams as D, dummy, report
from py.aggregate import 게임집계
from py.ingest import 이름키, 명부적용, 자동읽기, 파싱

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
응답폴더 = os.path.join(DATA, "응답")
명부경로 = os.path.join(DATA, "명부.csv")
OUT = os.path.join(ROOT, "out")
차트폴더 = os.path.join(OUT, "_charts")

_폼번호 = {"G01": "01", "G02": "02", "G03": "03", "G04": "04", "G05": "05"}


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


잠긴파일 = []


def 저장시도(만들기, 경로, *args):
    """Word 로 열어 둔 파일은 덮어쓸 수 없다. 죽이지 말고 건너뛰고 모아서 알린다."""
    try:
        만들기(*args)
        return True
    except PermissionError:
        잠긴파일.append(경로)
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dummy", action="store_true", help="더미 응답을 새로 만든다")
    ap.add_argument("--game", help="게임 코드 하나만 (G01~G05)")
    ap.add_argument("--cards-only", action="store_true")
    ap.add_argument("--reports-only", action="store_true")
    ap.add_argument("--인원", type=int, default=16)
    args = ap.parse_args()

    t0 = time.time()
    print("=" * 76)
    print("  플레이테스트 리포트 생성기")
    print("=" * 76)

    if args.dummy:
        만든것 = dummy.전체생성(응답폴더, args.인원)
        dummy.명부생성(명부경로, args.인원)
        print(f"\n더미 응답 생성 — {응답폴더}")
        for 번호, 게임, 경로, 열, 행 in 만든것:
            print(f"  {번호}  {게임[:24]:<26} {열:>2}열 × {행}명   {os.path.basename(경로)}")
        print(f"  명부 {args.인원}명 — {os.path.basename(명부경로)}")

    os.makedirs(차트폴더, exist_ok=True)
    명부 = 명부읽기()
    print(f"\n명부 {len(명부)}명 로드")

    게임들 = [g for g in C.GAMES if (not args.game or g["코드"] == args.game)]
    요약, 총문서 = [], 0

    for 게임 in 게임들:
        경로 = 응답파일찾기(게임["코드"])
        print(f'\n── {게임["코드"]} {게임["게임명"]} ' + "─" * max(0, 44 - len(게임["게임명"])))
        if not 경로:
            print(f"  응답 파일이 없습니다 ({응답폴더}/{_폼번호[게임['코드']]}_*.csv) — 건너뜁니다")
            요약.append((게임, 0, 0, 0, None))
            continue

        헤더, 행들 = 자동읽기(경로)
        응답, 맵 = 파싱(헤더, 행들, 게임)
        if 맵["누락"]:
            print(f'  [경고] 못 찾은 공통 문항: {", ".join(맵["누락"])}')
        if 맵["중복"]:
            print(f'  [경고] 중복 매핑: {", ".join(맵["중복"])}')
        새로 = 명부적용(응답, 명부)
        if 새로:
            print(f'  명부에 없던 응답자 {len(새로)}명을 자동 등록했습니다 '
                  f'({", ".join(v["ID"] for v in 새로)}) — 유형을 확인해 주세요')

        A = 게임집계(응답, 게임)
        지표 = A["지표"]
        print(f'  {os.path.basename(경로)} — {len(헤더)}열 · 응답 {지표["N"]}명 · 고유 문항 {len(맵["고유"])}개')
        if 지표["N"]:
            print(f'  6축 평균 {지표["육각총평균"]:.2f} · NPS {지표["NPS"]["값"]} · '
                  f'진행도 정체 {지표["진행도정체"]["비율"]}% · 플래그 {len(A["플래그"])}개'
                  f' (Critical {sum(1 for f in A["플래그"] if f["심각도"]=="Critical")} · '
                  f'High {sum(1 for f in A["플래그"] if f["심각도"]=="High")})')

        폴더 = os.path.join(OUT, 안전이름(게임["게임명"]))
        os.makedirs(폴더, exist_ok=True)
        카드수 = 리포트수 = 0

        if not args.reports_only and 지표["N"]:
            카드폴더 = os.path.join(폴더, "개별카드")
            os.makedirs(카드폴더, exist_ok=True)
            평균 = [a["평균"] for a in 지표["육각"]]
            평균8 = 평균 + [a["평균"] for a in 지표["추가"]]
            항목명 = [이름 for _, 이름 in C.육각축] + [이름 for _, 이름 in C.추가축]
            for r in A["응답"]:
                기본 = os.path.join(차트폴더, f'{게임["코드"]}_{r.ID}')
                차트 = charts.레이더_개인(r.육각, 평균, 기본 + ".png", r.ID)
                편차 = D.편차_막대(항목명, [*r.육각, r.진행흐름, r.기술안정성], 평균8,
                                   기본 + "_dev.png", r.ID)
                띠 = D.위치_띠(C.진행도순서, r.진행도, r.추천의향, 기본 + "_pos.png")
                경로K = os.path.join(카드폴더, card.파일명(게임, r))
                if 저장시도(card.만들기, 경로K, r, A, 경로K, 차트, 편차, 띠):
                    카드수 += 1
            print(f"  개별 카드 {카드수}건 → {os.path.relpath(카드폴더, ROOT)}")

        if not args.cards_only:
            경로R = os.path.join(폴더, report.파일명(게임))
            if 저장시도(report.만들기, 경로R, A, 경로R, 차트폴더):
                리포트수 = 1
                크기 = os.path.getsize(경로R) / 1024
                print(f"  종합 리포트 1건 → {os.path.relpath(경로R, ROOT)}  ({크기:.0f} KB)")
            else:
                print(f"  [건너뜀] 종합 리포트 — 다른 프로그램이 열고 있다")
            경로C = os.path.join(폴더, checklist.파일명())
            checklist.만들기(A, 경로C, report.파일명(게임), 카드수)
            print(f"  담당자 체크리스트 → {os.path.relpath(경로C, ROOT)}")

        총문서 += 카드수 + 리포트수
        요약.append((게임, 지표["N"], 카드수, 리포트수, A))

    명부쓰기(명부)

    print("\n" + "=" * 76)
    print(f'  {"게임":<24}{"응답":>5}{"카드":>6}{"리포트":>7}{"6축":>7}{"NPS":>6}{"플래그":>7}')
    print("  " + "-" * 72)
    for 게임, n, c, r, A in 요약:
        if A and A["지표"]["N"]:
            m = A["지표"]
            print(f'  {게임["게임명"][:22]:<24}{n:>5}{c:>6}{r:>7}'
                  f'{m["육각총평균"]:>7.2f}{m["NPS"]["값"]:>6}{len(A["플래그"]):>7}')
        else:
            print(f'  {게임["게임명"][:22]:<24}{n:>5}{c:>6}{r:>7}{"-":>7}{"-":>6}{"-":>7}')
    print("  " + "-" * 72)
    print(f"  문서 {총문서}건 · {time.time() - t0:.1f}초 · 출력 {os.path.relpath(OUT, ROOT)}/")
    print("=" * 76)
    if 잠긴파일:
        print("")
        print(f"  [주의] 다른 프로그램(대개 Word)이 열고 있어 덮어쓰지 못한 파일 {len(잠긴파일)}건")
        for f in 잠긴파일[:10]:
            print(f"    {os.path.relpath(f, ROOT)}")
        if len(잠긴파일) > 10:
            print(f"    외 {len(잠긴파일) - 10}건")
        print("  해당 문서를 닫고 다시 실행하면 갱신된다.")


if __name__ == "__main__":
    main()
