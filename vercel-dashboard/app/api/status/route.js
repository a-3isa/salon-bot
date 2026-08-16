export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { setStatus } from '../../../lib/board';

export async function POST(req) {
  try {
    const { ref, done } = await req.json();
    const out = await setStatus(ref, !!done);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e.message || 'تعذّر الحفظ' }, { status: 400 });
  }
}
