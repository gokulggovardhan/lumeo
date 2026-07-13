import type { FeatureEnvironment, Json, ToolStatus } from "@/lib/supabase/database.types";

export type ActionState = {
  ok: boolean;
  message: string;
};

export const successState = (message: string): ActionState => ({ ok: true, message });
export const errorState = (message: string): ActionState => ({ ok: false, message });

const slugPattern = /^[a-z0-9-]+$/;
const routePattern = /^\//;
const allowedStatuses = new Set<ToolStatus>([
  "active",
  "beta",
  "coming_soon",
  "hidden",
  "maintenance",
]);
const allowedEnvironments = new Set<FeatureEnvironment>([
  "production",
  "preview",
  "development",
  "all",
]);
const allowedSettings = new Set([
  "workspace_display_name",
  "support_email",
  "contact_page_enabled",
  "maintenance_mode",
  "public_analytics_enabled",
  "homepage_privacy_message",
  "default_seo_suffix",
]);

export function formString(formData: FormData, key: string, maxLength = 500) {
  const value = formData.get(key);
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function formBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

export function formNumber(formData: FormData, key: string, fallback = 0) {
  const value = Number(formData.get(key));
  return Number.isFinite(value) ? value : fallback;
}

export function validateSlug(value: string) {
  return value.length > 0 && slugPattern.test(value);
}

export function validateRoute(value: string) {
  return value.length > 0 && routePattern.test(value);
}

export function validateToolStatus(value: string): value is ToolStatus {
  return allowedStatuses.has(value as ToolStatus);
}

export function validateEnvironment(value: string): value is FeatureEnvironment {
  return allowedEnvironments.has(value as FeatureEnvironment);
}

export function parseJsonConfig(value: string): { ok: true; value: Json } | { ok: false; message: string } {
  if (!value.trim()) return { ok: true, value: {} };

  try {
    const parsed = JSON.parse(value) as Json;
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      return { ok: false, message: "Config must be a JSON object." };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, message: "Config must be valid JSON." };
  }
}

export function validateAnnouncementSchedule(startsAt: string, endsAt: string) {
  if (!startsAt || !endsAt) return true;
  return new Date(endsAt).getTime() >= new Date(startsAt).getTime();
}

export function validateLinkUrl(value: string) {
  return !value || value.startsWith("/") || value.startsWith("https://");
}

export function validateSeoTitle(value: string) {
  return value.length > 0 && value.length <= 70;
}

export function validateSeoDescription(value: string) {
  return value.length > 0 && value.length <= 170;
}

export function isAllowedSetting(key: string) {
  return allowedSettings.has(key);
}

export function sanitizeEntityId(value: string | null) {
  return value ? value.slice(0, 120) : null;
}
