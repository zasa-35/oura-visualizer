"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { z } from "zod";

const RespSchema = z.object({
  sleep: z.object({ data: z.array(z.any()) }).optional(),
  daily: z.object({ data: z.array(z.any()) }).optional(),
});
type Resp = z.infer<typeof RespSchema>;

export default function Home() {
  const [start, setStart] = useState(dayjs().subtract(13, "day").format("YYYY-MM-DD"));
  const [end, setEnd] = useState(dayjs().format("YYYY-MM-DD"));
  const [resp, setResp] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const chartData = useMemo(() => {
    const d = resp?.daily?.data ?? [];
    return d.map((v: any) => ({
      date: v.day,
      hours: (v.total_sleep_duration ?? 0) / 3600,
      rem_h: (v.rem_sleep_duration ?? 0) / 3600,
      deep_h: (v.deep_sleep_duration ?? 0) / 3600,
      efficiency: (v.efficiency ?? 0) * 100,
    }));
  }, [resp]);

  const fetchData = async () => {
    setLoading(true); setErr(null); setMsg(null);
    try {
      const r = await fetch(`/api/oura/sleep?start=${start}&end=${end}`);
      const j = await r.json();
      const p = RespSchema.safeParse(j);
      if (!p.success) throw new Error("Unexpected response");
      setResp(p.data);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!resp) return;
    try {
      await addDoc(collection(db, "sleep_snapshots"), {
        start, end, payload: resp, createdAt: serverTimestamp(),
      });
      setMsg("Firestoreに保存しました（sleep_snapshots）");
    } catch (e: any) {
      setErr(e?.message ?? "Firestore保存に失敗しました");
    }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <main className="min-h-dvh p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Oura睡眠ダッシュボード</h1>

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <label className="flex items-center gap-2">
          <span>開始日</span>
          <input type="date" value={start} onChange={(e)=>setStart(e.target.value)} className="border rounded px-2 py-1" />
        </label>
        <label className="flex items-center gap-2">
          <span>終了日</span>
          <input type="date" value={end} onChange={(e)=>setEnd(e.target.value)} className="border rounded px-2 py-1" />
        </label>
        <button onClick={fetchData} disabled={loading} className="px-3 py-2 rounded bg-black text-white">
          {loading ? "取得中..." : "データ取得"}
        </button>
        <button onClick={save} disabled={!resp} className="px-3 py-2 rounded border">
          Firestoreに保存
        </button>
      </div>

      {err && <p className="text-red-600 mb-2">エラー: {err}</p>}
      {msg && <p className="text-green-700 mb-2">{msg}</p>}

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis yAxisId="left" />
            <Tooltip />
            <Legend />
            <Area yAxisId="left" type="monotone" dataKey="hours" name="総睡眠(時間)" fillOpacity={0.3} />
            <Area yAxisId="left" type="monotone" dataKey="rem_h" name="REM(時間)" fillOpacity={0.3} />
            <Area yAxisId="left" type="monotone" dataKey="deep_h" name="深い睡眠(時間)" fillOpacity={0.3} />
            <Area yAxisId="left" type="monotone" dataKey="efficiency" name="効率(%)" fillOpacity={0.15} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="text-sm mt-3 text-gray-600">
        注: *_duration は秒、efficiency は 0〜1。表示は時間/％に変換。
      </p>
    </main>
  );
}
