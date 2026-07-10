import { createClient } from "@supabase/supabase-js";
import { priorityFor } from "@/app/lib/traffic-source";
import type { ListenerInput, TrafficIncident, TrafficReport } from "@/app/types/traffic";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

type ReportRow = {
  id: string; headline: string; bulletin: string; natasha_headline: string; closer: string;
  incident_ids: string[]; created_at: string; source_checked_at: string; generated_by: "openai" | "fallback"; published: boolean;
};

function toReport(row: ReportRow): TrafficReport {
  return { id: row.id, headline: row.headline, bulletin: row.bulletin, natashaHeadline: row.natasha_headline, closer: row.closer, incidentIds: row.incident_ids || [], createdAt: row.created_at, sourceCheckedAt: row.source_checked_at, generatedBy: row.generated_by };
}

export async function getLatestReport() {
  const supabase = client();
  if (!supabase) return null;
  const { data } = await supabase.from("traffic_reports").select("*").eq("published", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? toReport(data as ReportRow) : null;
}

export async function saveLatestReport(report: TrafficReport) {
  const supabase = client();
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("traffic_reports").insert({
    id: report.id, headline: report.headline, bulletin: report.bulletin, natasha_headline: report.natashaHeadline,
    closer: report.closer, incident_ids: report.incidentIds, source_checked_at: report.sourceCheckedAt,
    generated_by: report.generatedBy, published: true, created_at: report.createdAt
  });
  if (error) throw error;
}

export async function getListeners(): Promise<TrafficIncident[]> {
  const supabase = client();
  if (!supabase) return [];
  const { data } = await supabase.from("traffic_listener_reports").select("*").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
  return (data || []).map((row) => ({
    id: `listener-${row.id}`, source: "listener" as const, incidentType: row.incident_type, description: row.description,
    roadName: row.road_name, roadCrossing: row.road_crossing || "", location: row.location || "", region: "GAUTENG",
    heading: row.heading || "", createdAt: row.created_at, modifiedAt: row.updated_at || row.created_at,
    listenerName: row.listener_name || "", verified: Boolean(row.verified), expiresAt: row.expires_at,
    priority: priorityFor(row.incident_type, row.description) + 2
  }));
}

export async function addListener(input: ListenerInput) {
  const supabase = client();
  if (!supabase) throw new Error("Supabase is not configured");
  const expiresAt = new Date(Date.now() + Math.min(Math.max(input.minutesActive || 60, 10), 180) * 60_000).toISOString();
  const { data, error } = await supabase.from("traffic_listener_reports").insert({
    road_name: input.roadName, road_crossing: input.roadCrossing, location: input.location, heading: input.heading,
    incident_type: input.incidentType, description: input.description, listener_name: input.listenerName,
    verified: input.verified, expires_at: expiresAt
  }).select("*").single();
  if (error) throw error;
  return (await getListeners()).find((item) => item.id === `listener-${data.id}`)!;
}
