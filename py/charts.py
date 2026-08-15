# -*- coding: utf-8 -*-
"""리포트 · 카드용 차트 PNG 생성

  레이더(1계열)  게임 6축 평균          → 종합 리포트
  레이더(2계열)  응답자 점수 vs 전체 평균 → 개별 카드
  막대          8개 항목 평균 낮은 순    → 종합 리포트
  퍼널          진행도 · 구매 의향       → 종합 리포트

세로축은 0~5 로 고정한다. 게임 간 비교가 가능해야 하기 때문이다.
"""
import os
import warnings

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib import font_manager as fm

from . import config as C

warnings.filterwarnings("ignore")

BLUE, GRAY, RED, ORANGE = "#2E74B5", "#667085", "#C0392B", "#E8A33D"
평균색 = "#9AA6B2"

_후보폰트 = [r"C:\Windows\Fonts\malgun.ttf", r"C:\Windows\Fonts\NanumGothic.ttf",
             "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
             "/System/Library/Fonts/AppleSDGothicNeo.ttc"]


def _폰트설정():
    for p in _후보폰트:
        if os.path.exists(p):
            fm.fontManager.addfont(p)
            name = fm.FontProperties(fname=p).get_name()
            plt.rcParams["font.family"] = name
            plt.rcParams["axes.unicode_minus"] = False
            return name
    plt.rcParams["axes.unicode_minus"] = False
    return None


폰트이름 = _폰트설정()
축이름 = [이름 for _, 이름 in C.육각축]


def _레이더축(ax):
    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)
    ax.set_ylim(0, 5)
    ax.set_yticks([1, 2, 3, 4, 5])
    ax.set_yticklabels(["1", "2", "3", "4", "5"], fontsize=8, color=GRAY)
    ax.grid(color="#DDE3EA", lw=0.8)
    ax.spines["polar"].set_color("#C9D3DE")


def 레이더_게임(값들, 경로, 게임명="", n=None):
    """6축 평균 1계열"""
    ang = np.linspace(0, 2 * np.pi, 6, endpoint=False).tolist()
    v = [x if x is not None else 0 for x in 값들]
    fig, ax = plt.subplots(figsize=(7.0, 6.4), subplot_kw=dict(polar=True))
    _레이더축(ax)
    ax.plot(ang + ang[:1], v + v[:1], color=BLUE, lw=2.2, zorder=3)
    ax.fill(ang + ang[:1], v + v[:1], color=BLUE, alpha=0.20, zorder=2)
    ax.scatter(ang, v, color=BLUE, s=44, zorder=4)
    OFFS = [(0, 14), (16, 6), (14, -10), (0, -16), (-16, -8), (-18, 6)]
    for a, val, off in zip(ang, v, OFFS):
        ax.annotate(f"{val:.2f}", (a, val), textcoords="offset points", xytext=off,
                    ha="center", fontsize=11.5, fontweight="bold", color=BLUE)
    ax.set_xticks(ang)
    ax.set_xticklabels(축이름, fontsize=12.5)
    ax.tick_params(axis="x", pad=22)
    평균 = sum(v) / len(v)
    부제 = f"(n={n}, 5점 만점)" if n else "(5점 만점)"
    ax.set_title(f"게임 전체 평가 {부제}\n6축 평균 {평균:.2f}",
                 fontsize=13.5, fontweight="bold", pad=28)
    plt.tight_layout()
    plt.savefig(경로, dpi=190, bbox_inches="tight", facecolor="white")
    plt.close()
    return 경로


def 레이더_개인(본인, 평균, 경로, ID="본인"):
    """응답자 점수 + 전체 평균 2계열 겹침 (개별 카드용)"""
    ang = np.linspace(0, 2 * np.pi, 6, endpoint=False).tolist()
    a = [x if x is not None else 0 for x in 본인]
    b = [x if x is not None else 0 for x in 평균]
    fig, ax = plt.subplots(figsize=(5.6, 5.2), subplot_kw=dict(polar=True))
    _레이더축(ax)
    ax.plot(ang + ang[:1], b + b[:1], color=평균색, lw=1.8, ls="--", zorder=2, label="전체 평균")
    ax.fill(ang + ang[:1], b + b[:1], color=평균색, alpha=0.16, zorder=1)
    ax.plot(ang + ang[:1], a + a[:1], color=BLUE, lw=2.2, zorder=3, label=ID)
    ax.fill(ang + ang[:1], a + a[:1], color=BLUE, alpha=0.22, zorder=2)
    ax.scatter(ang, a, color=BLUE, s=32, zorder=4)
    ax.set_xticks(ang)
    ax.set_xticklabels(축이름, fontsize=10)
    ax.tick_params(axis="x", pad=14)
    ax.legend(loc="upper right", bbox_to_anchor=(1.22, 1.10), fontsize=9, frameon=False)
    plt.tight_layout()
    plt.savefig(경로, dpi=170, bbox_inches="tight", facecolor="white")
    plt.close()
    return 경로


def 막대_항목평균(라벨들, 값들, 경로, n=None):
    """8개 항목 평균 — 낮은 순"""
    쌍 = sorted([(v if v is not None else 0, l) for v, l in zip(값들, 라벨들)])
    D = [x[0] for x in 쌍]
    L = [x[1] for x in 쌍]
    colors = [RED if d < 3.0 else (ORANGE if d < 3.5 else BLUE) for d in D]
    fig, ax = plt.subplots(figsize=(8.4, 4.4))
    b = ax.barh(L, D, color=colors, height=0.62)
    for rect, d in zip(b, D):
        ax.text(d + 0.09, rect.get_y() + rect.get_height() / 2, f"{d:.2f}",
                va="center", fontsize=10.5, fontweight="bold", color="#333")
    ax.axvline(3.0, color=GRAY, ls="--", lw=1)
    ax.set_xlim(0, 5.5)
    ax.set_xticks([0, 1, 2, 3, 4, 5])
    ax.set_xlabel("평균 점수 (5점 만점) · 점선은 보통(3.0)", fontsize=10, color=GRAY)
    ax.set_title(f"항목별 평균 — 낮은 순{f' (n={n})' if n else ''}",
                 fontsize=12.5, fontweight="bold", loc="left", pad=12)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.spines["left"].set_color("#C9D3DE")
    ax.spines["bottom"].set_color("#C9D3DE")
    ax.tick_params(labelsize=10.5)
    plt.tight_layout()
    plt.savefig(경로, dpi=190, facecolor="white")
    plt.close()
    return 경로


def 퍼널_진행도구매(진행도표, 구매표, 경로, n=None):
    """진행도(좌) · 스팀 구매 의향(우)"""
    palette = [RED, ORANGE, "#AECBEA", BLUE, "#1F4E79"]
    fig, axes = plt.subplots(1, 2, figsize=(10.8, 3.8))
    구성 = [
        (axes[0], C.진행도순서, 진행도표, f"진행도{f' (n={n})' if n else ''}",
         ["튜토리얼\n미완", "튜토리얼\n완료", "초반\n일부", "여러\n콘텐츠", "전체\n완주"]),
        (axes[1], C.구매순서, 구매표, f"스팀 구매 의향{f' (n={n})' if n else ''}",
         ["구매\n안 함", "무료면", "할인\n시", "의향\n있음", "정가\n구매"]),
    ]
    for ax, 순서, 표, 제목, ticks in 구성:
        맵 = {row["답"]: row["인원"] for row in 표}
        vv = [맵.get(k, 0) for k in 순서]
        ax.bar(range(5), vv, color=palette, width=0.62)
        for i, x in enumerate(vv):
            if x:
                ax.text(i, x + 0.15, f"{x}명", ha="center", fontsize=10.5, fontweight="bold")
        ax.set_xticks(range(5))
        ax.set_xticklabels(ticks, fontsize=9.5)
        ax.set_ylim(0, max(vv) + 1.3 if vv and max(vv) else 1)
        ax.set_yticks([])
        ax.set_title(제목, fontsize=12, fontweight="bold", loc="left")
        for s in ("top", "right", "left"):
            ax.spines[s].set_visible(False)
        ax.spines["bottom"].set_color("#C9D3DE")
    plt.tight_layout()
    plt.savefig(경로, dpi=190, facecolor="white")
    plt.close()
    return 경로
