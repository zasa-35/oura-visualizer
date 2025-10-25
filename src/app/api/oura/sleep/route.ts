// src/app/api/oura/sleep/route.ts
import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.ouraring.com/v2/usercollection";

console.log("OURA token present?", !!process.env.OURA_PERSONAL_ACCESS_TOKEN);

export async function GET(req: NextRequest) {
  const token = process.env.OURA_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Missing OURA token" }, { status: 500 });
  }

  // ?start=YYYY-MM-DD&end=YYYY-MM-DD
  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json({ error: "start/end query required (YYYY-MM-DD)" }, { status: 400 });
  }

  // 例: sleep と daily_sleep を両方取得
  const endpoints = [
    `${BASE}/sleep?start_date=${start}&end_date=${end}`,
    `${BASE}/daily_sleep?start_date=${start}&end_date=${end}`,
  ];

  try {
    const headers = { Authorization: `Bearer ${token}` };
    const [sleepRes, dailyRes] = await Promise.all(endpoints.map(url => fetch(url, { headers })));

    if (!sleepRes.ok) {
      const t = await sleepRes.text();
      return NextResponse.json({ error: "Sleep fetch failed", detail: t }, { status: sleepRes.status });
    }
    if (!dailyRes.ok) {
      const t = await dailyRes.text();
      return NextResponse.json({ error: "Daily sleep fetch failed", detail: t }, { status: dailyRes.status });
    }

    const sleep = await sleepRes.json();
    const daily = await dailyRes.json();

    return NextResponse.json({ sleep, daily }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: "Unexpected error", detail: e?.message }, { status: 500 });
  }
}
