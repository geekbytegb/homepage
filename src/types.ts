export type Overview = {
  eyebrow: string;
  headline: string;
  description: string;
  mission: string;
  email: string;
};

export type Privacy = {
  published: boolean;
  operator: string;
  contact: string;
  retention: string;
  retentionDays: number;
  body: string;
};

export const defaultPrivacy: Privacy = {
  published: false,
  operator: "",
  contact: "",
  retention: "",
  retentionDays: 365,
  body: "",
};

export type Entry = { id: string; published: boolean };
export type HistoryItem = Entry & {
  year: string;
  title: string;
  description: string;
  order: number;
};
export type Notice = Entry & {
  title: string;
  body: string;
  date: string;
  pinned: boolean;
};
export type IntranetResource = Entry & {
  title: string;
  description: string;
  category: string;
  url: string;
  order?: number;
};
export type IntranetProject = Entry & {
  title: string;
  summary: string;
  owner: string;
  status: "planning" | "active" | "blocked" | "done";
  progress: number;
  url: string;
  order?: number;
};
export type IntranetMeeting = Entry & {
  title: string;
  date: string;
  summary: string;
  decisions: string;
  nextActions: string;
};
export type IntranetProfile = Entry & {
  displayName: string;
  role: string;
  bio: string;
  skills: string;
  order?: number;
};
export type IntranetEvent = Entry & {
  title: string;
  category: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  organizer: string;
  url: string;
  order?: number;
};
export type IntranetEventRsvp = {
  id: string;
  eventId: string;
  userId: string;
  displayName: string;
  response: "going" | "maybe" | "not-going";
  updatedAt?: { toDate: () => Date };
};
export type ChatChannel = Entry & {
  name: string;
  description: string;
  kind: "chat" | "announcement";
  order?: number;
};
export type MemberIdentity = {
  id: string;
  uid: string;
  displayName: string;
  updatedAt?: { toDate: () => Date };
};
export type DirectConversation = {
  id: string;
  participants: string[];
  createdAt?: { toDate: () => Date };
};
export type DirectMessage = {
  id: string;
  authorUid: string;
  authorName: string;
  text: string;
  createdAt?: { toDate: () => Date };
};
export type Product = Entry & {
  name: string;
  category: string;
  description: string;
  url: string;
  status: string;
  imageUrl: string;
  imageAlt: string;
  order?: number;
};
export type Event = Entry & {
  title: string;
  category: string;
  description: string;
  schedule: string;
  format: string;
  location: string;
  capacity: string;
  registrationDeadline: string;
  registrationDeadlineAt?: { toDate: () => Date };
  registrationOpen: boolean;
  order?: number;
};
export type Application = {
  id: string;
  userId: string;
  eventId: string;
  name: string;
  email: string;
  phone: string;
  motivation: string;
  consent: boolean;
  status:
    | "new"
    | "reviewing"
    | "accepted"
    | "declined"
    | "cancelled"
    | "deletion_requested";
  createdAt?: { toDate: () => Date };
  deletionRequestedAt?: { toDate: () => Date };
};
export type Member = {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
  adminAccess: boolean;
  memberAccess: boolean;
  updatedAt?: { toDate: () => Date };
};
export type AdminAuditLog = {
  id: string;
  action: string;
  target: string;
  details: string;
  actor: string;
  createdAt?: { toDate: () => Date };
};

export const defaultOverview: Overview = {
  eyebrow: "IDEAS INTO IMPACT",
  headline: "기술의 가능성을,\n실제로 작동하게.",
  description:
    "Geek Byte는 좋은 아이디어를 제품과 경험으로 연결하는 팀입니다. 작은 바이트에서 시작해 의미 있는 변화를 만듭니다.",
  mission: "배우고, 만들고, 공유하며 더 나은 다음 단계를 함께 설계합니다.",
  email: "",
};

export const starterHistory: HistoryItem[] = [
  {
    id: "start",
    published: true,
    year: "01",
    title: "문제에서 시작",
    description: "해결할 가치가 있는 문제를 발견하고 깊이 이해합니다.",
    order: 1,
  },
  {
    id: "build",
    published: true,
    year: "02",
    title: "빠르게 만들기",
    description: "아이디어를 직접 쓰고 경험할 수 있는 형태로 만듭니다.",
    order: 2,
  },
  {
    id: "share",
    published: true,
    year: "03",
    title: "함께 성장",
    description: "배운 것을 나누고 더 큰 가능성으로 이어갑니다.",
    order: 3,
  },
];
