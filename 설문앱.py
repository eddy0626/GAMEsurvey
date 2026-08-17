# -*- coding: utf-8 -*-
"""설문 앱 진입점 (exe 로 묶을 때 쓰는 것)

PyInstaller 에 app/main.py 를 바로 주면 main 이 최상위 모듈이 되어
app 패키지가 안 잡히고, api.py 의 `from . import settings` 가 깨진다.
여기를 진입점으로 주면 app 이 패키지로 수집된다.

    설문앱.exe             앱을 띄운다
    설문앱.exe --자가검사    창을 띄우지 않고 이 PC 에서 돌아가는지 점검한다
                          결과는 앱데이터\자가검사.txt 에 남는다
"""
import os
import sys
import traceback

_루트 = os.path.dirname(os.path.abspath(__file__))
if _루트 not in sys.path:
    sys.path.insert(0, _루트)

# 윈도우 콘솔은 기본이 cp949 라 '—' 같은 글자에서 UnicodeEncodeError 로 죽는다.
# 창 없는 빌드에서는 stdout 이 아예 None 이기도 하다. 둘 다 막는다.
for _흐름 in (sys.stdout, sys.stderr):
    try:
        _흐름.reconfigure(encoding="utf-8", errors="replace")
    except Exception:                                            # noqa: BLE001
        pass


def _찍기(s=""):
    """출력이 막혀 있어도 프로그램이 죽지 않게 한다"""
    try:
        print(s)
    except Exception:                                            # noqa: BLE001
        pass


def 리포트만들기():
    """창을 띄우지 않고 문서를 만든다 — [리포트] 탭 버튼과 같은 일을 한다.

    화면 없이 돌려 볼 수 있어야 이 설치본이 진짜로 문서를 뽑는지 확인된다.
    창이 안 뜨는 PC 에서 문서만 급히 뽑아야 할 때도 쓴다.
    """
    줄 = []

    def 적기(s=""):
        줄.append(s)
        _찍기(s)

    from app import store
    내보냄 = store.CSV내보내기()
    적기(f'CSV {len(내보냄["게임"])}개로 내보냈다 — 응답 {내보냄["총응답"]}건')
    적기(f'  {내보냄["폴더"]}')
    적기()

    import run
    R = run.생성(말하기=적기)

    적기()
    적기("=" * 66)
    for g in R["게임"]:
        꼬리 = ("  ← " + " / ".join(g["경고"])) if g["경고"] else ""
        적기(f'  {g["게임명"][:20]:<22} 응답 {g["응답"]:>3}  카드 {g["카드"]:>3}  '
            f'리포트 {g["리포트"]}{꼬리}')
    적기(f'  문서 {R["총문서"]}건 · {R["초"]}초')
    적기(f'  출력: {R["출력폴더"]}')
    적기("=" * 66)
    if not R["총문서"]:
        적기("  문서가 하나도 안 나왔다. 위 경고를 본다.")

    # 창 없는 빌드는 stdout 이 콘솔에 붙지 않는다. 자가검사와 같이 파일로 남긴다.
    try:
        from app import settings
        결과경로 = os.path.join(settings.데이터폴더(), "리포트결과.txt")
        with open(결과경로, "w", encoding="utf-8") as fp:
            fp.write("\n".join(줄) + "\n")
        _찍기("\n결과를 적어 두었다: " + 결과경로)
    except Exception:                                            # noqa: BLE001
        pass
    return 0 if R["총문서"] else 1


def 자가검사():
    """설치한 PC 에서 실제로 돌아가는지 본다.

    묶인(exe) 상태에서는 라이브러리가 빠져 있어도 앱이 뜰 때까지는 멀쩡해 보이고,
    [리포트 만들기] 를 누르는 순간에야 터진다. 미리 확인하려는 것이다.
    """
    줄 = []

    def 적기(s=""):
        줄.append(s)
        _찍기(s)

    적기("플레이테스트 설문 앱 — 자가 검사")
    적기("=" * 46)
    적기(f"실행 파일 : {sys.executable}")
    적기(f"묶인 상태 : {'예' if getattr(sys, 'frozen', False) else '아니오 (소스에서 실행)'}")
    적기()

    문제 = []

    적기("[1] 기본 기능")
    for 이름, 모듈 in [("창 띄우기", "webview"), ("설정", "app.settings"), ("저장", "app.store")]:
        try:
            __import__(모듈)
            적기(f"    OK  {이름}")
        except Exception as e:                                   # noqa: BLE001
            적기(f"    NG  {이름} — {type(e).__name__}: {e}")
            문제.append(이름)

    적기()
    적기("[2] 설문 정의")
    try:
        from app.store import 설문전체
        전체 = 설문전체()
        적기(f"    OK  폼 {len(전체['폼'])}개")
        for f in 전체["폼"]:
            적기(f"        {f['코드']}  {f['게임명'][:22]:<24} {f['문항수']}문항 · {f['열수']}열")
    except Exception as e:                                       # noqa: BLE001
        적기(f"    NG  설문 정의를 읽을 수 없다 — {type(e).__name__}: {e}")
        문제.append("설문 정의")

    적기()
    적기("[3] 문서 생성")
    있음, 없음 = [], []
    for 이름, 모듈 in [("표 · 문서", "docx"), ("차트", "matplotlib"), ("엑셀 읽기", "openpyxl")]:
        try:
            __import__(모듈)
            적기(f"    OK  {이름}")
            있음.append(이름)
        except Exception as e:                                   # noqa: BLE001
            없음.append(이름)
            # ModuleNotFoundError 는 ImportError 의 하위 클래스다.
            # type(e) is ImportError 로 보면 안 걸린다.
            if isinstance(e, ImportError) and 모듈.split(".")[0] in str(e):
                적기(f"    NG  {이름} 없음 — 이 설치본에 안 들어 있다")
                문제.append(이름)
            else:
                적기(f"    NG  {이름} — {type(e).__name__}: {e}")
                for 줄자국 in traceback.format_exc(limit=3).splitlines():
                    적기("        " + 줄자국)
                문제.append(이름)

    문서가능 = not 없음

    if 문서가능:
        try:
            import matplotlib
            matplotlib.use("Agg")
            from py import charts
            적기(f"    OK  한글 폰트 — {charts.폰트이름 or '못 찾음'}")
            if not charts.폰트이름:
                적기("        맑은 고딕이 없다. 차트 글씨가 깨질 수 있다.")
                문제.append("한글 폰트")

            import tempfile
            임시 = tempfile.mkdtemp(prefix="자가검사_")
            경로 = os.path.join(임시, "시험.png")
            charts.레이더_게임([3.2, 2.8, 4.4, 3.5, 2.5, 3.1], 경로, "시험", 16)
            크기 = os.path.getsize(경로)
            적기(f"    OK  차트 그리기 — {크기//1024}KB")

            from py.docxkit import 문서만들기, h
            doc = 문서만들기()
            h(doc, "시험", 14)
            문서경로 = os.path.join(임시, "시험.docx")
            doc.save(문서경로)
            적기(f"    OK  문서 만들기 — {os.path.getsize(문서경로)//1024}KB")

            import run                                            # noqa: F401
            적기("    OK  리포트 파이프라인 불러오기")

            import shutil
            shutil.rmtree(임시, ignore_errors=True)
        except Exception as e:                                    # noqa: BLE001
            적기(f"    NG  문서 생성이 안 된다 — {type(e).__name__}: {e}")
            적기("        " + traceback.format_exc(limit=3).replace("\n", "\n        "))
            문제.append("문서 생성")
    else:
        적기("    문서 생성이 안 된다. 응답은 그대로 받을 수 있으니 "
            "응답 폴더를 온전한 PC 로 옮겨 거기서 만든다.")

    적기()
    적기("[4] 폴더")
    try:
        from app import settings
        적기(f"    앱데이터 : {settings.데이터폴더()}")
        적기(f"    응답     : {settings.응답폴더()}")
        s = settings.읽기()
        적기(f"    설정     : 게임 {s.get('게임코드') or '(아직 안 고름)'}"
            f" · PC {s.get('PC이름') or '(이름 없음)'}")
        from app.store import 명부, 목록
        적기(f"    명부     : {len(명부())}명")
        적기(f"    쌓인 응답 : {len(목록())}건")

        # CSV 를 쓰는 곳과 읽는 곳이 갈리면 아무 말 없이 문서 0건이 된다.
        # 2026-08-17 에 그랬다 — 읽는 쪽이 _internal 안을 보고 있었다.
        if 문서가능:
            import run as 파이프라인
            내보낼곳 = os.path.join(settings.앱폴더(), "data", "응답")
            적기(f"    CSV 입력 : {파이프라인.응답폴더}")
            적기(f"    문서 출력 : {파이프라인.OUT}")
            if os.path.normcase(내보낼곳) != os.path.normcase(파이프라인.응답폴더):
                적기("    NG  CSV 를 쓰는 곳과 읽는 곳이 다르다")
                적기(f"        쓰는 곳 : {내보낼곳}")
                문제.append("입출력 폴더 불일치")
            else:
                적기("    OK  쓰는 곳과 읽는 곳이 같다")
    except Exception as e:                                        # noqa: BLE001
        적기(f"    NG  {type(e).__name__}: {e}")
        문제.append("폴더")

    적기()
    적기("=" * 46)
    if 문제:
        적기(f"문제 {len(문제)}건 — {', '.join(문제)}")
    else:
        적기("이상 없다. 그대로 쓰면 된다.")
    적기("=" * 46)

    try:
        from app import settings
        결과경로 = os.path.join(settings.데이터폴더(), "자가검사.txt")
        with open(결과경로, "w", encoding="utf-8") as fp:
            fp.write("\n".join(줄) + "\n")
        print("\n결과를 적어 두었다:", 결과경로)
    except Exception:                                             # noqa: BLE001
        pass
    return 1 if 문제 else 0


if __name__ == "__main__":
    if "--리포트" in sys.argv:
        try:
            sys.exit(리포트만들기())
        except SystemExit:
            raise
        except Exception:                                        # noqa: BLE001
            _찍기(traceback.format_exc())
            sys.exit(2)
    if "--자가검사" in sys.argv:
        try:
            sys.exit(자가검사())
        except SystemExit:
            raise
        except Exception:                                        # noqa: BLE001
            _찍기(traceback.format_exc())
            try:
                from app import settings
                with open(os.path.join(settings.데이터폴더(), "자가검사.txt"),
                          "w", encoding="utf-8") as fp:
                    fp.write("자가 검사 도중 터졌다.\n\n" + traceback.format_exc())
            except Exception:                                    # noqa: BLE001
                pass
            sys.exit(2)
    from app.main import 실행
    sys.exit(실행())
