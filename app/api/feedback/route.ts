import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { captureServerError, withRouteHandlerCapture } from "@/lib/errors/server";
import {
  formatApproximateLocation,
  readCloudflareApproximateLocation,
} from "@/lib/cloudflare/request-location";

// This route uses only web-standard APIs so vinext can execute it directly in
// the Cloudflare Worker runtime without any platform-specific Edge override.

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+]?[\d\s().-]{7,20}$/;
const allowedTypes = new Set(["Query", "Feedback"]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function trimmed(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

// Approximate city/region/country comes from Cloudflare's inbound Request.cf
// data, with Cloudflare location headers as a fallback. No IP address is read
// or stored and no external geolocation service is called.
function readApproxLocation(request: NextRequest) {
  return formatApproximateLocation(readCloudflareApproximateLocation(request));
}

export const POST = withRouteHandlerCapture("/api/feedback", async (request: NextRequest) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const data = body as Record<string, unknown>;

  // Honeypot: a real visitor never fills this. Pretend success so a bot
  // doesn't learn anything from the response.
  if (trimmed(data.companyWebsite, 200) !== "") {
    return NextResponse.json({ ok: true });
  }

  const type = trimmed(data.type, 20);
  const name = trimmed(data.name, 150);
  const email = trimmed(data.email, 254);
  const phone = trimmed(data.phone, 30);
  const subject = trimmed(data.subject, 150);
  const message = trimmed(data.message, 2000);
  const anonymousSessionId =
    typeof data.anonymousSessionId === "string" &&
    uuidPattern.test(data.anonymousSessionId)
      ? data.anonymousSessionId
      : null;

  if (!allowedTypes.has(type)) return NextResponse.json({ ok: false, message: "Choose Query or Feedback." }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, message: "Name is required." }, { status: 400 });
  if (!subject) return NextResponse.json({ ok: false, message: "Subject is required." }, { status: 400 });
  if (!message) return NextResponse.json({ ok: false, message: "Message is required." }, { status: 400 });
  if (email && !emailPattern.test(email)) return NextResponse.json({ ok: false, message: "Enter a valid email." }, { status: 400 });
  if (phone && !phonePattern.test(phone)) return NextResponse.json({ ok: false, message: "Enter a valid phone number." }, { status: 400 });

  const location = readApproxLocation(request);

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_feedback_query", {
    p_type: type,
    p_name: name,
    p_subject: subject,
    p_message: message,
    p_email: email || null,
    p_phone: phone || null,
    p_location: location,
    p_anonymous_session_id: anonymousSessionId,
  });

  if (error) {
    if (/rate limit/i.test(error.message)) {
      return NextResponse.json(
        { ok: false, message: "Too many messages. Please try again later." },
        { status: 429 },
      );
    }

    console.error("feedback insert failed:", error.message);
    void captureServerError({
      message: `feedback insert failed: ${error.message}`,
      route: "/api/feedback",
      source: "route_handler",
      severity: "medium",
    });
    return NextResponse.json({ ok: false, message: "Could not send your message." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
});
