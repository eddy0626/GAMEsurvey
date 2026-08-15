# -*- coding: utf-8 -*-
"""플레이테스트 설문 앱 — 진입점

    python -m app.main
    python app/main.py

exe 로 묶으면 실행 파일을 그냥 두 번 누르면 된다.
데이터(설정 · 응답 · 명부)는 실행 파일 옆 「앱데이터」 폴더에 쌓인다.
"""
import os
import sys

# exe 로 묶였을 때도 최상위 패키지를 찾게 한다
_여기 = os.path.dirname(os.path.abspath(__file__))
_루트 = os.path.dirname(_여기)
for p in (_루트, _여기):
    if p not in sys.path:
        sys.path.insert(0, p)

import webview                                                   # noqa: E402

try:
    from app.api import API
    from app import settings
except ImportError:                                              # 직접 실행할 때
    from api import API                                          # type: ignore
    import settings                                              # type: ignore


def 웹폴더():
    return os.path.join(_여기, "web")


def 실행():
    필수 = os.path.join(웹폴더(), "survey.json")
    if not os.path.exists(필수):
        print("설문 정의가 없다. 먼저 아래를 실행한다:")
        print("    python -X utf8 tools/make_survey_json.py")
        return 1

    s = settings.읽기()
    제목 = "플레이테스트 설문"
    if s.get("게임코드"):
        try:
            from app.store import 폼
        except ImportError:
            from store import 폼                                 # type: ignore
        f = 폼(s["게임코드"])
        if f:
            제목 = f'{f["게임명"]} 플레이테스트 설문'

    webview.create_window(
        제목,
        os.path.join(웹폴더(), "index.html"),
        js_api=API(),
        width=1180, height=860, min_size=(980, 700),
        background_color="#F5F7FA",
    )
    webview.start(debug=("--debug" in sys.argv))
    return 0


if __name__ == "__main__":
    sys.exit(실행())
