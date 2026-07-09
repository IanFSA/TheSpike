export type Person = {
  id: string;
  room_name: string;
  name: string;
  sort_order: number;
  active: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TargetName = string | "Everyone";

export type CueEvent = {
  id: string;
  from: string;
  to: TargetName;
  sentAt: string;
};

export type AckEvent = {
  cueId: string;
  from: string;
  to: string;
  sentAt: string;
};

export type CancelEvent = {
  cueId: string;
  from: string;
  to: TargetName;
  sentAt: string;
};

export type ChatMessage = {
  id: string;
  room_name: string;
  sender: string;
  recipient: TargetName;
  body: string;
  seen_by: string[];
  acknowledged_by: string[];
  flashing_for: string[];
  created_at: string;
};

export type AttentionStatus = "active" | "acknowledged" | "cancelled" | "expired";

export type AttentionRequest = {
  id: string;
  room_name: string;
  requester: string;
  target: TargetName;
  status: AttentionStatus;
  acknowledged_by: string | null;
  cancelled_by: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type Contestant = {
  id: string;
  room_name: string;
  name: string;
  correct_count: number;
  wrong_count: number;
  sort_order: number;
  updated_at: string;
};
