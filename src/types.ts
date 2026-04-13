export const STATUSES = [
  "Inbox",
  "Grooming",
  "Ready",
  "In Progress",
  "Testing",
  "Review",
  "Done",
] as const;

export const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export const EFFORTS = [1, 2, 3] as const;
export const HANDOFF_OWNERS = ["Unassigned", "Ben", "Tess", "Dave"] as const;

export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Effort = (typeof EFFORTS)[number];
export type HandoffOwner = (typeof HANDOFF_OWNERS)[number];

export interface BacklogItem {
  id: string;
  title: string;
  status: Status;
  epic: string;
  owner: string;
  requester: string;
  dateAdded: string;
  lastUpdated: string;
  dueDate: string;
  priority: Priority;
  effort: Effort;
  sprintAssigned: string;
  readyForBen: "Yes" | "No";
  techHandoffOwner: HandoffOwner;
  summary: string;
  outcome: string;
  scopeNotes: string;
  acceptanceCriteria: string[];
  dependencies: string;
  links: string;
  implementationNotes: string;
}

export interface BacklogDocument {
  title: string;
  preamble: string;
  items: BacklogItem[];
}

export interface BacklogResponse {
  path: string;
  displayName: string;
  version: number;
  document: BacklogDocument;
}
