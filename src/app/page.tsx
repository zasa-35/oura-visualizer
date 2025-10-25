"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
dayjs.extend(isBetween);

import {
  Moon, Sun, BedDouble, Clock, Gauge, Zap, RefreshCw, CalendarDays,
} from "lucide-react";

/** ---------- 型 ---------- */
type DailyItem = {
  day: string; score?: number; total_sleep?: number; rem_sleep?: number; deep_sleep?: number; light_sleep?: number; efficiency?: number; latency?: number;
};
type SleepItem = {
  bedtime_start?: string; bedtime_end?: string;
  total_sleep_duration?: number; rem_sleep_duration?: number; deep_sleep_duration?: number; light_sleep_duration?: number;
};
type ApiResp = { daily?: { data: DailyItem[] }; sleep?: { data: SleepItem[] } };

/** ---------- util ---------- */
const toH = (v?: number, unit: "min" | "sec" = "min") => v ? (unit === "min" ? v / 60 : v / 3600) : 0;
const fmtHm = (h: number) => `${Math.floor(h)}h ${String(Math.round((h - Math.floor(h)) * 60)).padStart(1, "0")}m`;
const fmtClock = (iso?: string | null) => (iso ? dayjs(iso).format("HH:mm") : "—");
const pct = (v?: number) => (v == null ? 0 : v <= 1 ? Math.round(v * 100) : Math.round(v));

/** ---------- 部品 ---------- */
function Card(props: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-3xl border border-white/20 bg-white/50 dark:bg-white/5 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-shadow ${props.className || ""}`}
    >
      {props.children}
    </div>
  );
}

function Stat(props: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-5 group">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-sky-500/20 text-indigo-600 dark:text-sky-300">
          {props.icon}
        </div>
        <div>
          <div className="text-xs text-zinc-500">{props.label}</div>
          <div className="text-2xl font-semibold tracking-tight">{props.value}</div>
          {props.sub && <div className="text-xs text-zinc-500">{props.sub}</div>}
        </div>
      </div>
    </Card>
  );
}

// （置き換え）一番下の棒グラフ用コンポーネント
// ※親を flex にして 4色を横並びで描画。合計が100でなくても自動スケール。
function StackedBar({
  awakePct,
  remPct,
  lightPct,
  deepPct,
}: {
  awakePct: number;
  remPct: number;
  lightPct: number;
  deepPct: number;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
  const a = clamp(awakePct);
  const r = clamp(remPct);
  const l = clamp(lightPct);
  const d = clamp(deepPct);

  // 合計が100でない場合の補正（0除算回避）
  const sum = a + r + l + d;
  const scale = sum > 0 ? 100 / sum : 0;

  return (
    <div className="w-full h-3.5 rounded-full overflow-hidden bg-zinc-200/70 dark:bg-zinc-800 flex">
      {/* Awake → REM → Light → Deep（flex で横並び） */}
      <span className="h-full bg-[#6EA7FF]"    style={{ width: `${a * scale}%` }} />
      <span className="h-full bg-[#547BFF]"     style={{ width: `${r * scale}%` }} />
      <span className="h-full bg-[#8E62FF]" style={{ width: `${l * scale}%` }} />
      <span className="h-full bg-[#C48BFF]"  style={{ width: `${d * scale}%` }} />
    </div>
  );
}

/** ---------- データ抽出 ---------- */
function pickForDay(resp: ApiResp, day: string) {
  const daily = resp.daily?.data?.find((d) => d.day === day);

  const sleeps = (resp.sleep?.data ?? []).filter((s) => {
    const bs = s?.bedtime_start ? dayjs(s.bedtime_start) : null;
    const be = s?.bedtime_end ? dayjs(s.bedtime_end) : null;
    const startOfDay = dayjs(day).startOf("day").subtract(6, "hour");
    const endOfDay = dayjs(day).endOf("day").add(6, "hour");
    return (bs && bs.isBetween(startOfDay, endOfDay, null, "[]")) ||
           (be && be.isBetween(startOfDay, endOfDay, null, "[]"));
  }).sort((a, b) => (b.total_sleep_duration ?? 0) - (a.total_sleep_duration ?? 0));

  const sleep = sleeps[0];
  return { daily, sleep };
}


/** ---------- ページ ---------- */
export default function Home() {
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [resp, setResp] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>("");

  const { daily, sleep } = useMemo(() => pickForDay(resp ?? {}, date), [resp, date]);

  // ▼ここから全置き換え（metrics の useMemo）
const metrics = useMemo(() => {
  // ---- helpers ----
  const pick = (obj: any, keys: string[]) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return null;
  };
  const m2h = (m: number | null) => (m == null ? 0 : m / 60);
  const s2h = (s: number | null) => (s == null ? 0 : s / 3600);
  const clamp = (n: number, lo = 0, hi = Infinity) => Math.min(hi, Math.max(lo, n));
  const round1 = (n: number) => Math.round(n * 10) / 10;

  // ---- totals & stages (hours) ----
  const totalH =
    // sleep.total_sleep_duration (sec)
    s2h(pick(sleep, ["total_sleep_duration"])) ||
    // daily.total_sleep (min)
    m2h(pick(daily, ["total_sleep"])) ||
    // フォールバック: ステージ合算
    (s2h(pick(sleep, ["rem_sleep_duration"])) +
      s2h(pick(sleep, ["deep_sleep_duration"])) +
      s2h(pick(sleep, ["light_sleep_duration"]))) ||
    (m2h(pick(daily, ["rem_sleep"])) +
      m2h(pick(daily, ["deep_sleep"])) +
      m2h(pick(daily, ["light_sleep"]))) ||
    0;

  const remH  = s2h(pick(sleep, ["rem_sleep_duration"]))  || m2h(pick(daily, ["rem_sleep"]))  || 0;
  const deepH = s2h(pick(sleep, ["deep_sleep_duration"])) || m2h(pick(daily, ["deep_sleep"])) || 0;
  let lightH  = s2h(pick(sleep, ["light_sleep_duration"]))|| m2h(pick(daily, ["light_sleep"]))|| 0;

  // ---- time in bed (hours) ----
  const tibH =
    m2h(pick(daily as any, ["time_in_bed"])) ||
    s2h(pick(daily as any, ["time_in_bed_duration"])) ||
    s2h(pick(sleep as any, ["time_in_bed", "time_in_bed_duration"])) ||
    (sleep?.bedtime_start && sleep?.bedtime_end
      ? clamp(dayjs(sleep.bedtime_end).diff(dayjs(sleep.bedtime_start), "minute") / 60, 0)
      : 0);

  // ---- awake (hours) ----
  let awakeH =
    s2h(pick(sleep as any, ["awake_duration", "awake_time"])) ||
    m2h(pick(daily as any, ["awake_time"])) ||
    0;
  if (!awakeH && tibH > 0 && totalH > 0) {
    // 推定: TIB - TotalSleep
    awakeH = clamp(tibH - totalH, 0);
  }

  // light が欠けていて total と合わない場合の補正
  if (!lightH && totalH > 0) {
    const inferred = totalH - remH - deepH;
    lightH = inferred > 0.01 ? inferred : 0;
  }

  // ---- efficiency (%) ----
  let efficiency: number | null = null;
  const rawEff = pick(daily as any, ["efficiency"]);
  if (rawEff != null) efficiency = rawEff <= 1 ? rawEff * 100 : rawEff;
  if ((efficiency == null || efficiency === 0) && tibH > 0 && totalH > 0) {
    efficiency = clamp((totalH / tibH) * 100, 0, 100);
  }
  efficiency = round1(efficiency ?? 0);

  // ---- latency (min) ----
  const rawLat =
    pick(daily as any, ["latency", "sleep_latency"]) ??
    pick(sleep as any, ["latency"]);
  const latencyMin =
    rawLat == null ? null : Math.round(rawLat > 120 ? rawLat / 60 : rawLat);

  // ---- distribution (Awake/REM/Light/Deep) ----
  const sum = awakeH + remH + lightH + deepH;
  const awakePct = sum ? (awakeH / sum) * 100 : 0;
  const remPct   = sum ? (remH   / sum) * 100 : 0;
  const lightPct = sum ? (lightH / sum) * 100 : 0;
  const deepPct  = sum ? (deepH  / sum) * 100 : 0;

  return {
    score: (daily as any)?.score ?? null,
    efficiency,
    latencyMin,
    bedtime: sleep?.bedtime_start ?? null,
    waketime: sleep?.bedtime_end ?? null,
    total: round1(totalH),
    rem: round1(remH),
    light: round1(lightH),
    deep: round1(deepH),
    awake: round1(awakeH),
    awakePct,
    remPct,
    lightPct,
    deepPct,
  };
}, [daily, sleep]);
// ▲ここまで置き換え

  
  // =====================
  // ここから fetchOneDay
  // =====================
  const fetchOneDay = async () => {
    setLoading(true);
    try {
      const start = dayjs(date).subtract(1, "day").format("YYYY-MM-DD");
      const end = dayjs(date).format("YYYY-MM-DD");
      const r = await fetch(
        `/api/oura/sleep?start=${start}&end=${end}`,
        { cache: "no-store" }
      );
      const j = (await r.json()) as ApiResp;
      setResp(j);
      setUpdatedAt(dayjs().format("HH:mm:ss"));
    } finally {
      setLoading(false);
    }
  };
  

  return (
    <main className="min-h-dvh bg-[radial-gradient(1000px_600px_at_10%_-10%,rgba(99,102,241,0.25),transparent),radial-gradient(1000px_600px_at_90%_-10%,rgba(56,189,248,0.25),transparent)] dark:bg-[radial-gradient(1000px_600px_at_10%_-10%,rgba(99,102,241,0.35),transparent),radial-gradient(1000px_600px_at_90%_-10%,rgba(56,189,248,0.35),transparent)] text-zinc-900 dark:text-zinc-50">
      <div className="mx-auto max-w-6xl px-5 py-8">

        {/* ヘッダー */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-sky-500">Oura Overview</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl bg-white/60 dark:bg-white/10 backdrop-blur px-3 py-2 border border-white/20">
              <CalendarDays className="w-4 h-4 text-indigo-600" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent outline-none text-sm"
              />
            </div>
            <button
              onClick={fetchOneDay}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 bg-black text-white hover:opacity-90 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* サマリー */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Stat icon={<Gauge className="w-5 h-5" />} label={dayjs(date).format("YYYY/MM/DD")} value={`${metrics.score ?? "--"}`} sub="睡眠スコア /100" />
          <Stat icon={<Moon className="w-5 h-5" />} label="Bedtime" value={fmtClock(metrics.bedtime)} sub="就寝時間" />
          <Stat icon={<Sun className="w-5 h-5" />} label="Wake Time" value={fmtClock(metrics.waketime)} sub="起床時間" />
          <Stat icon={<BedDouble className="w-5 h-5" />} label="Total Sleep" value={fmtHm(metrics.total)} sub="実睡眠時間" />
        </div>

        {/* 詳細カード */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Zap className="w-4 h-4" /> Sleep Efficiency
              </div>
              <div className="text-3xl font-semibold">{metrics.efficiency.toFixed(1)}%</div>
            </div>
            <div className="w-full h-2 rounded-full bg-zinc-200/70 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-sky-500"
                style={{ width: `${Math.min(100, Math.max(0, metrics.efficiency))}%` }}
              />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Clock className="w-4 h-4" /> Sleep Latency
              </div>
              <div className="text-3xl font-semibold">{metrics.latencyMin != null ? `${metrics.latencyMin}m` : "—"}</div>
            </div>
            <p className="text-xs text-zinc-500">ベッドに入ってから眠りにつくまで</p>
          </Card>
        </div>

        {/* ステージ3枚 */}
        {/* ステージ4枚 */}
<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
  <Card className="p-6">
    <div className="text-sm text-zinc-500 mb-2">Deep Sleep</div>
    <div className="text-2xl font-semibold">{fmtHm(metrics.deep)}</div>
    <p className="text-xs text-zinc-500 mt-1">深睡眠</p>
  </Card>

  <Card className="p-6">
    <div className="text-sm text-zinc-500 mb-2">REM Sleep</div>
    <div className="text-2xl font-semibold">{fmtHm(metrics.rem)}</div>
    <p className="text-xs text-zinc-500 mt-1">レム睡眠</p>
  </Card>

  <Card className="p-6">
    <div className="text-sm text-zinc-500 mb-2">Light Sleep</div>
    <div className="text-2xl font-semibold">{fmtHm(metrics.light)}</div>
    <p className="text-xs text-zinc-500 mt-1">浅睡眠</p>
  </Card>

  {/* ★ 追加：Awake */}
  <Card className="p-6">
    <div className="text-sm text-zinc-500 mb-2">Awake</div>
    <div className="text-2xl font-semibold">{fmtHm(metrics.awake)}</div>
    <p className="text-xs text-zinc-500 mt-1">覚醒</p>
  </Card>
</div>


        {/* 分布 */}
        {/* Sleep Stages Distribution */}
<Card className="p-6">
  <div className="mb-2 text-sm text-zinc-500">Sleep Stages Distribution</div>

  {/* ✅ Awake + REM + Light + Deep の4色バー */}
  <StackedBar
  awakePct={metrics.awakePct}
  remPct={metrics.remPct}
  lightPct={metrics.lightPct}
  deepPct={metrics.deepPct}
/>

  {/* ✅ 凡例 */}
  <div className="text-xs text-zinc-500 flex items-center gap-3 mt-3">
  <span className="inline-flex items-center gap-1">
    <span className="w-3 h-3 bg-[#6EA7FF] inline-block rounded-sm" />Awake
  </span>
  <span className="inline-flex items-center gap-1">
    <span className="w-3 h-3 bg-[#547BFF] inline-block rounded-sm" />REM
  </span>
  <span className="inline-flex items-center gap-1">
    <span className="w-3 h-3 bg-[#8E62FF] inline-block rounded-sm" />Light
  </span>
  <span className="inline-flex items-center gap-1">
    <span className="w-3 h-3 bg-[#C48BFF] inline-block rounded-sm" />Deep
  </span>
</div>

</Card>


        <p className="mt-8 text-xs text-zinc-500">
          注: Oura API の返値はエンドポイントにより分/秒で異なります。本ダッシュボードでは時間(h)に正規化して表示しています。
        </p>

        {/* フッター */}
        <div className="py-8 text-center text-xs text-zinc-500/70">
          © {new Date().getFullYear()} Sleep Dashboard
        </div>
      </div>
    </main>
  );
}
