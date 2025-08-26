import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const stats = body?.stats ?? {
      last10Count: 0,
      last24Count: 0,
      medianIntervalSec: null as number | null,
      medianDurationSec: null as number | null,
    };

    const system = [
      'You are a careful, non-diagnostic assistant for pregnancy education.',
      'Use simple, supportive language (6th–8th grade).',
      'Summarize the user’s contraction activity in <=120 words.',
      'Do NOT give medical advice.',
      "Always close with: ‘If you’re concerned, contact your clinician or go to Labor & Delivery.’",
    ].join(' ');

    const user = `Contraction stats:
- Last 10 minutes: ${stats.last10Count}
- Last 24 hours: ${stats.last24Count}
- Median interval (sec): ${stats.medianIntervalSec ?? 'N/A'}
- Median duration (sec): ${stats.medianDurationSec ?? 'N/A'}

Write a brief non-diagnostic summary.`;

    const res = await fetch(`${process.env.AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.AI_MODEL_ID, // e.g. gpt-oss-20b-mlx
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 120,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('AI error:', res.status, text); // helpful for debugging
      return NextResponse.json({ error: text || 'AI server error' }, { status: 500 });
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? 'No response from the model.';
    return NextResponse.json({ summary: content });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
