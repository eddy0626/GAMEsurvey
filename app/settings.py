# -*- coding: utf-8 -*-
"""이 PC 의 설정

게임별 PC 5대에 같은 exe 를 깔고, 각 PC 가 어느 게임인지만 다르게 잡는다.
최초 1회 설정하면 그 뒤로 참가자가 게임을 고를 일이 없다.
"""
import json
import os

기본값 = {
    "게임코드": "",
    "기관명": "충북글로벌게임센터",
    "사업명": "2026 충북 인디게임 플레이테스트",
    "자동복귀초": 5,
    "PC이름": "",
}


def 앱폴더():
    """exe 로 묶여도 옆에 데이터를 두기 위해 실행 파일 위치를 쓴다"""
    import sys
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def 데이터폴더():
    p = os.path.join(앱폴더(), "앱데이터")
    os.makedirs(p, exist_ok=True)
    return p


def 응답폴더():
    p = os.path.join(데이터폴더(), "응답")
    os.makedirs(p, exist_ok=True)
    return p


def 설정경로():
    return os.path.join(데이터폴더(), "settings.json")


def 읽기():
    s = dict(기본값)
    try:
        with open(설정경로(), encoding="utf-8") as fp:
            s.update(json.load(fp))
    except FileNotFoundError:
        pass
    except (json.JSONDecodeError, OSError):
        pass                                   # 깨졌으면 기본값으로 계속 돈다
    return s


def 쓰기(새설정):
    s = 읽기()
    s.update({k: v for k, v in 새설정.items() if k in 기본값})
    with open(설정경로(), "w", encoding="utf-8") as fp:
        json.dump(s, fp, ensure_ascii=False, indent=1)
    return s
