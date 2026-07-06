import { NextResponse } from "next/server";

export function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(error: string, status: number, code?: string) {
  return NextResponse.json({ error, code }, { status });
}
