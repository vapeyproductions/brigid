"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";

type Reading = {
  value:number; idx:number; c:number; t:number;
  mean:number; var:number; rms:number;
  bp_0_0p5:number; bp_0p5_1:number; bp_1_2:number; bp_2_3:number;
};
type Contraction = { start:number; end?:number; duration?:number };

export default function ContractionStreamCloud() {
  const [connected, setConnected] = useState(false);
  const [last, setLast] = useState<Reading|null>(null);
  const [events, setEvents] = useState<Contraction[]>([]);
  const activeRef = useRef(false);

  useEffect(() => {
    const es = new EventSource("/api/aio/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      try {
        const r: Reading = JSON.parse(ev.data);
        setLast(r);
        if (r.c === 1 && !activeRef.current) {
          activeRef.current = true;
          setEvents((p) => [...p, { start: Date.now() }]);
        } else if (r.c === 0 && activeRef.current) {
          activeRef.current = false;
          setEvents((p) => {
            const arr = [...p];
            const i = arr.length - 1;
            if (i >= 0 && !arr[i].end) {
              arr[i].end = Date.now();
              arr[i].duration = (arr[i].end! - arr[i].start) / 1000;
            }
            return arr;
          });
        }
      } catch {}
    };
    return () => es.close();
  }, []);

  const fiveOneOne = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    const recent = events.filter(e => (e.end ?? e.start) >= cutoff);
    if (recent.length < 2) return { ok:false, msg:"Collecting data…" };

    const intervals = recent.slice(1).map((e, i) => (e.start - recent[i].start) / 1000);
    const avgInt = intervals.reduce((a,b)=>a+b,0)/intervals.length;
    const durs = recent.filter(e=>e.duration!=null).map(e=>e.duration!);
    const avgDur = durs.length ? durs.reduce((a,b)=>a+b,0)/durs.length : 0;

    const ok = avgInt <= 5*60 && avgDur >= 60 && recent.length >= 6;
    return { ok, msg: ok ? "Meets ~5-1-1" :
      `Avg interval ${(avgInt/60).toFixed(1)}m · avg duration ${avgDur.toFixed(0)}s` };
  }, [events]);

  return (
    <div className="p-4 border rounded-2xl space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Contraction Monitor (Cloud)</h3>
        <span className={connected ? "text-green-600" : "text-red-600"}>
          {connected ? "Live" : "Offline"}
        </span>
      </div>

      <div className="text-sm">
        {last ? <>idx {last.idx.toFixed(3)} · {last.c ? "✅ contraction" : "—"}</> : "Waiting…"}
      </div>

      <div className="text-sm">
        <b>5-1-1:</b> {fiveOneOne.msg} {fiveOneOne.ok && "✅"}
      </div>

      <div>
        <h4 className="font-medium mb-1">Recent contractions</h4>
        <ul className="text-sm max-h-40 overflow-auto">
          {events.slice(-10).map((e, i) => (
            <li key={i}>
              {new Date(e.start).toLocaleTimeString()} — {e.duration ? `${e.duration.toFixed(0)}s` : "…"}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
