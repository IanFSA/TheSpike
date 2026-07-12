export type TrafficIncident = {
  id: string; fingerprint: string; source: "api" | "listener"; sourceName: string; incidentType: string; description: string;
  roadName: string; roadCrossing: string; location: string; region: string; heading: string;
  sourceCreatedAt: string | null; sourceModifiedAt: string | null; receivedAt: string; lastSeenAt: string;
  listenerName?: string; verified: boolean; expiresAt?: string; priority: number;
  severity: "routine" | "major" | "critical"; status: "active" | "updated" | "resolved";
};

export type TrafficReport = {
  id: string; version: number; headline: string; bulletin: string; natashaHeadline: string; closer: string;
  incidentIds: string[]; createdAt: string; sourceCheckedAt: string; generatedBy: "openai" | "fallback";
  generationKind: "scheduled" | "manual" | "test"; status: "draft" | "published" | "superseded";
  manuallyEdited: boolean; publishedAt: string | null; publishedBy: string | null;
  model: string | null; inputTokens: number; outputTokens: number; totalTokens: number;
  generationMs: number; errorMessage: string | null; readAt: string | null; readBy: string | null;
};

export type TrafficSnapshot = { id: string; checkedAt: string; incidentCount: number; meaningfulChanges: number; incidents: TrafficIncident[] };
export type TrafficWorkspace = { authenticated: boolean; draft: TrafficReport | null; published: TrafficReport | null; updatedDraft: TrafficReport | null; latestTest: TrafficReport | null; snapshot: TrafficSnapshot | null; lastRead: {reportId:string;readAt:string}|null; pendingGeneration:boolean; pendingChangeCount:number; pendingSince:string|null; lastSuccessfulCheckAt: string | null; lastCheckError: string | null; lastCheckErrorAt: string | null; lastGenerationError: string | null; lastGenerationErrorAt: string | null };

export type ListenerInput = { roadName: string; roadCrossing: string; location: string; heading: string; incidentType: string; description: string; listenerName: string; minutesActive: number; verified: boolean };
