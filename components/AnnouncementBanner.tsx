"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AnnouncementTone = "information" | "success" | "warning" | "maintenance";

type PublicAnnouncement = {
  title: string;
  message: string;
  tone: AnnouncementTone;
  linkLabel: string | null;
  linkUrl: string | null;
};

const TONES: AnnouncementTone[] = ["information", "success", "warning", "maintenance"];

const TONE_CLASSES: Record<AnnouncementTone, string> = {
  information: "border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[#F0EAD6]",
  success: "border-[var(--border-success)] bg-[var(--surface-success)] text-[var(--text-success)]",
  warning: "border-[#CBA052]/48 bg-[#CBA052]/13 text-[#F0EAD6]",
  maintenance: "border-[var(--border-danger)] bg-[var(--surface-danger)] text-[var(--text-danger)]",
};

function parseAnnouncement(value: unknown): PublicAnnouncement | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.title !== "string" || typeof record.message !== "string") return null;
  const tone = TONES.includes(record.tone as AnnouncementTone) ? (record.tone as AnnouncementTone) : "information";
  return {
    title: record.title,
    message: record.message,
    tone,
    linkLabel: typeof record.link_label === "string" ? record.link_label : null,
    linkUrl: typeof record.link_url === "string" ? record.link_url : null,
  };
}

export function AnnouncementBanner() {
  const pathname = usePathname();
  const [announcements, setAnnouncements] = useState<PublicAnnouncement[]>([]);
  const skip = pathname.startsWith("/admin") || pathname.startsWith("/maintenance");

  useEffect(() => {
    if (skip) return;

    let cancelled = false;

    // Fails open: any error or malformed response just leaves the banner
    // empty -- never blocks or breaks the page it's mounted on.
    async function load() {
      try {
        const { data, error } = await createClient().rpc("get_public_announcements");
        if (cancelled || error || !Array.isArray(data)) return;
        setAnnouncements(data.map(parseAnnouncement).filter((item): item is PublicAnnouncement => item !== null));
      } catch {
        // no-op
      }
    }
    void load();

    return () => {
      cancelled = true;
    };
  }, [skip]);

  if (skip || announcements.length === 0) return null;

  return (
    <div className="space-y-2 px-4 pt-4 sm:px-6">
      {announcements.map((announcement) => (
        <div
          key={announcement.title + announcement.message}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${TONE_CLASSES[announcement.tone]}`}
        >
          <p>
            <span className="font-bold">{announcement.title}</span>
            <span className="ml-2 opacity-80">{announcement.message}</span>
          </p>
          {announcement.linkUrl && announcement.linkLabel ? (
            <Link href={announcement.linkUrl} className="shrink-0 font-semibold underline underline-offset-2">
              {announcement.linkLabel}
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}
