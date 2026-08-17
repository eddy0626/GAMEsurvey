# -*- coding: utf-8 -*-
"""데스크탑 앱을 exe 로 묶는다 (PyInstaller)

하나만 만든다. 게임 PC 든 담당자 PC 든 같은 것을 깐다.

한때 현장용(응답만)과 담당자용(응답+문서)으로 나눴었다. 문서 생성
라이브러리가 90MB 를 차지해서였다. 하지만 어느 폴더를 어디에 깔아야
하는지 헷갈리는 값이 90MB 보다 비싸다. 하나로 합쳤다.

onedir 로 묶는다. onefile 은 실행할 때마다 임시 폴더에 풀어서
시작에 10초씩 걸린다. 현장에서 쓸 물건으로는 맞지 않는다.

    python -X utf8 tools/build_app.py           묶는다
    python -X utf8 tools/build_app.py --콘솔     오류를 보려고 콘솔판으로
    python -X utf8 tools/build_app.py --정리     찌꺼기 지우기
"""
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
빌드 = os.path.join(ROOT, "빌드")
이름 = "플레이테스트설문"

# 뺄 것. 앱에서 안 쓴다.
# unittest 는 빼면 안 된다. matplotlib/__init__.py 가 그것을 임포트한다.
# (뺐다가 [리포트 만들기] 를 누르는 순간에야 터졌다 — 자가검사가 잡았다)
제외 = ["tkinter", "test", "pydoc_data", "pytest", "setuptools", "pip"]

# 문서 생성 모듈. --add-data 로 넣으면 파일로만 들어가서 import 가 안 된다.
# 반드시 hidden-import 로 넣어야 한다.
# py.dummy 는 뺀다. 참조/survey_data.py 를 읽는데 exe 옆에는 그 폴더가 없다.
문서모듈 = ["run", "py", "py.config", "py.ingest", "py.aggregate", "py.charts",
            "py.diagrams", "py.docxkit", "py.report", "py.card", "py.checklist",
            "py.kor"]

추가모듈 = ["matplotlib", "matplotlib.backends.backend_agg", "docx", "openpyxl",
            "clr", "webview.platforms.winforms",
            "app", "app.api", "app.store", "app.settings"] + 문서모듈


def 정리():
    for d in ("build", "빌드"):
        p = os.path.join(ROOT, d)
        if os.path.isdir(p):
            shutil.rmtree(p, ignore_errors=True)
            print("  지움:", d)
    for f in os.listdir(ROOT):
        if f.endswith(".spec"):
            os.remove(os.path.join(ROOT, f))
            print("  지움:", f)


def 묶기(콘솔=False):
    붙인이름 = 이름 + ("_콘솔" if 콘솔 else "")
    print("\n" + "═" * 70)
    print(f"  {붙인이름} 묶는 중 — 응답 수집 + 문서 생성")
    print("═" * 70)

    명령 = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm", "--clean",
        "--name", 붙인이름,
        "--console" if 콘솔 else "--windowed",
        "--onedir",
        "--distpath", 빌드,
        "--workpath", os.path.join(ROOT, "build"),
        "--specpath", os.path.join(ROOT, "build"),
        "--paths", ROOT,
        # 화면 파일(HTML · CSS · JS · survey.json)은 코드가 아니라 자료다
        "--add-data", f'{os.path.join(ROOT, "app", "web")}{os.pathsep}app/web',
        "--collect-submodules", "webview",
    ]
    for m in 제외:
        명령 += ["--exclude-module", m]
    for m in 추가모듈:
        명령 += ["--hidden-import", m]
    # 진입점은 루트의 설문앱.py 다. app/main.py 를 바로 주면 app 이 패키지로
    # 안 잡혀 api.py 의 상대 임포트가 깨진다.
    명령.append(os.path.join(ROOT, "설문앱.py"))

    t0 = time.time()
    if subprocess.run(명령, cwd=ROOT).returncode != 0:
        print("  실패 — 위 로그를 본다. 앱이 실행 중이면 먼저 닫는다.")
        return None

    폴더 = os.path.join(빌드, 붙인이름)
    크기 = sum(os.path.getsize(os.path.join(뿌리, f))
               for 뿌리, _, 파일들 in os.walk(폴더) for f in 파일들)
    print(f"  됐다 — {os.path.relpath(폴더, ROOT)}  "
          f"{크기/1024/1024:.0f} MB  ({time.time()-t0:.0f}초)")
    if not 콘솔:
        안내쓰기(폴더)
    return 폴더


def 안내쓰기(폴더):
    줄 = [
        "플레이테스트 설문 앱 — 설치 안내",
        "=" * 46,
        "",
        "게임 PC 든 담당자 PC 든 같은 것을 깐다.",
        "",
        "설치",
        "  1. 이 폴더를 통째로 PC 에 복사한다. 아무 곳이나 좋다.",
        "     (예: C:\\플레이테스트설문)",
        "  2. 폴더 안의 플레이테스트설문.exe 를 두 번 누른다.",
        "  3. [설정] 탭에서 이 PC 가 받을 게임을 고르고 [저장] 을 누른다.",
        "     한 번만 하면 된다. 그 뒤로 참가자는 게임을 고르지 않는다.",
        "  4. PC 이름도 적어 두면(예: 1번 부스) 나중에 응답을 모을 때 편하다.",
        "",
        "설치 프로그램이 없다. 레지스트리도 건드리지 않는다.",
        "지울 때는 폴더를 지우면 끝이다.",
        "",
        "명부 (안 넣어도 된다)",
        "  실행 파일 옆에 「앱데이터」 폴더가 생긴다.",
        "  그 안에 명부.csv 를 넣으면 참가자가 이름을 적을 때 맞는 이름을 제안한다.",
        "  오타로 같은 사람이 게임마다 다른 번호를 받는 일을 막는다.",
        "",
        "      이름,ID,유형,비고",
        "      김도현,P01,교육생,",
        "      이서연,P02,교육생,",
        "",
        "  명부가 없어도 설문은 그대로 돌아간다. 참가자가 이름을 직접 적는다.",
        "",
        "테스트 당일",
        "  대기 화면에서 [설문 시작하기] 를 누르면 참가자가 이름을 적고 답한다.",
        "  다 내면 5초 뒤 대기 화면으로 돌아간다. 다음 사람이 바로 시작하면 된다.",
        "  [현황] 탭에서 이 PC 가 받은 응답과 아직 안 한 사람을 본다.",
        "",
        "응답이 쌓이는 곳",
        "  앱데이터\\응답\\  — 응답 한 건이 파일 하나다.",
        "  테스트가 끝나면 이 폴더를 통째로 USB 에 복사해 담당자 PC 로 가져간다.",
        "",
        "문서 만들기 (담당자 PC 에서)",
        "  1. [모으기] 탭에서 각 게임 PC 의 응답 폴더를 하나씩 불러온다.",
        "     같은 파일은 알아서 건너뛴다. 여러 번 불러와도 안전하다.",
        "  2. [리포트] 탭에서 [리포트 만들기] 를 누른다.",
        "  3. 결과는 실행 파일 옆 out 폴더에 게임별로 들어간다.",
        "     - 종합 리포트 1건 · 개별 카드 응답자 수만큼 · 담당자 체크리스트",
        "  응답 80건이면 1~2분 걸린다.",
        "",
        "  ※ 만들기 전에 Word 로 열어 둔 문서를 모두 닫는다.",
        "     열려 있으면 그 파일만 건너뛰고 무엇이 안 됐는지 알려 준다.",
        "",
        "이 PC 에서 잘 도는지 점검하려면",
        "  명령 프롬프트에서 이 폴더로 간 뒤",
        "      플레이테스트설문.exe --자가검사",
        "  창을 띄우지 않고 라이브러리 · 한글 폰트 · 차트 · 문서 생성을 한 번씩",
        "  돌려 보고 결과를 앱데이터\\자가검사.txt 에 적는다.",
        "  응답을 읽는 곳과 CSV 를 쓰는 곳이 같은지도 여기서 확인한다.",
        "",
        "창을 안 띄우고 문서만 뽑으려면",
        "      플레이테스트설문.exe --리포트",
        "  [리포트 만들기] 버튼과 같은 일을 한다.",
        "  결과는 앱데이터\\리포트결과.txt 에 적는다.",
        "",
        "안 뜰 때",
        "  · 창이 안 열리면 Microsoft Edge WebView2 런타임을 깔면 된다.",
        "    Windows 10/11 에는 대개 이미 들어 있다.",
        "    https://developer.microsoft.com/microsoft-edge/webview2/",
        "  · 백신이 막으면 폴더를 예외로 등록한다.",
        "",
        "만든 곳: 충북글로벌게임센터 · 2026 충북 인디게임 플레이테스트",
    ]
    with open(os.path.join(폴더, "설치안내.txt"), "w", encoding="utf-8") as fp:
        fp.write("\n".join(줄) + "\n")


def main():
    if "--정리" in sys.argv:
        정리()
        return 0

    os.makedirs(빌드, exist_ok=True)
    폴더 = 묶기("--콘솔" in sys.argv)

    print("\n" + "═" * 70)
    if not 폴더:
        print("  실패")
        return 1
    print(f"  {os.path.relpath(폴더, ROOT)}")
    print("  이 폴더를 통째로 복사해서 쓴다. 안에 설치안내.txt 가 있다.")
    print("═" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
