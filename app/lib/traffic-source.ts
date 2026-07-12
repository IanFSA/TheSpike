import type { TrafficIncident } from "@/app/types/traffic";

type RawTraffic = Record<string, unknown>;
export const STANDARD_CLOSER = "";

export function parseTrafficDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const local = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  const date = local ? new Date(`${local[3]}-${local[2]}-${local[1]}T${local[4]}:${local[5]}:${local[6]}+02:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const clean = (value: unknown) => String(value || "").trim();
const keyText = (value: string) => value.toLowerCase().replace(/\b(the|a|an)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
export function priorityFor(type: string, description: string) {
  const text = `${type} ${description}`.toLowerCase();
  if (/fatal|serious crash|collision|crash|accident/.test(text)) return 100;
  if (/road closed|closure|closed/.test(text)) return 94;
  if (/fire|smoke|major obstruction|multiple lanes|lane blocked/.test(text)) return 86;
  if (/stationary vehicle|obstruction/.test(text)) return 58;
  if (/major delay|severe congestion/.test(text)) return 72;
  if (/roadworks/.test(text)) return 45;
  if (/slow moving|congestion|queuing/.test(text)) return 25;
  return 40;
}
export function isClosure(item: TrafficIncident) { return /closed|closure/i.test(`${item.incidentType} ${item.description}`); }
export function isRoutineSlowTraffic(item: TrafficIncident) { return /slow moving|congestion|queuing/i.test(`${item.incidentType} ${item.description}`) && item.priority < 70; }
export function isRoutineStationary(item: TrafficIncident) { return /stationary vehicle/i.test(`${item.incidentType} ${item.description}`) && !/blocked|obstruction|delay|closed/i.test(item.description); }
export function isMajorRoute(item: TrafficIncident) { return /^(N1|N3|N12|N14|M1|M2|R21|R24|R28|R59)\b/i.test(item.roadName.trim()); }
export function incidentFingerprint(item: Pick<TrafficIncident,"roadName"|"heading"|"location"|"roadCrossing"|"incidentType">) {
  const value=[item.roadName,item.heading,item.location,item.roadCrossing,item.incidentType].map(keyText).join("|");let hash=2166136261;for(let index=0;index<value.length;index++){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619)}return `incident-${(hash>>>0).toString(16).padStart(8,"0")}`;
}

function normalize(raw: RawTraffic, receivedAt: string): TrafficIncident {
  const incidentType = clean(raw.IncidentType) || "Other", description = clean(raw.Description);
  const base = { roadName: clean(raw.RoadName), heading: clean(raw.Heading), location: clean(raw.Location), roadCrossing: clean(raw.RoadCrossing || raw.IntesectionRoadCrossing), incidentType };
  const priority = priorityFor(incidentType, description), fingerprint = incidentFingerprint(base);
  return { id: `api-${clean(raw.Counter) || fingerprint.slice(0,16)}`, fingerprint, source:"api", sourceName:clean(raw.SourceName||raw.Source||raw.Provider)||"TrafficSA", ...base, description,
    region: clean(raw.Region), sourceCreatedAt: parseTrafficDate(raw.CreateDate)?.toISOString() || null,
    sourceModifiedAt: parseTrafficDate(raw.DateModified)?.toISOString() || null, receivedAt, lastSeenAt: receivedAt,
    verified:true, priority, severity: priority >= 85 ? "critical" : priority >= 65 ? "major" : "routine", status:"active" };
}

export async function fetchTrafficSA() {
  const username=process.env.TRAFFICSA_USERNAME, password=process.env.TRAFFICSA_PASSWORD;
  if (!username || !password) throw new Error("TrafficSA credentials are not configured");
  const response=await fetch(process.env.TRAFFICSA_URL || "https://hotfm.v1.api.trafficsa.co.za/api/latest", {headers:{Authorization:`Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`},cache:"no-store"});
  if (!response.ok) throw new Error(`TrafficSA returned ${response.status}`);
  const receivedAt=new Date().toISOString(), data=await response.json() as RawTraffic[];
  const unique=new Map<string,TrafficIncident>();
  for (const raw of data) { if (clean(raw.Region).toUpperCase()!=="GAUTENG" || Number(raw.OnOff)!==1) continue; const item=normalize(raw,receivedAt); const old=unique.get(item.fingerprint); if(!old || (item.sourceModifiedAt||"")>(old.sourceModifiedAt||"")) unique.set(item.fingerprint,item); }
  return Array.from(unique.values()).sort((a,b)=>b.priority-a.priority || (b.sourceModifiedAt||b.receivedAt).localeCompare(a.sourceModifiedAt||a.receivedAt));
}

export function mergeSnapshotIncidents(previous:TrafficIncident[],current:TrafficIncident[],seenAt:string){const before=new Map(previous.map(i=>[i.fingerprint,i]));return current.map(item=>{const old=before.get(item.fingerprint);return{...item,receivedAt:old?.receivedAt||item.receivedAt,lastSeenAt:seenAt,status:old&&old.description!==item.description?"updated" as const:"active" as const}})}
export function isExpiredListener(item:TrafficIncident,now=Date.now()){return item.source==="listener"&&Boolean(item.expiresAt)&&new Date(item.expiresAt!).getTime()<=now}
export function filterIncidentsByWindow(items:TrafficIncident[],minutes:number,now=Date.now()){return items.filter(item=>!isExpiredListener(item,now)).filter(item=>{if(item.status==="active"&&(item.severity==="critical"||isClosure(item)))return true;if(minutes===0)return item.status==="active";const basis=item.sourceModifiedAt||item.sourceCreatedAt||item.receivedAt;return now-new Date(basis).getTime()<=minutes*60_000})}
export function selectRelevant(items: TrafficIncident[], max=Number.POSITIVE_INFINITY,includeUnverified=false) { const seen=new Set<string>();return items.filter(i=>!isExpiredListener(i)).filter(i=>includeUnverified||i.source!=="listener"||i.verified).filter(i=>!isRoutineStationary(i)).filter(i=>!isRoutineSlowTraffic(i)||isMajorRoute(i)||/major|severe|heavy|significant|delay/i.test(i.description)).sort((a,b)=>(Number(b.source==="api")+Number(b.verified))-(Number(a.source==="api")+Number(a.verified))||(b.sourceModifiedAt||b.receivedAt).localeCompare(a.sourceModifiedAt||a.receivedAt)||b.priority-a.priority).filter(i=>{if(seen.has(i.fingerprint))return false;seen.add(i.fingerprint);return true}).sort((a,b)=>b.priority-a.priority||(isMajorRoute(b)?1:0)-(isMajorRoute(a)?1:0)).slice(0,max); }

export function detectMeaningfulChanges(previous: TrafficIncident[], current: TrafficIncident[]) {
  const before=new Map(previous.map(i=>[i.fingerprint,i])), after=new Map(current.map(i=>[i.fingerprint,i])); const changes:string[]=[];
  for (const item of current) { const old=before.get(item.fingerprint); if (!old && (item.priority>=65 || isClosure(item))) changes.push(`new:${item.fingerprint}`); else if(old && (Math.abs(old.priority-item.priority)>=20 || keyText(old.description)!==keyText(item.description) && item.priority>=65)) changes.push(`updated:${item.fingerprint}`); }
  for (const item of previous) if(!after.has(item.fingerprint) && item.priority>=65) changes.push(`resolved:${item.fingerprint}`);
  return changes;
}
