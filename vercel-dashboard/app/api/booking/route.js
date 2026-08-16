export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { addBooking, deleteBooking } from '../../../lib/board';

export async function POST(req) {
  try {
    const p = await req.json();
    const out = await addBooking(p);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e.message || 'تعذّر الحفظ' }, { status: 400 });
  }
}

export async function DELETE(req) {
  try {
    const { ref } = await req.json();
    const out = await deleteBooking(ref);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e.message || 'تعذّر الحذف' }, { status: 400 });
  }
}
