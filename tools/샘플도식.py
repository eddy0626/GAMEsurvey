# -*- coding: utf-8 -*-
"""새 도식 8종을 실제 집계 데이터로 렌더해 out/_샘플/ 에 저장한다."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from py import config as C, diagrams as D          # noqa: E402
from py.ingest import 정규화 as _N                  # noqa: E402
from py.aggregate import 게임집계                    # noqa: E402
from py.ingest import 명부적용, 이름키, 자동읽기, 파싱  # noqa: E402

폴더 = os.path.join(ROOT, "out", "_샘플")
os.makedirs(폴더, exist_ok=True)


def 집계하기(코드, 파일):
    게임 = C.게임찾기(코드)
    헤더, 행들 = 자동읽기(os.path.join(ROOT, "data", "응답", 파일))
    응답, _ = 파싱(헤더, 행들, 게임)
    명부적용(응답, {})
    return 게임집계(응답, 게임)


A = 집계하기("G01", "01_미스트월드.csv")
G4 = 집계하기("G04", "04_어센디아(ASCENDIA).csv")
지표 = A["지표"]
N = 지표["N"]

만든것 = []
만든것.append(D.스택_NPS(지표["NPS"], os.path.join(폴더, "1_NPS스택.png")))
만든것.append(D.막대_가격(지표["적정가격"], C.가격구간, os.path.join(폴더, "2_가격.png"), N))
만든것.append(D.세그먼트_비교(A["세그먼트"]["장르"], os.path.join(폴더, "3_세그_장르.png"),
                              "장르 선호에 따른 분화"))
만든것.append(D.세그먼트_비교(A["세그먼트"]["튜토리얼"]["행"],
                              os.path.join(폴더, "4_세그_튜토리얼.png"),
                              "튜토리얼 이해도에 따른 분화"))

항목명 = [n for _, n in C.육각축] + [n for _, n in C.추가축]
IDs = [r.ID for r in A["응답"]]
행렬 = [[*r.육각, r.진행흐름, r.기술안정성] for r in A["응답"]]
만든것.append(D.히트맵_응답자(IDs, 항목명, 행렬, os.path.join(폴더, "5_히트맵.png")))

부정G1 = {_N(k): v for k, v in C.게임_부정선택지["G01"].items()}
부정G1.update({"스팀 구매 의향": C.공통_부정선택지["구매의향"],
               "진행도": C.공통_부정선택지["진행도"]})
만든것.append(D.스택_문항모음(A["문항집계"], os.path.join(폴더, "6_문항스택.png"), N, 부정G1))
만든것.append(D.막대_플래그(A["플래그"], os.path.join(폴더, "7_플래그.png")))

r = A["응답"][4]
평균 = [a["평균"] for a in 지표["육각"]] + [a["평균"] for a in 지표["추가"]]
내점수 = [*r.육각, r.진행흐름, r.기술안정성]
만든것.append(D.편차_막대(항목명, 내점수, 평균, os.path.join(폴더, "8_편차.png"), r.ID))
만든것.append(D.위치_띠(C.진행도순서, r.진행도, r.추천의향, os.path.join(폴더, "9_위치띠.png")))

# 어센디아는 고유 선형배율 · 체크박스가 있어 문항 스택이 다르게 나온다
부정G4 = {_N(k): v for k, v in C.게임_부정선택지["G04"].items()}
부정G4.update({"스팀 구매 의향": C.공통_부정선택지["구매의향"],
               "진행도": C.공통_부정선택지["진행도"]})
만든것.append(D.스택_문항모음(G4["문항집계"], os.path.join(폴더, "10_문항스택_어센디아.png"),
                              G4["지표"]["N"], 부정G4, 제목="어센디아 문항별 응답 분포 (n=16)"))

for p in 만든것:
    if p:
        print(f"  {os.path.basename(p):<28} {os.path.getsize(p)//1024:>4} KB")
print(f"\n{len([p for p in 만든것 if p])}종 → {os.path.relpath(폴더, ROOT)}")
