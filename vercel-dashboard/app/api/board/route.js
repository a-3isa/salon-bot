export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getBoardData } from '../../../lib/board';

export async function GET(req) {
  try {
    const date = req.nextUrl.searchParams.get('date') || null;
    const data = await getBoardData(date);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e.message || 'خطأ في الخادم' }, { status: 500 });
  }
}
