import type { TrafficIncident } from "@/app/types/traffic";

type RawTraffic = Record<string, unknown>;

export const STANDARD_CLOSER = "If you have anything else to let us know about, send us a WhatsApp message to 083 453 1027.";

export function parseTrafficDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute, second] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+02:00`);
}

export function priorityFor(type: string, description: string) {
  const text = `${type} ${description}`.toLowerCase();
  if (/fatal|serious crash|collision|crash|accident/.test(text)) return 100;
  if (/road closed|closure|closed/.test(text)) return 92;
  if (/fire|smoke|hazard/.test(text)) return 86;
  if (/stationary vehicle|obstruction|lane blocked/.test(text)) return 72;
  if (/bus service|public transport|suspended/.test(text)) return 66;
  if (/roadworks/.test(text)) return 45;
  if (/traffic lights/.test(text)) return 25;
  if (/slow moving|congestion|queuing/.test(text)) return 10;
  return 40;
}

export function isRoutineSlowTraffic(item: TrafficIncident) {
  return /slow moving|congestion|queuing traffic/i.test(`${item.incidentType} ${item.description}`)
    && !/crash|accident|collision|closed|fire|smoke|blocked/i.test(item.description);
}

function normalize(raw: RawTraffic): TrafficIncident {
  const description = String(raw.Description || "").trim();
  const incidentType = String(raw.IncidentType || "Other").trim();
  return {
    id: `api-${String(raw.Counter || `${raw.RoadName}-${raw.DateModified}`)}`,
    source: "api",
    incidentType,
    description,
    roadName: String(raw.RoadName || "").trim(),
    roadCrossing: String(raw.RoadCrossing || raw.IntesectionRoadCrossing || "").trim(),
    location: String(raw.Location || "").trim(),
    region: String(raw.Region || "").trim(),
    heading: String(raw.Heading || "").trim(),
    createdAt: String(raw.CreateDate || ""),
    modifiedAt: String(raw.DateModified || ""),
    verified: true,
    priority: priorityFor(incidentType, description)
  };
}

export async function fetchTrafficSA() {
  const username = process.env.TRAFFICSA_USERNAME;
  const password = process.env.TRAFFICSA_PASSWORD;
  const url = process.env.TRAFFICSA_URL || "https://hotfm.v1.api.trafficsa.co.za/api/latest";
  if (!username || !password) throw new Error("TrafficSA credentials are not configured");
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`TrafficSA returned ${response.status}`);
  const data = await response.json() as RawTraffic[];
  return data
    .filter((item) => String(item.Region || "").toUpperCase() === "GAUTENG" && Number(item.OnOff) === 1)
    .map(normalize)
    .sort((a, b) => b.priority - a.priority || (parseTrafficDate(b.modifiedAt)?.getTime() || 0) - (parseTrafficDate(a.modifiedAt)?.getTime() || 0));
}

export function selectRelevant(items: TrafficIncident[], max = 8) {
  const now = Date.now();
  return items
    .filter((item) => !isRoutineSlowTraffic(item))
    .filter((item) => item.source === "listener" || (parseTrafficDate(item.modifiedAt)?.getTime() || 0) > now - 6 * 60 * 60 * 1000 || item.priority >= 85)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, max);
}
