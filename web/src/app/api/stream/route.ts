// app/api/aio/stream/route.ts
export const runtime = "nodejs";
import type { NextRequest } from "next/server";
// If your path alias isn't set, change this to "../../../lib/aio"
import { getAioBus } from "/Users/evamoughan/Projects/brigid/web/src/lib/aio";

export async function GET(req: NextRequest) {
  const bus = getAioBus();
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (d: any) => controller.enqueue(enc.encode(`data: ${JSON.stringify(d)}\n\n`));
      const onReading = (obj: any) => send(obj);

      controller.enqueue(enc.encode(`: ok\n\n`)); // open
      bus.on("reading", onReading);

      const ka = setInterval(() => controller.enqueue(enc.encode(`: ka\n\n`)), 25000);
      const cleanup = () => { clearInterval(ka); bus.off("reading", onReading); try { controller.close(); } catch {} };
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
