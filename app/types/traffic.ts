export type TrafficIncident = {
  id: string;
  source: "api" | "listener";
  incidentType: string;
  description: string;
  roadName: string;
  roadCrossing: string;
  location: string;
  region: string;
  heading: string;
  createdAt: string;
  modifiedAt: string;
  listenerName?: string;
  verified: boolean;
  expiresAt?: string;
  priority: number;
};

export type TrafficReport = {
  id: string;
  headline: string;
  bulletin: string;
  natashaHeadline: string;
  closer: string;
  incidentIds: string[];
  createdAt: string;
  sourceCheckedAt: string;
  generatedBy: "openai" | "fallback";
};

export type ListenerInput = {
  roadName: string;
  roadCrossing: string;
  location: string;
  heading: string;
  incidentType: string;
  description: string;
  listenerName: string;
  minutesActive: number;
  verified: boolean;
};
