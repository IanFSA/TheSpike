import { STANDARD_CLOSER } from "@/app/lib/traffic-source";
import type { TrafficIncident, TrafficReport } from "@/app/types/traffic";

type Options = { instructions?: string; closer?: string; includeCloser?: boolean };

function fallback(items: TrafficIncident[], options: Options): TrafficReport {
  const lead = items[0];
  const bulletin = items.slice(0, 4).map((item) => {
    const opening = item.source === "listener" && !item.verified ? "A listener is reporting" : "There is";
    return `${opening} ${item.incidentType.toLowerCase()} on ${item.roadName}${item.heading ? ` ${item.heading.toLowerCase()}` : ""}${item.location ? ` near ${item.location}` : ""}. ${item.description}`;
  }).join("\n\n") || "There are no major incidents currently being reported on Gauteng’s main routes.";
  return {
    id: crypto.randomUUID(), headline: lead ? `${lead.incidentType} on ${lead.roadName}` : "No major Gauteng incidents reported",
    bulletin, natashaHeadline: lead ? `TRAFFIC: ${lead.description}` : "TRAFFIC: No major incidents are currently being reported on Gauteng’s main routes.",
    closer: options.includeCloser === false ? "" : options.closer || STANDARD_CLOSER, incidentIds: items.map((item) => item.id),
    createdAt: new Date().toISOString(), sourceCheckedAt: new Date().toISOString(), generatedBy: "fallback"
  };
}

export async function generateTrafficReport(items: TrafficIncident[], options: Options = {}): Promise<TrafficReport> {
  if (!process.env.OPENAI_API_KEY) return fallback(items, options);
  const facts = items.map(({ id, source, incidentType, description, roadName, roadCrossing, location, heading, listenerName, verified }) => ({ id, source, incidentType, description, roadName, roadCrossing, location, heading, listenerName, verified }));
  const schema = { type: "object", additionalProperties: false, properties: { headline: { type: "string" }, bulletin: { type: "string" }, natashaHeadline: { type: "string" }, incidentIds: { type: "array", items: { type: "string" } } }, required: ["headline", "bulletin", "natashaHeadline", "incidentIds"] };
  const input = `Write a concise Gauteng afternoon radio traffic report using only the supplied facts. Prioritise crashes, closures, fires and lane blockages. Exclude ordinary slow-moving traffic. Merge obvious duplicates. Attribute unverified listener information. Never invent delays, causes, lanes or alternative routes. Keep the bulletin conversational and under 60 seconds. Write one straight-news Natasha headline of 10–15 seconds about the single most critical incident. Presenter instructions: ${options.instructions || "Use the most critical incidents first."}\n\nFACTS:\n${JSON.stringify(facts)}`;
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5.4-mini", input, text: { format: { type: "json_schema", name: "traffic_report", strict: true, schema } } }) });
  if (!response.ok) throw new Error(`OpenAI returned ${response.status}`);
  const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const text = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI returned no report text");
  const generated = JSON.parse(text) as Pick<TrafficReport, "headline" | "bulletin" | "natashaHeadline" | "incidentIds">;
  return { ...generated, id: crypto.randomUUID(), closer: options.includeCloser === false ? "" : options.closer || STANDARD_CLOSER, createdAt: new Date().toISOString(), sourceCheckedAt: new Date().toISOString(), generatedBy: "openai" };
}
