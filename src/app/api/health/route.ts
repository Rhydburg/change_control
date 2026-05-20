import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({ message:"Your server is healthy" }, { status: 200 });
}