import { NextRequest, NextResponse } from "next/server";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError) {
    return renderMessagePage(
      "Google Drive connection failed",
      `Google returned: ${escapeHtml(oauthError)}`,
      400,
    );
  }

  if (!clientId || !clientSecret || !redirectUri) {
    return renderMessagePage(
      "Google Drive connection is not configured",
      "Missing one or more required Google Drive OAuth environment variables.",
      500,
    );
  }

  if (!code) {
    return renderMessagePage(
      "Google Drive connection failed",
      "Missing authorization code.",
      400,
    );
  }

  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenPayload = (await tokenResponse.json()) as {
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok) {
      console.error("Google Drive OAuth token exchange failed", tokenPayload);

      return renderMessagePage(
        "Google Drive connection failed",
        "Could not exchange the authorization code for tokens.",
        500,
      );
    }

    if (!tokenPayload.refresh_token) {
      console.error("Google Drive OAuth response did not include refresh_token");

      return renderMessagePage(
        "No refresh token returned",
        "Try connecting again. The OAuth consent screen must use prompt=consent and access_type=offline.",
        500,
      );
    }

    return new NextResponse(renderRefreshTokenPage(tokenPayload.refresh_token), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Google Drive OAuth callback error", error);

    return renderMessagePage(
      "Google Drive connection failed",
      "Unexpected error while connecting Google Drive.",
      500,
    );
  }
}

function renderMessagePage(title: string, message: string, status: number) {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #07050d; color: #fff; font-family: Arial, sans-serif; }
      main { max-width: 720px; padding: 32px; }
      p { color: rgba(255,255,255,.72); line-height: 1.6; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${message}</p>
    </main>
  </body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

function renderRefreshTokenPage(refreshToken: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Google Drive connected</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #07050d; color: #fff; font-family: Arial, sans-serif; }
      main { width: min(860px, calc(100vw - 32px)); border: 1px solid rgba(255,255,255,.12); border-radius: 24px; background: rgba(255,255,255,.06); padding: 32px; box-shadow: 0 24px 80px rgba(0,0,0,.35); }
      p { color: rgba(255,255,255,.72); line-height: 1.6; }
      pre { white-space: pre-wrap; overflow-wrap: anywhere; border-radius: 16px; background: rgba(0,0,0,.45); padding: 20px; color: #bbf7d0; }
      .warning { border: 1px solid rgba(251,191,36,.25); border-radius: 16px; background: rgba(251,191,36,.12); padding: 16px; color: #fde68a; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <h1>Google Drive connected</h1>
      <p class="warning">Copy this to Vercel as GOOGLE_DRIVE_REFRESH_TOKEN. Do not share it.</p>
      <pre>${escapeHtml(refreshToken)}</pre>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
