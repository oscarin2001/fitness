// Deprecated endpoint: prefer /api/account/meal-plan?date=YYYY-MM-DD
// Keeping a minimal handler so build/type generation does not fail.
import { NextResponse } from 'next/server';

export async function GET() {
	return NextResponse.json({
		deprecated: true,
		message: 'Use /api/account/meal-plan?date=YYYY-MM-DD en lugar de /api/account/daily-plan'
	}, { status: 410 }); // 410 Gone
}

export const dynamic = 'force-static';

