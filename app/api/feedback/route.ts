import { NextResponse, type NextRequest } from "next/server";
import { geolocation } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { captureServerError, withRouteHandlerCapture } from "@/lib/errors/server";

// Edge runtime: cold starts are dramatically faster here than Node.js
// serverless (the prior default), which is what made submissions take
// several seconds. Nothing in this route uses a Node-only API.
export const runtime = "edge";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+]?[\d\s().-]{7,20}$/;
const allowedTypes = new Set(["Query", "Feedback"]);

function trimmed(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

// City/region only, via Vercel's own geolocation() helper (the currently
// recommended way to read this -- more robust than parsing x-vercel-ip-*
// headers by hand). No IP address is ever read or stored, no external
// geolocation service is called. Returns nothing outside Vercel deployments
// (e.g. local dev), which is expected.
function readApproxLocation(request: NextRequest) {
  const { city, countryRegion, country } = geolocation(request);
  const parts = [city, countryRegion, country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
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

  if (!allowedTypes.has(type)) return NextResponse.json({ ok: false, message: "Choose Query or Feedback." }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, message: "Name is required." }, { status: 400 });
  if (!subject) return NextResponse.json({ ok: false, message: "Subject is required." }, { status: 400 });
  if (!message) return NextResponse.json({ ok: false, message: "Message is required." }, { status: 400 });
  if (email && !emailPattern.test(email)) return NextResponse.json({ ok: false, message: "Enter a valid email." }, { status: 400 });
  if (phone && !phonePattern.test(phone)) return NextResponse.json({ ok: false, message: "Enter a valid phone number." }, { status: 400 });

  const location = readApproxLocation(request);

  const supabase = await createClient();
  const { error } = await supabase.from("feedback_queries").insert({
    type,
    name,
    email: email || null,
    phone: phone || null,
    subject,
    message,
    location,
  });

  if (error) {
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
