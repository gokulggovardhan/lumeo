import { AuraNotice } from "@/components/ui/Aura";

const STATUS_COPY: Record<string, { title: string; fallback: string; tone: "warning" | "info" | "unavailable" }> = {
  maintenance: {
    title: "Undergoing maintenance",
    fallback: "This tool is temporarily paused for maintenance or an upgrade. Please check back shortly.",
    tone: "warning",
  },
  coming_soon: {
    title: "Coming soon",
    fallback: "This tool isn't live yet -- it's on the way.",
    tone: "info",
  },
  hidden: {
    title: "Temporarily unavailable",
    fallback: "This tool isn't available right now. Please check back later.",
    tone: "unavailable",
  },
};

// Rendered on a tool's own page (app/pdf/<slug>/page.tsx) in place of the
// live workspace whenever the admin console has that action's status set to
// anything other than active/beta, or has disabled it outright. Message
// text is whatever the admin typed into the tool's maintenance message
// field; falls back to sensible default copy per status when left blank.
export function ToolMaintenanceNotice({
  status,
  message,
}: {
  status: string;
  message?: string | null;
}) {
  const copy = STATUS_COPY[status] ?? STATUS_COPY.maintenance;
  const trimmedMessage = message?.trim();

  return (
    <div className="lumeo-fade-up lumeo-fade-up-delay-1 mx-auto max-w-2xl py-10">
      <AuraNotice tone={copy.tone} title={copy.title}>
        {trimmedMessage || copy.fallback}
      </AuraNotice>
    </div>
  );
}
