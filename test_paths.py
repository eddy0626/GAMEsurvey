# -*- coding: utf-8 -*-
"""입력 · 출력 폴더가 어디에 잡히는지 검증

2026-08-17 사고 — exe 로 묶어서 돌리니 문서가 0건 나왔다.
CSV 를 쓰는 쪽(app/store.py)은 실행 파일 옆 data\\응답 에 썼는데,
읽는 쪽(run.py)은 _internal\\data\\응답 을 봤다. onedir 로 묶으면 run.py 가
_internal 안에 들어가서 __file__ 이 그곳을 가리키기 때문이다.
쓰는 곳과 읽는 곳이 갈리면 조용히 0건이 된다. 그것을 여기서 막는다.

    python -X utf8 test_paths.py
"""
import importlib
import os
import shutil
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

from app import settings                                          # noqa: E402

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
    print(f"  {'OK ' if ok else 'NG '} {라벨:<46} {str(실제)[:40]:>42}")


def 절(t):
    print(f"\n── {t} " + "─" * max(0, 56 - len(t)))


def run불러오기():
    """sys.frozen 을 바꾼 뒤 run.py 의 경로 상수를 다시 계산하게 한다"""
    import run
    return importlib.reload(run)


원래frozen = getattr(sys, "frozen", None)
원래exe = sys.executable

print("=" * 74)
print("  입력 · 출력 폴더 검증")
print("=" * 74)

# ── 0. 소스에서 그냥 실행할 때 ───────────────────────────────────────────
절("0. 소스에서 실행 (python run.py)")
if hasattr(sys, "frozen"):
    del sys.frozen
run = run불러오기()
eq("ROOT 은 저장소 루트", run.ROOT, ROOT)
eq("settings 와 같은 기준", run.ROOT, settings.앱폴더())

# ── 1. exe(onedir) 로 묶은 상태 ──────────────────────────────────────────
절("1. 묶인 상태 — 산출물은 실행 파일 옆이어야 한다")
가짜 = tempfile.mkdtemp(prefix="묶인상태_")
os.makedirs(os.path.join(가짜, "_internal"), exist_ok=True)
sys.frozen = True                                                 # noqa: B010
sys.executable = os.path.join(가짜, "플레이테스트설문.exe")
run = run불러오기()

eq("ROOT 은 실행 파일 옆", run.ROOT, 가짜)
eq("_internal 안이 아니다", "_internal" in run.ROOT, False)
eq("data 폴더", run.DATA, os.path.join(가짜, "data"))
eq("응답 폴더", run.응답폴더, os.path.join(가짜, "data", "응답"))
eq("명부 경로", run.명부경로, os.path.join(가짜, "data", "명부.csv"))
eq("out 폴더", run.OUT, os.path.join(가짜, "out"))
# 이것이 이번 사고의 핵심 — 쓰는 쪽과 읽는 쪽이 같은 곳을 봐야 한다
eq("CSV 를 쓰는 곳과 읽는 곳이 같다",
   os.path.join(settings.앱폴더(), "data", "응답"), run.응답폴더)

# ── 2. 실제 응답으로 끝까지 ──────────────────────────────────────────────
절("2. 묶인 상태에서 문서가 실제로 나오는가")
from py import dummy                                              # noqa: E402

os.makedirs(run.응답폴더, exist_ok=True)
dummy.전체생성(run.응답폴더, 3)
dummy.명부생성(run.명부경로, 3)
eq("더미 CSV 5개", len([f for f in os.listdir(run.응답폴더) if f.endswith(".csv")]), 5)
eq("응답 파일을 찾는다", run.응답파일찾기("G01") is not None, True)

R = run.생성(게임코드="G01")
eq("출력 폴더가 실행 파일 옆", R["출력폴더"], run.OUT)
eq("찾아본 입력 폴더도 알려준다", R["입력폴더"], run.응답폴더)
eq("_internal 로 안 샌다", "_internal" in R["출력폴더"], False)
eq("응답 3건을 읽었다", R["게임"][0]["응답"], 3)
eq("개별 카드 3건", R["게임"][0]["카드"], 3)
eq("종합 리포트 1건", R["게임"][0]["리포트"], 1)
eq("문서 4건", R["총문서"], 4)

만든것 = []
for 뿌리, _, 파일들 in os.walk(run.OUT):
    만든것 += [f for f in 파일들 if f.endswith(".docx")]
eq("docx 파일이 디스크에 있다", len(만든것), 4)
eq("잠긴 파일 없음", len(R["잠긴파일"]), 0)

# ── 2b. 파일은 있는데 응답이 0건일 때 ────────────────────────────────────
절("2b. 헤더만 있는 CSV — 빈 리포트를 만들면 안 된다")
빈csv = run.응답파일찾기("G02")
with open(빈csv, encoding="utf-8-sig", newline="") as fp:
    첫줄 = fp.readline()
with open(빈csv, "w", encoding="utf-8-sig", newline="") as fp:
    fp.write(첫줄)                                                 # 헤더만 남긴다

R2 = run.생성(게임코드="G02")
eq("응답 0건으로 읽는다", R2["게임"][0]["응답"], 0)
eq("리포트를 만들지 않는다", R2["게임"][0]["리포트"], 0)
eq("문서 0건", R2["총문서"], 0)
eq("경고를 남긴다", any("0건" in w for w in R2["게임"][0]["경고"]), True)

# ── 3. 원상복구 ─────────────────────────────────────────────────────────
절("3. frozen 을 풀면 다시 저장소 루트")
if 원래frozen is None:
    del sys.frozen
else:
    sys.frozen = 원래frozen                                        # noqa: B010
sys.executable = 원래exe
run = run불러오기()
eq("ROOT 복구", run.ROOT, ROOT)

shutil.rmtree(가짜, ignore_errors=True)

print("\n" + "=" * 74)
print(f"  통과 {통과} · 실패 {실패}")
for m in 실패목록:
    print("   NG " + m)
print("=" * 74)
sys.exit(1 if 실패 else 0)
