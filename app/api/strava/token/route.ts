import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      throw new Error(`Strava API error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json({
      access_token: data.access_token,
      athlete: data.athlete,
    });
  } catch (error) {
    console.error("Token exchange error:", error);
    return NextResponse.json({ error: "Failed to exchange code for token" }, { status: 500 });
  }
}
