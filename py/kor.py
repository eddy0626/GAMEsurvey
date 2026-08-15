# -*- coding: utf-8 -*-
"""한국어 문장 다듬기

자동 생성 문장에 '은(는)' '이(가)' 같은 괄호 표기가 남으면 사람이 쓴 글로 안 읽힌다.
받침을 보고 조사를 골라 붙인다.
"""

_받침있는숫자 = set("0136780")   # 영 일 삼 육 칠 팔 십 — 받침으로 끝나는 한자음
_받침있는영문 = set("lmnrLMNR")   # 엘 엠 엔 알


def 받침(단어):
    """마지막 글자에 받침이 있는가"""
    if not 단어:
        return False
    ch = 단어.strip()[-1] if 단어.strip() else ""
    if not ch:
        return False
    if "가" <= ch <= "힣":
        return (ord(ch) - 0xAC00) % 28 != 0
    if ch.isdigit():
        return ch in _받침있는숫자
    if ch.isalpha():
        return ch in _받침있는영문
    return False


def 조사(단어, 받침형, 무받침형):
    return f"{단어}{받침형 if 받침(단어) else 무받침형}"


def 은는(w): return 조사(w, "은", "는")
def 이가(w): return 조사(w, "이", "가")
def 을를(w): return 조사(w, "을", "를")
def 과와(w): return 조사(w, "과", "와")
def 으로로(w): return 조사(w, "으로", "로")


def 자르기(s, n, 말줄임="…"):
    """표 칸에 넣을 때 중간에 뚝 끊기지 않게 자른다"""
    s = str(s)
    if len(s) <= n:
        return s
    잘린 = s[: n - 1].rstrip()
    # 따옴표가 열린 채로 끝나면 닫아 준다
    for 여는, 닫는 in (("'", "'"), ("“", "”"), ('"', '"')):
        if 잘린.count(여는) > 잘린.count(닫는):
            잘린 = 잘린.rstrip(여는).rstrip()
    return 잘린 + 말줄임
