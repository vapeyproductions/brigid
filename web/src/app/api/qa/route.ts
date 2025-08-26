import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const question = (body?.question ?? '').toString().trim();

    if (!question) {
      return NextResponse.json({ error: 'No question provided.' }, { status: 400 });
    }

    const system = [
      'You are a cautious, non-diagnostic assistant for pregnancy education.',
      'Use simple, supportive language (6th–8th grade).',
      'Answer briefly (<=120 words).',
      'Do NOT give medical advice or instructions. Do NOT provide diagnoses.',
      "Always end with: ‘If you’re concerned, contact your clinician or go to Labor & Delivery.’"
    ].join(' ');

    const res = await fetch(`${process.env.AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {})
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL_ID,     // e.g., gpt-oss-20b-mlx or phi3:mini
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: question }
        ],
        max_tokens: 160,
        temperature: 0.2
      })
    });

    if (!res.ok) {
      const msg = await res.text();
      console.error('QA AI error:', res.status, msg);
      return NextResponse.json({ error: msg || 'AI server error' }, { status: 500 });
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? 'No response.';
    return NextResponse.json({ answer: content });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
