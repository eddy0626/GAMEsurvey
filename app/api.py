# -*- coding: utf-8 -*-
"""화면(JS) 이 부르는 함수만 모아 둔 다리

화면은 파이썬 내부를 모른다. 여기 있는 함수 이름만 안다.
실제 일은 store.py 와 기존 py/ 모듈이 한다.

모든 함수는 예외를 잡아 {"오류": "..."} 를 돌려준다.
화면이 죽지 않고 사람이 읽을 수 있는 메시지를 띄우게 하기 위해서다.
"""
import os
import sys
import threading
import traceback

from . import settings, store

ROOT = settings.앱폴더()
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


def _감싸기(fn):
    def 안전하게(*a, **k):
        try:
            return fn(*a, **k)
        except Exception as e:                                   # noqa: BLE001
            return {"오류": f"{type(e).__name__}: {e}",
                    "자세히": traceback.format_exc(limit=4)}
    안전하게.__name__ = fn.__name__
    return 안전하게


class API:
    """pywebview 가 window.pywebview.api 로 노출한다"""

    def __init__(self):
        self._진행 = {"작업": "", "단계": "", "끝남": True, "결과": None}

    # ── 설정 ──
    @_감싸기
    def 설정(self):
        s = settings.읽기()
        s["게임목록"] = store.게임목록()
        폼 = store.폼(s["게임코드"]) if s["게임코드"] else None
        s["게임명"] = 폼["게임명"] if 폼 else ""
        s["개발사"] = 폼["개발사"] if 폼 else ""
        s["데이터폴더"] = settings.데이터폴더()
        s["응답폴더"] = settings.응답폴더()
        s["명부있음"] = bool(store.명부())
        return s

    @_감싸기
    def 설정저장(self, 새설정):
        return settings.쓰기(새설정 or {})

    # ── 설문 ──
    @_감싸기
    def 설문(self, 게임코드=None):
        코드 = 게임코드 or settings.읽기()["게임코드"]
        폼 = store.폼(코드)
        if not 폼:
            return {"오류": f"게임 코드를 찾을 수 없다: {코드}"}
        return 폼

    @_감싸기
    def 완료문구(self):
        return store.설문전체().get("완료문구", "")

    # ── 명부 ──
    @_감싸기
    def 명부(self):
        코드 = settings.읽기()["게임코드"]
        했음 = store.이미응답한사람(코드) if 코드 else set()
        사람들 = store.명부()
        for p in 사람들:
            p["응답함"] = p["ID"] in 했음
        return {"사람": 사람들, "경로": store.명부경로(),
                "응답수": len(store.목록(코드) if 코드 else [])}

    # ── 작성 중 ──
    @_감싸기
    def 임시저장(self, 부분):
        return store.임시저장(부분)

    @_감싸기
    def 임시불러오기(self):
        return store.임시불러오기()

    @_감싸기
    def 임시삭제(self):
        return store.임시삭제()

    # ── 제출 ──
    @_감싸기
    def 제출(self, 응답):
        파일 = store.저장(응답)
        store.임시삭제()
        return {"파일": 파일}

    # ── 현황 ──
    @_감싸기
    def 응답목록(self, 이게임만=True):
        코드 = settings.읽기()["게임코드"] if 이게임만 else None
        return store.목록(코드, 최근순=True)

    @_감싸기
    def 응답읽기(self, 파일명):
        return store.읽기(파일명)

    @_감싸기
    def 응답삭제(self, 파일명):
        return store.삭제(파일명)

    # ── 모으기 ──
    @_감싸기
    def 폴더고르기(self):
        import webview
        결과 = webview.windows[0].create_file_dialog(webview.FOLDER_DIALOG)
        if not 결과:
            return {"취소": True}
        return {"경로": 결과[0]}

    @_감싸기
    def 폴더합치기(self, 경로):
        return store.폴더합치기(경로)

    @_감싸기
    def 폴더열기(self, 경로=None):
        경로 = 경로 or settings.데이터폴더()
        os.startfile(경로)                                       # noqa: S606
        return True

    # ── 리포트 ──
    @_감싸기
    def CSV내보내기(self):
        return store.CSV내보내기()

    @_감싸기
    def 리포트생성(self):
        """오래 걸리므로 백그라운드로 돌리고 진행상황() 으로 확인한다"""
        if not self._진행["끝남"]:
            return {"오류": "이미 생성 중이다"}
        self._진행 = {"작업": "리포트 생성", "단계": "준비", "끝남": False, "결과": None}
        threading.Thread(target=self._리포트작업, daemon=True).start()
        return {"시작": True}

    def _리포트작업(self):
        try:
            self._진행["단계"] = "응답을 CSV 로 내보내는 중"
            내보냄 = store.CSV내보내기()

            self._진행["단계"] = "문서를 만드는 중 (1~2분 걸린다)"
            import run as 파이프라인
            결과 = 파이프라인.생성(진행=lambda s: self._진행.__setitem__("단계", s))

            self._진행["결과"] = {"내보냄": 내보냄, "생성": 결과}
        except Exception as e:                                   # noqa: BLE001
            self._진행["결과"] = {"오류": f"{type(e).__name__}: {e}",
                                  "자세히": traceback.format_exc(limit=6)}
        finally:
            self._진행["끝남"] = True
            self._진행["단계"] = "끝"

    @_감싸기
    def 진행상황(self):
        return dict(self._진행)
