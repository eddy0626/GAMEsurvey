# -*- coding: utf-8 -*-
"""추가 도식

charts.py 는 기준선 리포트가 쓰던 3종(레이더 · 막대 · 퍼널)이다.
여기는 표로만 보여 주던 것을 그림으로 바꾸려고 새로 만든 것들이다.

  종합 리포트
    스택_NPS         추천 · 중립 · 비추천 한 줄 스택
    막대_가격         적정 가격 분포 (구간 순서 고정)
    세그먼트_비교      집단별 6축 · 진행 흐름 · NPS 나란히
    히트맵_응답자      응답자 × 항목 점수 격자
    스택_문항모음      객관식 문항 여러 개를 100% 스택으로 한 장에
    막대_플래그        심각도별 이슈 건수

  개별 카드
    편차_막대         내 점수 − 전체 평균
    위치_띠           진행도 5단계 위치 + 추천 점수 0~10 눈금

세로축 범위는 게임 간 비교가 되도록 고정한다.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.colors as mcolors
import matplotlib.pyplot as plt
import numpy as np

from .charts import BLUE, GRAY, 폰트이름          # 폰트 설정은 charts 임포트 시 끝난다

RED, ORANGE, GREEN, NAVY = "#C0392B", "#E8A33D", "#2E9E5B", "#1F4E79"
연회색, 아주연한 = "#AEB6BF", "#EEF1F4"
스택팔레트 = [NAVY, BLUE, "#7FB3DE", 연회색, ORANGE, RED, "#8E44AD", "#16A085"]
심각도색 = {"Critical": RED, "High": ORANGE, "검토필요": "#5B7C99", "강점": GREEN}


def _깔끔(ax, 숨김=("top", "right")):
    for s in 숨김:
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        if s not in 숨김:
            ax.spines[s].set_color("#C9D3DE")


def _자르기(s, n):
    s = str(s)
    return s if len(s) <= n else s[: n - 1] + "…"


# ══ 종합 리포트 ═══════════════════════════════════════════════════════════

def 스택_NPS(nps, 경로):
    총 = max(nps["N"], 1)
    조각 = [("비추천 0~6점", nps["비추천"], RED),
            ("중립 7~8점", nps["중립"], 연회색),
            ("추천 9~10점", nps["추천"], GREEN)]
    fig, ax = plt.subplots(figsize=(9.6, 2.4))
    좌 = 0
    for _라벨, n, c in 조각:
        if not n:
            continue
        w = n / 총 * 100
        ax.barh([0], [w], left=[좌], color=c, height=0.5)
        if w > 8:
            ax.text(좌 + w / 2, 0, f"{n}명 · {round(w)}%", ha="center", va="center",
                    fontsize=10, fontweight="bold", color="white")
        좌 += w
    for 라벨, n, c in 조각:
        ax.barh([0], [0], color=c, label=f"{라벨}  {n}명")
    ax.set_xlim(0, 100); ax.set_ylim(-0.55, 0.85)
    ax.set_yticks([]); ax.set_xticks([0, 25, 50, 75, 100])
    ax.set_xticklabels(["0%", "25%", "50%", "75%", "100%"], fontsize=9, color=GRAY)
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, 1.34), ncol=3,
              fontsize=9.5, frameon=False)
    ax.set_title(f'NPS {nps["값"]}   —   추천% 빼기 비추천%', fontsize=12.5,
                 fontweight="bold", loc="left", pad=30)
    _깔끔(ax, ("top", "right", "left"))
    plt.tight_layout(); plt.savefig(경로, dpi=190, facecolor="white"); plt.close()
    return 경로


def 막대_가격(가격표, 구간순서, 경로, n=None):
    맵 = {r["답"]: r["인원"] for r in 가격표}
    v = [맵.get(k, 0) for k in 구간순서]
    최대 = max(v) if v else 0
    색 = [BLUE if x == 최대 and x else "#9EC5E8" for x in v]
    fig, ax = plt.subplots(figsize=(9.6, 3.2))
    ax.bar(range(len(v)), v, color=색, width=0.6)
    for i, x in enumerate(v):
        if x:
            ax.text(i, x + max(최대, 1) * 0.05, f"{x}명", ha="center",
                    fontsize=10, fontweight="bold", color="#333")
    ax.set_xticks(range(len(구간순서)))
    ax.set_xticklabels([k.replace("원", "").replace("~", "\n~") for k in 구간순서],
                       fontsize=8.5)
    ax.set_ylim(0, (최대 or 1) * 1.28); ax.set_yticks([])
    ax.set_title(f'적정 가격{f"  (n={n})" if n else ""}', fontsize=12.5,
                 fontweight="bold", loc="left", pad=10)
    _깔끔(ax, ("top", "right", "left"))
    plt.tight_layout(); plt.savefig(경로, dpi=190, facecolor="white"); plt.close()
    return 경로


def 세그먼트_비교(행들, 경로, 제목="집단별 비교"):
    행들 = [g for g in 행들 if g["인원"]]
    if not 행들:
        return None
    라벨 = [f'{_자르기(g["라벨"], 16)}\n{g["인원"]}명' for g in 행들]
    색 = [BLUE, ORANGE, RED, GREEN, NAVY] * 3
    묶음 = [("6축 평균", [g["육각평균"] or 0 for g in 행들], 5, 2),
            ("진행 흐름", [g["진행흐름"] or 0 for g in 행들], 5, 2),
            ("NPS 평균", [g["NPS평균"] or 0 for g in 행들], 10, 1)]
    fig, axes = plt.subplots(1, 3, figsize=(11.2, 3.5))
    for ax, (이름, 값, 제한, 자리) in zip(axes, 묶음):
        ax.bar(range(len(값)), 값, color=색[: len(값)], width=0.55)
        for i, x in enumerate(값):
            ax.text(i, x + 제한 * 0.035, f"{x:.{자리}f}", ha="center",
                    fontsize=10, fontweight="bold", color="#333")
        ax.set_ylim(0, 제한 * 1.2)
        ax.set_xticks(range(len(라벨))); ax.set_xticklabels(라벨, fontsize=8.5)
        ax.set_yticks([])
        ax.set_title(이름, fontsize=11, fontweight="bold", loc="left")
        _깔끔(ax, ("top", "right", "left"))
    fig.suptitle(제목, fontsize=12.5, fontweight="bold", x=0.012, ha="left")
    plt.tight_layout(rect=[0, 0, 1, 0.92])
    plt.savefig(경로, dpi=190, facecolor="white"); plt.close()
    return 경로


def 히트맵_응답자(IDs, 항목명, 점수행렬, 경로):
    if not IDs:
        return None
    데이터 = np.array([[(v if v is not None else np.nan) for v in 행]
                       for 행 in 점수행렬], dtype=float)
    cmap = mcolors.LinearSegmentedColormap.from_list(
        "score", ["#C0392B", "#E8A33D", "#F6EBD6", "#9EC5E8", "#1F4E79"])
    높이 = max(3.2, len(IDs) * 0.30 + 1.5)
    fig, ax = plt.subplots(figsize=(9.6, 높이))
    im = ax.imshow(데이터, cmap=cmap, vmin=1, vmax=5, aspect="auto")
    ax.set_xticks(range(len(항목명)))
    ax.set_xticklabels(항목명, fontsize=8.8)
    ax.set_yticks(range(len(IDs)))
    ax.set_yticklabels(IDs, fontsize=8.5)
    for i in range(len(IDs)):
        for j in range(len(항목명)):
            v = 데이터[i, j]
            if not np.isnan(v):
                ax.text(j, i, f"{int(v)}", ha="center", va="center", fontsize=8,
                        color="white" if (v <= 2 or v >= 4.5) else "#33383D")
    ax.set_xticks(np.arange(-0.5, len(항목명), 1), minor=True)
    ax.set_yticks(np.arange(-0.5, len(IDs), 1), minor=True)
    ax.grid(which="minor", color="white", linewidth=1.5)
    ax.tick_params(which="minor", length=0)
    for s in ax.spines.values():
        s.set_visible(False)
    cb = fig.colorbar(im, ax=ax, ticks=[1, 2, 3, 4, 5], pad=0.015, fraction=0.022)
    cb.ax.tick_params(labelsize=8); cb.outline.set_visible(False)
    ax.set_title("응답자별 항목 점수 — 붉을수록 낮다", fontsize=12.5,
                 fontweight="bold", loc="left", pad=12)
    plt.tight_layout(); plt.savefig(경로, dpi=190, facecolor="white"); plt.close()
    return 경로


부정램프 = ["#A93226", "#C0392B", "#D9694A", "#E8A33D"]
긍정램프 = ["#1F4E79", "#2E74B5", "#7FB3DE", "#B8D3EA", "#D5DBE1"]


def 스택_문항모음(문항들, 경로, N, 부정선택지=None, 최대문항=8, 최대선택지=7, 제목=None):
    """객관식 문항 여러 개를 100% 가로 스택으로 한 장에.

    색을 인원 순서가 아니라 선택지의 의미에 맞춘다.
    Config 가 부정으로 표시한 선택지는 붉은 계열, 나머지는 푸른 계열이고
    막대는 부정 → 나머지 순으로 쌓는다. 그래야 문항끼리 비교가 된다.
    선택지 이름은 부록 A 표에 다 있으므로 여기서는 넓은 칸에만 적는다.
    """
    부정선택지 = 부정선택지 or {}
    쓸것 = [항 for 항 in 문항들
            if 항["유형"] in ("객관식", "체크박스") and 항["집계"]][:최대문항]
    if not 쓸것:
        return None

    높이 = max(3.2, len(쓸것) * 0.70 + 1.9)
    fig, ax = plt.subplots(figsize=(9.6, 높이))
    부정있음 = False

    for y, 항 in enumerate(쓸것):
        나쁨 = set(부정선택지.get(항["문항"], []))
        부정칸 = [r for r in 항["집계"] if r["답"] in 나쁨]
        나머지 = [r for r in 항["집계"] if r["답"] not in 나쁨]
        if 부정칸:
            부정있음 = True
        정렬 = 부정칸 + 나머지
        보임, 기타수 = 정렬[:최대선택지], sum(r["인원"] for r in 정렬[최대선택지:])
        총 = sum(r["인원"] for r in 항["집계"]) or 1

        좌, 부i, 긍i = 0, 0, 0
        for r in 보임:
            w = r["인원"] / 총 * 100
            if r["답"] in 나쁨:
                c = 부정램프[min(부i, len(부정램프) - 1)]; 부i += 1
            else:
                c = 긍정램프[min(긍i, len(긍정램프) - 1)]; 긍i += 1
            ax.barh([y], [w], left=[좌], height=0.58, color=c)
            if w >= 16:
                ax.text(좌 + w / 2, y, f'{_자르기(r["답"], 9)}\n{r["인원"]}명',
                        ha="center", va="center", fontsize=7.2, color="white",
                        fontweight="bold", linespacing=1.15)
            elif w >= 7:
                ax.text(좌 + w / 2, y, f'{r["인원"]}', ha="center", va="center",
                        fontsize=7.5, color="white", fontweight="bold")
            좌 += w
        if 기타수:
            ax.barh([y], [기타수 / 총 * 100], left=[좌], height=0.58, color="#E4E8EC")

        if 나쁨:
            부정합 = sum(r["인원"] for r in 부정칸)
            if 부정합:
                ax.text(102.5, y, f"부정 {round(부정합 / 총 * 100)}%", ha="left",
                        va="center", fontsize=8, color="#A93226", fontweight="bold")

    ax.set_yticks(range(len(쓸것)))
    ax.set_yticklabels([_자르기(항["문항"], 28) for 항 in 쓸것], fontsize=8.5)
    ax.invert_yaxis(); ax.set_xlim(0, 118 if 부정있음 else 100)
    ax.set_xticks([0, 25, 50, 75, 100])
    ax.set_xticklabels(["0%", "25%", "50%", "75%", "100%"], fontsize=8.5, color=GRAY)
    부제 = "  —  왼쪽 붉은 칸이 부정 선택지" if 부정있음 else ""
    ax.set_title((제목 or f"문항별 응답 분포  (n={N})") + 부제, fontsize=12,
                 fontweight="bold", loc="left", pad=12)
    _깔끔(ax, ("top", "right", "left"))
    plt.tight_layout(); plt.savefig(경로, dpi=190, facecolor="white"); plt.close()
    return 경로


def 막대_플래그(플래그들, 경로):
    순서 = ["Critical", "High", "검토필요", "강점"]
    수 = {k: 0 for k in 순서}
    for f in 플래그들:
        if f["심각도"] in 수:
            수[f["심각도"]] += 1
    if not sum(수.values()):
        return None
    fig, ax = plt.subplots(figsize=(9.6, 1.9))
    좌 = 0
    총 = sum(수.values())
    for k in 순서:
        if not 수[k]:
            continue
        w = 수[k] / 총 * 100
        ax.barh([0], [w], left=[좌], color=심각도색[k], height=0.48)
        if w >= 10:
            ax.text(좌 + w / 2, 0, f"{k} {수[k]}", ha="center", va="center",
                    fontsize=9.5, fontweight="bold", color="white")
        좌 += w
    ax.set_xlim(0, 100); ax.set_ylim(-0.5, 0.5)
    ax.set_xticks([]); ax.set_yticks([])
    ax.set_title(f"이슈 후보 {총}건", fontsize=12, fontweight="bold", loc="left", pad=8)
    _깔끔(ax, ("top", "right", "left", "bottom"))
    plt.tight_layout(); plt.savefig(경로, dpi=190, facecolor="white"); plt.close()
    return 경로


# ══ 개별 카드 ═════════════════════════════════════════════════════════════

def 편차_막대(항목명, 내점수, 평균, 경로, ID="본인"):
    차 = [(a - b) if (a is not None and b is not None) else 0
          for a, b in zip(내점수, 평균)]
    색 = [RED if d < -0.4 else (GREEN if d > 0.4 else 연회색) for d in 차]
    fig, ax = plt.subplots(figsize=(8.0, 3.4))
    ax.barh(range(len(항목명)), 차, color=색, height=0.58)
    폭 = max(1.0, max((abs(d) for d in 차), default=1) * 1.4)
    for i, d in enumerate(차):
        오른 = d >= 0
        ax.text(d + (0.05 if 오른 else -0.05), i,
                f'{"+" if d > 0 else ""}{d:.2f}', va="center",
                ha="left" if 오른 else "right", fontsize=9,
                fontweight="bold", color="#333")
    ax.axvline(0, color="#667085", lw=1.2)
    ax.set_yticks(range(len(항목명)))
    ax.set_yticklabels(항목명, fontsize=9.5)
    ax.invert_yaxis(); ax.set_xlim(-폭, 폭); ax.set_xticks([])
    ax.set_title(f"{ID} 점수 빼기 전체 평균", fontsize=11.5, fontweight="bold",
                 loc="left", pad=10)
    _깔끔(ax, ("top", "right", "bottom"))
    plt.tight_layout(); plt.savefig(경로, dpi=185, facecolor="white"); plt.close()
    return 경로


def 위치_띠(진행도순서, 내진행도, nps값, 경로):
    fig, axes = plt.subplots(2, 1, figsize=(8.6, 2.7))

    ax = axes[0]
    n = len(진행도순서)
    내칸 = 진행도순서.index(내진행도) if 내진행도 in 진행도순서 else -1
    for i in range(n):
        c = BLUE if i == 내칸 else ("#DCE9F5" if i < 내칸 else 아주연한)
        ax.barh([0], [1], left=[i], height=0.6, color=c, edgecolor="white", linewidth=2)
    if 내칸 >= 0:
        ax.text(내칸 + 0.5, 0, "현재", ha="center", va="center", fontsize=9,
                fontweight="bold", color="white")
    ax.set_xlim(0, n); ax.set_ylim(-0.5, 0.5)
    ax.set_yticks([]); ax.set_xticks([i + 0.5 for i in range(n)])
    ax.set_xticklabels([_자르기(s.replace("했다", "").replace("을 마치지 못", " 미완"), 9)
                        for s in 진행도순서], fontsize=7.6)
    ax.set_title("진행도", fontsize=10.5, fontweight="bold", loc="left", pad=6)
    _깔끔(ax, ("top", "right", "left", "bottom"))

    ax = axes[1]
    for 시, 끝, c, 라벨 in [(0, 7, RED, "비추천"), (7, 9, 연회색, "중립"), (9, 11, GREEN, "추천")]:
        ax.barh([0], [끝 - 시], left=[시], height=0.4, color=c, alpha=0.32)
        ax.text((시 + 끝) / 2, -0.48, 라벨, ha="center", fontsize=7.8, color=GRAY)
    if nps값 is not None:
        ax.scatter([nps값 + 0.5], [0], s=200, color=BLUE, zorder=5)
        ax.text(nps값 + 0.5, 0, str(nps값), ha="center", va="center", fontsize=8.5,
                color="white", fontweight="bold", zorder=6)
    ax.set_xlim(0, 11); ax.set_ylim(-0.72, 0.42)
    ax.set_yticks([]); ax.set_xticks([i + 0.5 for i in range(11)])
    ax.set_xticklabels([str(i) for i in range(11)], fontsize=7.6, color=GRAY)
    ax.set_title("추천 점수", fontsize=10.5, fontweight="bold", loc="left", pad=6)
    _깔끔(ax, ("top", "right", "left", "bottom"))

    plt.tight_layout(); plt.savefig(경로, dpi=185, facecolor="white"); plt.close()
    return 경로
