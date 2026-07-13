import type { AdminRole } from "@/lib/admin/types";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ToolStatus = "active" | "beta" | "coming_soon" | "hidden" | "maintenance";
export type FeatureEnvironment = "production" | "preview" | "development" | "all";
export type AnnouncementTone = "information" | "success" | "warning" | "maintenance";
export type SizeBucket =
  | "under_1mb"
  | "1mb_to_5mb"
  | "5mb_to_20mb"
  | "20mb_to_50mb"
  | "over_50mb"
  | "unknown";
export type DeviceClass = "desktop" | "tablet" | "mobile" | "unknown";

export type ToolCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PdfTool = {
  id: string;
  slug: string;
  category_id: string | null;
  name: string;
  short_description: string;
  route: string;
  icon_key: string;
  status: ToolStatus;
  is_enabled: boolean;
  is_homepage_eligible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type HomepageToolSlot = {
  slot_number: number;
  tool_id: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type FeatureFlag = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  environment: FeatureEnvironment;
  config: Json;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SiteSetting = {
  key: string;
  value: Json;
  description: string | null;
  is_public: boolean;
  updated_by: string | null;
  updated_at: string;
};

export type Announcement = {
  id: string;
  title: string;
  message: string;
  tone: AnnouncementTone;
  link_label: string | null;
  link_url: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SeoSetting = {
  route: string;
  title: string;
  description: string;
  canonical_path: string | null;
  robots_index: boolean;
  robots_follow: boolean;
  open_graph_title: string | null;
  open_graph_description: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type AuditLog = {
  id: number;
  actor_user_id: string | null;
  actor_role: AdminRole | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  changes: Json | null;
  created_at: string;
};

export type AnalyticsEvent = {
  id: number;
  event_name: string;
  tool_slug: string | null;
  anonymous_session_id: string | null;
  occurred_at: string;
  duration_ms: number | null;
  input_size_bucket: SizeBucket | null;
  output_size_bucket: SizeBucket | null;
  device_class: DeviceClass | null;
  browser_family: string | null;
  operating_system: string | null;
  country_code: string | null;
  success: boolean | null;
  error_code: string | null;
  metadata: Json;
};

export type DailyToolMetric = {
  metric_date: string;
  tool_slug: string;
  tool_opens: number;
  processing_started: number;
  processing_succeeded: number;
  processing_failed: number;
  total_duration_ms: number;
};

export type ControlCenterDatabase = {
  public: {
    Tables: {
      tool_categories: { Row: ToolCategory };
      pdf_tools: { Row: PdfTool };
      homepage_tool_slots: { Row: HomepageToolSlot };
      feature_flags: { Row: FeatureFlag };
      site_settings: { Row: SiteSetting };
      announcements: { Row: Announcement };
      seo_settings: { Row: SeoSetting };
      audit_logs: { Row: AuditLog };
      analytics_events: { Row: AnalyticsEvent };
      daily_tool_metrics: { Row: DailyToolMetric };
    };
    Functions: {
      current_admin_role: { Args: Record<string, never>; Returns: AdminRole | null };
      is_active_admin: { Args: Record<string, never>; Returns: boolean };
      can_manage_content: { Args: Record<string, never>; Returns: boolean };
      is_owner: { Args: Record<string, never>; Returns: boolean };
      write_audit_log: {
        Args: {
          action: string;
          entity_type: string;
          entity_id: string | null;
          summary: string;
          changes: Json | null;
        };
        Returns: number;
      };
    };
  };
};
