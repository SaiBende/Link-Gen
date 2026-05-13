import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      api: "running",
      redirect: "check redirect-engine on port 4000",
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { error?: string; stack?: string };

  const timestamp = new Date().toISOString();
  console.error(JSON.stringify({
    timestamp,
    level: "error",
    service: "global-error-handler",
    message: body.error,
    stack: body.stack,
  }));

  return NextResponse.json({ received: true });
}