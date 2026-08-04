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

export type AdminAnalyticsSummaryResult = {
  summary: {
    total_events: number;
    unique_visitors: number;
    tool_opens: number;
    processing_started: number;
    processing_succeeded: number;
    processing_failed: number;
    downloads_started: number;
    successful_duration_total_ms: number;
    average_successful_duration_ms: number | null;
    latest_event_at: string | null;
  };
  daily_trend: Array<{
    date: string;
    total_events: number;
    unique_visitors: number;
    tool_opens: number;
    processing_started: number;
    processing_succeeded: number;
    processing_failed: number;
    downloads_started: number;
  }>;
  top_tools_by_opens: Array<{ tool_slug: string; event_count: number }>;
  top_tools_by_success: Array<{ tool_slug: string; event_count: number }>;
  error_summary: Array<{ error_code: string; event_count: number }>;
  device_summary: Array<{ device_class: DeviceClass; event_count: number }>;
  browser_summary: Array<{ browser_family: string; event_count: number }>;
  operating_system_summary: Array<{ operating_system: string; event_count: number }>;
  location_summary: Array<{ city: string | null; region: string | null; country_code: string | null; visitor_count: number }>;
};

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
  maintenance_message: string | null;
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
  rollout_percentage: number;
  activate_at: string | null;
  deactivate_at: string | null;
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

export type ErrorSeverity = "low" | "medium" | "high" | "critical";
export type ErrorStatus = "open" | "resolved" | "ignored";
export type ErrorSource = "client" | "server_action" | "route_handler" | "error_boundary" | "unhandled_rejection";

export type ErrorLog = {
  id: number;
  fingerprint: string;
  severity: ErrorSeverity;
  status: ErrorStatus;
  source: ErrorSource;
  message: string;
  stack: string | null;
  route: string | null;
  component: string | null;
  browser_family: string | null;
  operating_system: string | null;
  device_class: string | null;
  page_url: string | null;
  anonymous_session_id: string | null;
  build_version: string | null;
  git_sha: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

export type FeedbackQueryType = "Query" | "Feedback";

export type FeedbackQuery = {
  id: string;
  type: FeedbackQueryType;
  name: string;
  email: string | null;
  phone: string | null;
  subject: string;
  message: string;
  location: string | null;
  is_read: boolean;
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
      feedback_queries: { Row: FeedbackQuery };
      analytics_events: { Row: AnalyticsEvent };
      daily_tool_metrics: { Row: DailyToolMetric };
      error_logs: { Row: ErrorLog };
    };
    Functions: {
      record_error_event: {
        Args: {
          message: string;
          stack: string | null;
          route: string | null;
          component: string | null;
          source: string;
          severity: string;
          browser_family: string | null;
          operating_system: string | null;
          device_class: string | null;
          page_url: string | null;
          anonymous_session_id: string | null;
          build_version: string | null;
          git_sha: string | null;
        };
        Returns: number;
      };
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
      get_public_analytics_setting: { Args: Record<string, never>; Returns: boolean };
      record_public_analytics_event: {
        Args: {
          event_name: string;
          tool_slug?: string | null;
          anonymous_session_id?: string | null;
          duration_ms?: number | null;
          input_size_bucket?: SizeBucket | null;
          output_size_bucket?: SizeBucket | null;
          device_class?: DeviceClass | null;
          browser_family?: string | null;
          operating_system?: string | null;
          success?: boolean | null;
          error_code?: string | null;
        };
        Returns: number;
      };
      refresh_daily_tool_metrics: {
        Args: { target_date?: string | null };
        Returns: number;
      };
      get_admin_analytics_summary: {
        Args: { p_start_date: string; p_end_date: string };
        Returns: AdminAnalyticsSummaryResult;
      };
      get_public_maintenance_status: {
        Args: Record<string, never>;
        Returns: { enabled: boolean; title: string | null; message: string | null };
      };
      get_public_seo_setting: {
        Args: { p_route: string };
        Returns: {
          title: string;
          description: string;
          canonical_path: string | null;
          robots_index: boolean;
          robots_follow: boolean;
          open_graph_title: string | null;
          open_graph_description: string | null;
        } | null;
      };
      get_public_announcements: {
        Args: Record<string, never>;
        Returns: Array<{
          title: string;
          message: string;
          tone: AnnouncementTone;
          link_label: string | null;
          link_url: string | null;
        }>;
      };
      list_admin_members: {
        Args: Record<string, never>;
        Returns: Array<{
          user_id: string;
          email: string | null;
          role: AdminRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          last_sign_in_at: string | null;
        }>;
      };
      add_admin_member: {
        Args: { p_email: string; p_role: string };
        Returns: { user_id: string; email: string; role: AdminRole };
      };
      update_admin_member: {
        Args: { p_user_id: string; p_role: string; p_is_active: boolean };
        Returns: undefined;
      };
      resolve_admin_emails: {
        Args: { p_user_ids: string[] };
        Returns: Array<{ user_id: string; email: string | null }>;
      };
    };
  };
};