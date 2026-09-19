import type { ToolStatus } from "@/lib/supabase/database.types";

export type ActionState = {
  ok: boolean;
  message: string;
};

export const successState = (message: string): ActionState => ({ ok: true, message });
export const errorState = (message: string): ActionState => ({ ok: false, message });

const routePattern = /^\//;
const allowedStatuses = new Set<ToolStatus>([
  "active",
  "beta",
  "coming_soon",
  "hidden",
  "maintenance",
]);
const allowedSettings = new Set([
  "maintenance_mode",
  "public_analytics_enabled",
]);

export function formString(formData: FormData, key: string, maxLength = 500) {
  const value = formData.get(key);
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function formBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}



export function validateRoute(value: string) {
  return value.length > 0 && routePattern.test(value);
}

export function validateToolStatus(value: string): value is ToolStatus {
  return allowedStatuses.has(value as ToolStatus);
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

