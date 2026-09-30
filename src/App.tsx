import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  limit,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Code2,
  Download,
  LockKeyhole,
  Menu,
  Eye,
  EyeOff,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { appCheckConfigured, auth, configured, db } from "./firebase";
import { AdminDirectMessages } from "./AdminDirectMessages";
import { IntranetChat } from "./IntranetChat";
import { IntranetDirectMessages } from "./IntranetDirectMessages";
import { IntranetEvents } from "./IntranetEvents";
import { buildLaunchReadiness } from "./readiness";
import {
  contentBackupCount,
  parseContentBackup,
  restoreFirestoreValue,
  type BackupEntry,
  type ContentBackupPayload,
} from "./contentBackup";
import {
  defaultOverview,
  defaultPrivacy,
  starterHistory,
  type AdminAuditLog,
  type Application,
  type Event,
  type Entry,
  type HistoryItem,
  type ChatChannel,
  type IntranetEvent,
  type IntranetResource,
  type IntranetProject,
  type IntranetMeeting,
  type IntranetProfile,
  type Member,
  type Notice,
  type Overview,
  type Privacy,
  type Product,
} from "./types";
const logo = "/geek-byte-logo.png";

type CollectionName =
  | "history"
  | "notices"
  | "products"
  | "events"
  | "intranetNotices"
  | "intranetResources"
  | "intranetProjects"
  | "intranetMeetings"
  | "intranetProfiles"
  | "intranetEvents"
  | "chatChannels"
  | "applications";
type AdminTab =
  | "dashboard"
  | "overview"
  | "privacy"
  | "members"
  | "auditLogs"
  | "dmAudit"
  | CollectionName;
const initialForm = {
  name: "",
  email: "",
  phone: "",
  motivation: "",
  consent: false,
};
const initialContactForm = {
  category: "협업 제안",
  name: "",
  email: "",
  message: "",
};
function safeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
function safeImageUrl(value: string) {
  return safeHttpsUrl(value);
}
const pageMetadata: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Geek Byte — Build what matters.",
    description: "아이디어를 제품과 경험으로 연결하는 기술 팀 Geek Byte입니다.",
  },
  "/about": {
    title: "팀 소개 | Geek Byte",
    description: "Geek Byte의 가치와 시작부터 현재까지의 발자취를 소개합니다.",
  },
  "/products": {
    title: "제품·서비스 | Geek Byte",
    description: "Geek Byte가 만들고 운영하는 제품과 서비스를 확인하세요.",
  },
  "/notices": {
    title: "소식 | Geek Byte",
    description: "Geek Byte의 새로운 소식과 주요 공지를 확인하세요.",
  },
  "/events": {
    title: "행사 | Geek Byte",
    description: "Geek Byte의 강연, 세미나, 워크숍과 다양한 행사에 참여하세요.",
  },
  "/contact": {
    title: "문의 | Geek Byte",
    description: "협업과 제안, Geek Byte에 관한 문의를 시작하세요.",
  },
  "/intranet": {
    title: "인트라넷 | Geek Byte",
    description: "Geek Byte 구성원을 위한 내부 업무 공간입니다.",
  },
  "/404": {
    title: "페이지를 찾을 수 없습니다 | Geek Byte",
    description: "요청한 Geek Byte 페이지를 찾을 수 없습니다.",
  },
};
const applicationStatusLabels: Record<Application["status"], string> = {
  new: "접수 완료",
  reviewing: "검토 중",
  accepted: "승인",
  declined: "미선정",
  cancelled: "신청 취소",
};
const auditActionLabels: Record<string, string> = {
  "overview.save": "사이트 소개 수정",
  "privacy.save": "개인정보 안내 수정",
  "content.create": "콘텐츠 등록",
  "content.update": "콘텐츠 수정",
  "content.delete": "콘텐츠 삭제",
  "application.status": "신청 상태 변경",
  "application.delete": "신청 내역 삭제",
  "role.save": "계정 역할 저장",
  "role.toggle": "계정 역할 변경",
  "role.active": "계정 상태 변경",
  "role.delete": "계정 역할 삭제",
  "backup.restore": "콘텐츠 백업 복원",
  "dm.view": "개인 대화 열람",
};
function registrationAvailable(event: Event) {
  const deadline = timestampDate(event.registrationDeadlineAt);
  return (
    event.registrationOpen &&
    Boolean(deadline) &&
    deadline!.getTime() > Date.now()
  );
}
function timestampDate(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime())
      ? date
      : null;
  }
  return null;
}
function displayOrder(item: Entry & { order?: number }) {
  return Number.isFinite(item.order) ? Number(item.order) : 9999;
}

function setMetaTag(selector: string, attribute: string, value: string) {
  const element = document.head.querySelector<HTMLMetaElement>(selector);
  element?.setAttribute(attribute, value);
}

function csvCell(value: unknown) {
  let text = String(value ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
const emptyEditors: Record<
  Exclude<CollectionName, "applications">,
  Record<string, unknown>
> = {
  history: { year: "", title: "", description: "", order: 1, published: false },
  notices: {
    title: "",
    body: "",
    date: new Date().toISOString().slice(0, 10),
    pinned: false,
    published: false,
  },
  products: {
    name: "",
    category: "",
    description: "",
    url: "",
    status: "준비 중",
    imageUrl: "",
    imageAlt: "",
    order: 1,
    published: false,
  },
  events: {
    title: "",
    category: "세미나",
    description: "",
    schedule: "",
    format: "온라인",
    location: "",
    capacity: "",
    registrationDeadline: "",
    registrationOpen: false,
    order: 1,
    published: false,
  },
  intranetNotices: {
    title: "",
    body: "",
    date: new Date().toISOString().slice(0, 10),
    pinned: false,
    published: false,
  },
  intranetResources: {
    title: "",
    description: "",
    category: "업무 자료",
    url: "",
    order: 1,
    published: false,
  },
  intranetProjects: {
    title: "",
    summary: "",
    owner: "",
    status: "planning",
    progress: 0,
    url: "",
    order: 1,
    published: false,
  },
  intranetMeetings: {
    title: "",
    date: new Date().toISOString().slice(0, 10),
    summary: "",
    decisions: "",
    nextActions: "",
    published: false,
  },
  intranetProfiles: {
    displayName: "",
    role: "",
    bio: "",
    skills: "",
    order: 1,
    published: false,
  },
  intranetEvents: {
    title: "",
    category: "팀 일정",
    description: "",
    date: new Date().toISOString().slice(0, 10),
    startTime: "",
    endTime: "",
    location: "",
    organizer: "",
    url: "",
    order: 1,
    published: false,
  },
  chatChannels: {
    name: "",
    description: "",
    kind: "chat",
    order: 1,
    published: false,
  },
};

function useEntries<T extends Entry>(
  name: Exclude<CollectionName, "applications">,
  admin: boolean,
  fallback: T[] = [],
  memberOnly = false,
  member = false,
) {
  const [items, setItems] = useState<T[]>(fallback);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!db) return;
    if (memberOnly && !member && !admin) {
      setItems([]);
      setError("");
      return;
    }
    const source = collection(db, name);
    const target = admin
      ? source
      : query(source, where("published", "==", true));
    return onSnapshot(
      target,
      (snapshot) => {
        setItems(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as T),
        );
        setError("");
      },
      () => setError("콘텐츠를 불러오지 못했습니다."),
    );
  }, [name, admin, member, memberOnly]);
  return { items, error };
}

function App() {
  const { pathname } = useLocation();
  const normalizedPath =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const validPaths = new Set([
    "/",
    "/about",
    "/products",
    "/notices",
    "/events",
    "/contact",
    "/intranet",
  ]);
  const page = validPaths.has(normalizedPath) ? normalizedPath : "/404";
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [hasAdminClaim, setHasAdminClaim] = useState(false);
  const [hasMemberClaim, setHasMemberClaim] = useState(false);
  const [authReady, setAuthReady] = useState(!auth);
  const [overview, setOverview] = useState<Overview>(defaultOverview);
  const [privacy, setPrivacy] = useState<Privacy>(defaultPrivacy);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [activeAdmin, setActiveAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTab>("dashboard");
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const firstPageRender = useRef(true);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [applicationForm, setApplicationForm] = useState(initialForm);
  const [contactForm, setContactForm] = useState(initialContactForm);
  const [applicationMessage, setApplicationMessage] = useState("");
  const [savingApplication, setSavingApplication] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [myApplications, setMyApplications] = useState<Application[]>([]);
  const [cancelApplicationId, setCancelApplicationId] = useState<string | null>(
    null,
  );
  const [members, setMembers] = useState<Member[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [adminMessage, setAdminMessage] = useState("");
  const [failedProductImages, setFailedProductImages] = useState<Set<string>>(
    new Set(),
  );

  const history = useEntries<HistoryItem>(
    "history",
    isAdmin,
    configured ? [] : starterHistory,
  );
  const notices = useEntries<Notice>("notices", isAdmin);
  const products = useEntries<Product>("products", isAdmin);
  const events = useEntries<Event>("events", isAdmin);
  const intranetNotices = useEntries<Notice>(
    "intranetNotices",
    isAdmin,
    [],
    true,
    isMember,
  );
  const intranetResources = useEntries<IntranetResource>(
    "intranetResources",
    isAdmin,
    [],
    true,
    isMember,
  );
  const intranetProjects = useEntries<IntranetProject>(
    "intranetProjects",
    isAdmin,
    [],
    true,
    isMember,
  );
  const intranetMeetings = useEntries<IntranetMeeting>(
    "intranetMeetings",
    isAdmin,
    [],
    true,
    isMember,
  );
  const intranetProfiles = useEntries<IntranetProfile>(
    "intranetProfiles",
    isAdmin,
    [],
    true,
    isMember,
  );
  const intranetEvents = useEntries<IntranetEvent>(
    "intranetEvents",
    isAdmin,
    [],
    true,
    isMember,
  );
  const chatChannels = useEntries<ChatChannel>(
    "chatChannels",
    isAdmin,
    [],
    true,
    isMember,
  );

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, async (current) => {
      setUser(current);
      try {
        const token = current ? await current.getIdTokenResult(true) : null;
        const admin = token?.claims.admin === true;
        const memberClaim = token?.claims.member === true;
        setHasAdminClaim(admin);
        setIsAdmin(admin);
        setHasMemberClaim(memberClaim);
        setIsMember(memberClaim);
      } catch {
        setHasAdminClaim(false);
        setIsAdmin(false);
        setHasMemberClaim(false);
        setIsMember(false);
      }
      if (!current) {
        setActiveAdmin(false);
        setHasAdminClaim(false);
        setHasMemberClaim(false);
        setIsAdmin(false);
        setIsMember(false);
      }
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!db || !user?.email) {
      setIsAdmin(hasAdminClaim);
      setIsMember(hasMemberClaim);
      return;
    }
    const email = user.email.toLocaleLowerCase("en-US");
    return onSnapshot(
      doc(db, "members", email),
      (snapshot) => {
        const data = snapshot.data();
        const active = snapshot.exists() && data?.active === true;
        setIsAdmin(hasAdminClaim || (active && data?.adminAccess === true));
        setIsMember(hasMemberClaim || (active && data?.memberAccess === true));
      },
      () => {
        setIsAdmin(hasAdminClaim);
        setIsMember(hasMemberClaim);
      },
    );
  }, [hasAdminClaim, hasMemberClaim, user]);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(doc(db, "site", "overview"), (snapshot) => {
      if (snapshot.exists())
        setOverview({ ...defaultOverview, ...snapshot.data() } as Overview);
    });
  }, []);

  useEffect(() => {
    if (!db) return;
    setPrivacy(defaultPrivacy);
    return onSnapshot(
      doc(db, "site", "privacy"),
      (snapshot) => {
        if (snapshot.exists())
          setPrivacy({ ...defaultPrivacy, ...snapshot.data() } as Privacy);
      },
      () => setPrivacy(defaultPrivacy),
    );
  }, [isAdmin]);

  useEffect(() => {
    if (!db || !isAdmin) {
      setAuditLogs([]);
      return;
    }
    const auditQuery = query(
      collection(db, "adminAuditLogs"),
      orderBy("createdAt", "desc"),
      limit(100),
    );
    return onSnapshot(
      auditQuery,
      (snapshot) =>
        setAuditLogs(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as AdminAuditLog,
          ),
        ),
      () => setAdminMessage("관리자 활동 기록을 불러오지 못했습니다."),
    );
  }, [isAdmin]);

  useEffect(() => {
    if (!db || !isAdmin) return;
    return onSnapshot(
      collection(db, "applications"),
      (snapshot) => {
        setApplications(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as Application,
          ),
        );
      },
      () => setAdminMessage("신청 내역을 불러오지 못했습니다."),
    );
  }, [isAdmin]);

  useEffect(() => {
    if (!db || !user) {
      setMyApplications([]);
      return;
    }
    const ownApplications = query(
      collection(db, "applications"),
      where("userId", "==", user.uid),
    );
    return onSnapshot(
      ownApplications,
      (snapshot) =>
        setMyApplications(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as Application,
          ),
        ),
      () => setApplicationMessage("내 신청 내역을 불러오지 못했습니다."),
    );
  }, [user]);

  useEffect(() => {
    if (!db || !isAdmin) {
      setMembers([]);
      return;
    }
    return onSnapshot(
      collection(db, "members"),
      (snapshot) =>
        setMembers(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as Member,
          ),
        ),
      () => setAdminMessage("구성원 권한 목록을 불러오지 못했습니다."),
    );
  }, [isAdmin]);

  const visibleHistory = useMemo(
    () =>
      history.items
        .filter((x) => x.published)
        .sort((a, b) => a.order - b.order),
    [history.items],
  );
  const groupedHistory = useMemo(() => {
    const groups: { year: string; items: HistoryItem[] }[] = [];
    visibleHistory.forEach((item) => {
      const year = item.year.trim();
      const group = groups.find((candidate) => candidate.year === year);
      if (group) group.items.push(item);
      else groups.push({ year, items: [item] });
    });
    return groups;
  }, [visibleHistory]);
  const visibleNotices = useMemo(
    () =>
      notices.items
        .filter((x) => x.published)
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date),
        ),
    [notices.items],
  );
  const visibleProducts = useMemo(
    () =>
      products.items
        .filter((x) => x.published)
        .sort(
          (a, b) =>
            displayOrder(a) - displayOrder(b) ||
            a.name.localeCompare(b.name, "ko-KR"),
        ),
    [products.items],
  );
  const visibleEvents = useMemo(
    () =>
      events.items
        .filter((x) => x.published)
        .sort(
          (a, b) =>
            displayOrder(a) - displayOrder(b) ||
            a.title.localeCompare(b.title, "ko-KR"),
        ),
    [events.items],
  );
  const applicationsByEvent = useMemo(
    () => new Map(myApplications.map((item) => [item.eventId, item])),
    [myApplications],
  );
  const visibleIntranetNotices = useMemo(
    () =>
      intranetNotices.items
        .filter((item) => item.published)
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date),
        ),
    [intranetNotices.items],
  );
  const visibleIntranetResources = useMemo(
    () =>
      intranetResources.items
        .filter((item) => item.published)
        .sort(
          (a, b) =>
            displayOrder(a) - displayOrder(b) ||
            a.title.localeCompare(b.title, "ko-KR"),
        ),
    [intranetResources.items],
  );
  const visibleIntranetProjects = useMemo(
    () =>
      intranetProjects.items
        .filter((item) => item.published)
        .sort(
          (a, b) =>
            displayOrder(a) - displayOrder(b) ||
            a.title.localeCompare(b.title, "ko-KR"),
        ),
    [intranetProjects.items],
  );
  const visibleIntranetMeetings = useMemo(
    () =>
      intranetMeetings.items
        .filter((item) => item.published)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [intranetMeetings.items],
  );
  const visibleIntranetProfiles = useMemo(
    () =>
      intranetProfiles.items
        .filter((item) => item.published)
        .sort(
          (a, b) =>
            displayOrder(a) - displayOrder(b) ||
            a.displayName.localeCompare(b.displayName, "ko-KR"),
        ),
    [intranetProfiles.items],
  );
  const visibleIntranetEvents = useMemo(
    () =>
      intranetEvents.items
        .filter((item) => item.published)
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.startTime.localeCompare(b.startTime) ||
            displayOrder(a) - displayOrder(b),
        ),
    [intranetEvents.items],
  );
  const visibleChatChannels = useMemo(
    () =>
      chatChannels.items
        .filter((item) => item.published)
        .sort(
          (a, b) =>
            displayOrder(a) - displayOrder(b) ||
            a.name.localeCompare(b.name, "ko-KR"),
        ),
    [chatChannels.items],
  );
  const contentError =
    page === "/about"
      ? history.error
      : page === "/products"
        ? products.error
        : page === "/notices"
          ? notices.error
          : page === "/events"
            ? events.error
            : page === "/intranet"
              ? intranetNotices.error ||
                intranetResources.error ||
                intranetProjects.error ||
                intranetMeetings.error ||
                intranetProfiles.error ||
                intranetEvents.error ||
                chatChannels.error
              : "";
  const privacyReady = Boolean(
    privacy.published &&
    privacy.operator &&
    privacy.contact &&
    privacy.retention &&
    privacy.body,
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setMenuOpen(false);
    if (firstPageRender.current) firstPageRender.current = false;
    else document.getElementById("main-content")?.focus();
    const metadata = pageMetadata[page];
    const canonicalUrl =
      page === "/404"
        ? `https://geekbyte.kro.kr${normalizedPath}`
        : `https://geekbyte.kro.kr${page === "/" ? "/" : `${page}/`}`;
    document.title = metadata.title;
    setMetaTag(
      'meta[name="robots"]',
      "content",
      page === "/404" || page === "/intranet"
        ? "noindex,follow"
        : "index,follow",
    );
    setMetaTag('meta[name="description"]', "content", metadata.description);
    setMetaTag('meta[property="og:title"]', "content", metadata.title);
    setMetaTag(
      'meta[property="og:description"]',
      "content",
      metadata.description,
    );
    setMetaTag('meta[property="og:url"]', "content", canonicalUrl);
    setMetaTag('meta[name="twitter:title"]', "content", metadata.title);
    setMetaTag(
      'meta[name="twitter:description"]',
      "content",
      metadata.description,
    );
    document.head
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.setAttribute("href", canonicalUrl);
  }, [page, normalizedPath]);

  useEffect(() => {
    const modalOpen = loginOpen || privacyOpen || Boolean(selectedEvent);
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable?.[0];
    const last = focusable?.[focusable.length - 1];
    if (!dialog?.contains(document.activeElement)) first?.focus();
    document.body.style.overflow = "hidden";
    const closeTopModal = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectedEvent) setSelectedEvent(null);
        else if (privacyOpen) setPrivacyOpen(false);
        else setLoginOpen(false);
        return;
      }
      if (event.key !== "Tab" || !first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", closeTopModal);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeTopModal);
      previousFocus?.focus();
    };
  }, [loginOpen, privacyOpen, selectedEvent]);

  async function googleLogin() {
    if (!auth) return;
    setLoginError("");
    setAuthLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      setLoginOpen(false);
    } catch {
      setLoginError(
        "로그인에 실패했습니다. 팝업 차단 및 Firebase 인증 설정을 확인해 주세요.",
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function emailLogin(event: FormEvent) {
    event.preventDefault();
    if (!auth) return;
    setLoginError("");
    setAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      setLoginOpen(false);
      setLoginPassword("");
    } catch {
      setLoginError(
        "로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.",
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function resetAdminPassword() {
    if (!auth || !loginEmail.trim()) {
      setLoginError("관리자 이메일을 먼저 입력해 주세요.");
      return;
    }
    setLoginError("");
    setLoginNotice("");
    setAuthLoading(true);
    try {
      await sendPasswordResetEmail(auth, loginEmail.trim());
      setLoginNotice(
        "재설정 안내 메일을 보냈습니다. 받은편지함을 확인해 주세요.",
      );
    } catch {
      setLoginError(
        "재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setAuthLoading(false);
    }
  }

  function openApplication(event: Event) {
    setSelectedEvent(event);
    setApplicationMessage("");
    setApplicationForm({
      ...initialForm,
      name: user?.displayName || "",
      email: user?.email || "",
    });
  }

  async function submitApplication(event: FormEvent) {
    event.preventDefault();
    if (!db || !user || !selectedEvent || !privacyReady) return;
    setApplicationMessage("");
    setSavingApplication(true);
    try {
      await setDoc(doc(db, "applications", `${user.uid}_${selectedEvent.id}`), {
        userId: user.uid,
        eventId: selectedEvent.id,
        name: applicationForm.name.trim(),
        email: applicationForm.email.trim(),
        phone: applicationForm.phone.trim(),
        motivation: applicationForm.motivation.trim(),
        consent: true,
        status: "new",
        createdAt: serverTimestamp(),
      });
      setApplicationMessage("신청이 접수되었습니다. 감사합니다!");
    } catch {
      setApplicationMessage(
        "신청을 저장하지 못했습니다. 이미 신청했거나 접수가 마감되었는지 확인해 주세요.",
      );
    } finally {
      setSavingApplication(false);
    }
  }

  async function cancelOwnApplication(application: Application) {
    if (!db || !user || application.userId !== user.uid) return;
    setSavingApplication(true);
    setApplicationMessage("");
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "applications", application.id), {
        status: "cancelled",
      });
      await batch.commit();
      setCancelApplicationId(null);
      setApplicationMessage("신청을 취소했습니다.");
    } catch {
      setApplicationMessage(
        "신청을 취소하지 못했습니다. 이미 처리된 신청인지 확인해 주세요.",
      );
    } finally {
      setSavingApplication(false);
    }
  }

  function openContactEmail(event: FormEvent) {
    event.preventDefault();
    if (!overview.email) return;
    const subject = `[Geek Byte ${contactForm.category}] ${contactForm.name.trim()}`;
    const body = [
      `문의 유형: ${contactForm.category}`,
      `이름: ${contactForm.name.trim()}`,
      `회신 이메일: ${contactForm.email.trim()}`,
      "",
      contactForm.message.trim(),
    ].join("\n");
    window.location.href = `mailto:${overview.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function appendAudit(
    batch: ReturnType<typeof writeBatch>,
    action: string,
    target: string,
    details: string,
  ) {
    if (!db) return;
    batch.set(doc(collection(db, "adminAuditLogs")), {
      action,
      target,
      details,
      actor: user?.email || "unknown",
      createdAt: serverTimestamp(),
    });
  }

  async function saveOverview(next: Overview) {
    if (!db) return;
    const batch = writeBatch(db);
    batch.set(doc(db, "site", "overview"), next);
    appendAudit(batch, "overview.save", "site/overview", "사이트 소개 수정");
    await batch.commit();
    setAdminMessage("소개 내용이 저장되었습니다.");
  }

  async function savePrivacy(next: Privacy) {
    if (!db) return;
    const batch = writeBatch(db);
    batch.set(doc(db, "site", "privacy"), next);
    appendAudit(
      batch,
      "privacy.save",
      "site/privacy",
      next.published ? "개인정보 안내 게시" : "개인정보 안내 비공개",
    );
    await batch.commit();
    setAdminMessage("개인정보 안내가 저장되었습니다.");
  }

  async function saveEntry(
    name: Exclude<CollectionName, "applications">,
    entry: Record<string, unknown>,
    id?: string,
  ) {
    if (!db) return;
    if (
      name === "products" &&
      ((entry.url && !safeHttpsUrl(String(entry.url))) ||
        (entry.imageUrl && !safeImageUrl(String(entry.imageUrl))))
    ) {
      throw new Error("INVALID_PRODUCT_LINK");
    }
    if (
      name === "intranetResources" &&
      (!entry.url || !safeHttpsUrl(String(entry.url)))
    ) {
      throw new Error("INVALID_RESOURCE_URL");
    }
    if (
      name === "intranetProjects" &&
      entry.url &&
      !safeHttpsUrl(String(entry.url))
    ) {
      throw new Error("INVALID_PROJECT_URL");
    }
    if (
      name === "intranetEvents" &&
      entry.url &&
      !safeHttpsUrl(String(entry.url))
    ) {
      throw new Error("INVALID_INTRANET_EVENT_URL");
    }
    const reference = id ? doc(db, name, id) : doc(collection(db, name));
    const batch = writeBatch(db);
    batch.set(reference, entry);
    appendAudit(
      batch,
      id ? "content.update" : "content.create",
      `${name}/${reference.id}`,
      `${name} ${id ? "수정" : "등록"}`,
    );
    await batch.commit();
    setAdminMessage("저장되었습니다.");
  }

  async function deleteEntry(
    name: Exclude<CollectionName, "applications">,
    id: string,
  ) {
    if (!db) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, name, id));
    appendAudit(batch, "content.delete", `${name}/${id}`, `${name} 삭제`);
    await batch.commit();
    setAdminMessage("항목이 삭제되었습니다.");
  }

  async function restoreContentBackup(payload: ContentBackupPayload) {
    const database = db;
    if (!database) return 0;
    const groups: Array<
      [Exclude<CollectionName, "applications">, BackupEntry[]]
    > = [
      ["history", payload.publicContent.history],
      ["notices", payload.publicContent.notices],
      ["products", payload.publicContent.products],
      ["events", payload.publicContent.events],
      ["intranetNotices", payload.intranetContent.notices],
      ["intranetResources", payload.intranetContent.resources],
      ["intranetProjects", payload.intranetContent.projects],
      ["intranetMeetings", payload.intranetContent.meetings],
      ["intranetProfiles", payload.intranetContent.profiles],
      ["intranetEvents", payload.intranetContent.events],
      ["chatChannels", payload.intranetContent.channels],
    ];
    const batch = writeBatch(database);
    batch.set(
      doc(database, "site", "overview"),
      restoreFirestoreValue(payload.site.overview) as Record<string, unknown>,
    );
    batch.set(
      doc(database, "site", "privacy"),
      restoreFirestoreValue(payload.site.privacy) as Record<string, unknown>,
    );
    let contentCount = 0;
    groups.forEach(([name, items]) => {
      items.forEach((item) => {
        const { id, ...data } = item;
        batch.set(
          doc(database, name, id),
          restoreFirestoreValue(data) as Record<string, unknown>,
        );
        contentCount += 1;
      });
    });
    appendAudit(
      batch,
      "backup.restore",
      `content-backup/${payload.exportedAt}`,
      `사이트 문서 2개와 콘텐츠 ${contentCount}개 병합 복원`,
    );
    await batch.commit();
    setAdminMessage(`콘텐츠 ${contentCount}개를 백업에서 복원했습니다.`);
    return contentCount;
  }

  async function changeApplicationStatus(
    item: Application,
    status: Application["status"],
  ) {
    if (!db) return;
    const batch = writeBatch(db);
    batch.update(doc(db, "applications", item.id), { status });
    appendAudit(
      batch,
      "application.status",
      `applications/${item.id}`,
      `${item.email} 신청 상태: ${status}`,
    );
    await batch.commit();
    setAdminMessage("신청 상태가 변경되었습니다.");
  }

  async function deleteApplication(id: string) {
    if (!db) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, "applications", id));
    appendAudit(
      batch,
      "application.delete",
      `applications/${id}`,
      "행사 신청 내역 삭제",
    );
    await batch.commit();
    setAdminMessage("신청 내역이 삭제되었습니다.");
  }

  async function saveMember(
    email: string,
    displayName: string,
    roles: { adminAccess: boolean; memberAccess: boolean },
  ) {
    if (!db) return;
    const normalizedEmail = email.trim().toLocaleLowerCase("en-US");
    const batch = writeBatch(db);
    batch.set(
      doc(db, "members", normalizedEmail),
      {
        email: normalizedEmail,
        displayName: displayName.trim(),
        active: true,
        adminAccess: roles.adminAccess,
        memberAccess: roles.memberAccess,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    appendAudit(
      batch,
      "role.save",
      `members/${normalizedEmail}`,
      `관리자 ${roles.adminAccess ? "사용" : "미사용"}, 내부자 ${roles.memberAccess ? "사용" : "미사용"}`,
    );
    await batch.commit();
    setAdminMessage("계정 역할이 저장되었습니다.");
  }

  async function setMemberRole(
    member: Member,
    role: "adminAccess" | "memberAccess",
    enabled: boolean,
  ) {
    if (!db) return;
    const batch = writeBatch(db);
    batch.update(doc(db, "members", member.id), {
      [role]: enabled,
      active: true,
      updatedAt: serverTimestamp(),
    });
    appendAudit(
      batch,
      "role.toggle",
      `members/${member.id}`,
      `${role === "adminAccess" ? "관리자" : "내부자"} 역할 ${enabled ? "부여" : "해제"}`,
    );
    await batch.commit();
    setAdminMessage(
      `${role === "adminAccess" ? "관리자" : "내부자"} 역할을 ${enabled ? "부여했습니다." : "해제했습니다."}`,
    );
  }

  async function setMemberActive(member: Member, active: boolean) {
    if (!db) return;
    const batch = writeBatch(db);
    batch.update(doc(db, "members", member.id), {
      active,
      updatedAt: serverTimestamp(),
    });
    appendAudit(
      batch,
      "role.active",
      `members/${member.id}`,
      `계정 ${active ? "활성화" : "비활성화"}`,
    );
    await batch.commit();
    setAdminMessage(
      `구성원 계정을 ${active ? "활성화했습니다." : "비활성화했습니다."}`,
    );
  }

  async function deleteMember(id: string) {
    if (!db) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, "members", id));
    appendAudit(batch, "role.delete", `members/${id}`, "계정 역할 삭제");
    await batch.commit();
    setAdminMessage("구성원 권한을 삭제했습니다.");
  }

  function enterAdmin() {
    if (!configured) {
      setLoginOpen(true);
      return;
    }
    if (!user) {
      setLoginOpen(true);
      return;
    }
    if (isAdmin) {
      setActiveAdmin(true);
      setAdminMessage("");
    } else {
      setLoginError("이 계정에는 관리자 권한이 없습니다.");
      setLoginOpen(true);
    }
  }

  return (
    <>
      <div className="site-shell">
        <a className="skip-link" href="#main-content">
          본문으로 바로가기
        </a>
        <header className="site-header">
          <Link className="brand" to="/" aria-label="Geek Byte 홈">
            <span className="brand-logo">
              <img src={logo} alt="" aria-hidden="true" />
            </span>
            <span>
              GEEK BYTE<span className="brand-period">.</span>
            </span>
          </Link>
          <nav className={menuOpen ? "nav open" : "nav"} aria-label="주 메뉴">
            <NavLink to="/about" onClick={() => setMenuOpen(false)}>
              팀 소개
            </NavLink>
            <NavLink to="/products" onClick={() => setMenuOpen(false)}>
              제품·서비스
            </NavLink>
            <NavLink to="/notices" onClick={() => setMenuOpen(false)}>
              소식
            </NavLink>
            <NavLink to="/events" onClick={() => setMenuOpen(false)}>
              행사
            </NavLink>
            {isMember && (
              <NavLink to="/intranet" onClick={() => setMenuOpen(false)}>
                인트라넷
              </NavLink>
            )}
          </nav>
          <div className="header-actions">
            {user ? (
              <button
                className="text-button account-button"
                onClick={() => auth && signOut(auth)}
              >
                {user.displayName || user.email} · 로그아웃
              </button>
            ) : (
              <button
                className="text-button account-button"
                onClick={() => setLoginOpen(true)}
              >
                로그인
              </button>
            )}
            <Link className="header-cta" to="/contact">
              함께하기 <ArrowUpRight size={15} />
            </Link>
            <button
              className="mobile-menu"
              aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </header>

        <main id="main-content" tabIndex={-1}>
          {contentError && (
            <p className="content-alert" role="alert">
              {contentError} 잠시 후 새로고침해 주세요.
            </p>
          )}
          {page === "/" && (
            <>
              <section className="hero section-wrap">
                <div className="hero-copy">
                  <p className="eyebrow">
                    <span className="pulse-dot" /> {overview.eyebrow}
                  </p>
                  <h1>
                    {overview.headline.split("\n").map((line, i) => (
                      <span key={i}>
                        {line}
                        <br />
                      </span>
                    ))}
                  </h1>
                  <p className="hero-description">{overview.description}</p>
                  <div className="hero-actions">
                    <Link className="button button-primary" to="/products">
                      우리가 만드는 것 <ArrowUpRight size={18} />
                    </Link>
                    <Link className="button button-ghost" to="/about">
                      Geek Byte 알아보기 <ArrowRight size={18} />
                    </Link>
                  </div>
                  <div className="hero-footer">
                    <span>BUILD / LEARN / SHARE</span>
                    <span>
                      SCROLL TO EXPLORE <ArrowDownRight size={16} />
                    </span>
                  </div>
                </div>
                <div className="hero-visual" aria-label="Geek Byte 로고">
                  <div className="hero-grid" />
                  <div className="hero-orbit orbit-one" />
                  <div className="hero-orbit orbit-two" />
                  <div className="hero-logo-frame">
                    <img src={logo} alt="Geek Byte 로고" />
                  </div>
                  <span className="visual-label label-one">
                    GEEK BYTE / 001
                  </span>
                  <span className="visual-label label-two">
                    THINK. BUILD. REPEAT.
                  </span>
                  <div className="visual-corner corner-top" />
                  <div className="visual-corner corner-bottom" />
                </div>
              </section>

              <section className="ticker" aria-label="핵심 가치">
                <div>
                  CURIOUS BY NATURE <Sparkles size={17} /> BUILT FOR WHAT'S NEXT{" "}
                  <Sparkles size={17} /> GEEK BYTE <Sparkles size={17} />{" "}
                  CURIOUS BY NATURE <Sparkles size={17} /> BUILT FOR WHAT'S NEXT{" "}
                  <Sparkles size={17} />
                </div>
              </section>
              <section
                className="home-directory section-wrap"
                aria-label="사이트 둘러보기"
              >
                {[
                  ["01", "팀 소개", "Geek Byte의 미션과 여정", "/about"],
                  ["02", "제품·서비스", "우리가 만드는 결과물", "/products"],
                  ["03", "소식", "공지와 팀의 새로운 이야기", "/notices"],
                  ["04", "행사", "강연·세미나·워크숍·밋업", "/events"],
                ].map(([number, title, description, to]) => (
                  <Link className="directory-card" to={to} key={to}>
                    <span>{number}</span>
                    <h2>{title}</h2>
                    <p>{description}</p>
                    <ArrowUpRight size={20} />
                  </Link>
                ))}
              </section>
            </>
          )}

          {page !== "/" && page !== "/404" && page !== "/intranet" && (
            <section className="page-intro section-wrap">
              <p className="section-kicker">
                GEEK BYTE / {page.slice(1).toUpperCase()}
              </p>
              <h1>
                {
                  (
                    {
                      "/about": "우리를 소개합니다.",
                      "/products": "아이디어를 제품으로 만듭니다.",
                      "/notices": "Geek Byte의 소식을 전합니다.",
                      "/events": "함께 경험하고 연결됩니다.",
                      "/contact": "새로운 대화를 시작합니다.",
                    } as Record<string, string>
                  )[page]
                }
              </h1>
            </section>
          )}

          {page === "/about" && (
            <>
              <section className="about-section section-wrap" id="about">
                <div className="section-heading">
                  <p className="section-kicker">
                    <span>01 /</span> ABOUT US
                  </p>
                  <h2>
                    호기심을
                    <br />
                    <em>실행으로.</em>
                  </h2>
                </div>
                <div className="about-content">
                  <p className="about-lead">
                    기술을 좋아하는 마음에서 출발해, 실제로 도움이 되는 결과물을
                    만듭니다.
                  </p>
                  <p className="muted">{overview.mission}</p>
                  <div className="values">
                    <div>
                      <Code2 size={23} />
                      <strong>BUILD</strong>
                      <span>아이디어를 실제 제품으로</span>
                    </div>
                    <div>
                      <CircleHelp size={23} />
                      <strong>LEARN</strong>
                      <span>끊임없는 질문과 학습</span>
                    </div>
                    <div>
                      <Sparkles size={23} />
                      <strong>SHARE</strong>
                      <span>지식과 경험의 연결</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="history-section section-wrap" id="history">
                <div className="section-topline">
                  <p className="section-kicker">
                    <span>02 /</span> OUR JOURNEY
                  </p>
                  <span className="small-aside">우리가 걸어가는 방식</span>
                </div>
                <div className="history-grid">
                  {!visibleHistory.length && (
                    <p className="history-empty">
                      팀의 새로운 발자취를 곧 전하겠습니다.
                    </p>
                  )}
                  {groupedHistory.map((group, i) => (
                    <article className="history-row" key={`${group.year}-${i}`}>
                      <div className="history-row-heading">
                        <span className="history-index">
                          {group.year || String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="history-line">
                          <span />
                        </div>
                      </div>
                      <div className="history-row-items">
                        {group.items.map((item) => (
                          <section className="history-card" key={item.id}>
                            <h3>{item.title}</h3>
                            <p>{item.description}</p>
                          </section>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}

          {page === "/products" && (
            <section className="work-section" id="work">
              <div className="section-wrap">
                <div className="section-topline">
                  <p className="section-kicker">
                    <span>03 /</span> WHAT WE MAKE
                  </p>
                  <span className="small-aside">만들고 있는 것들</span>
                </div>
                <div className="work-heading">
                  <h2>
                    생각을 넘어서,
                    <br />
                    <em>세상에 닿는 것.</em>
                  </h2>
                  <p>Geek Byte의 제품과 서비스가 이곳에 모입니다.</p>
                </div>
                <div className="product-grid">
                  {visibleProducts.length ? (
                    visibleProducts.map((item, i) => (
                      <article className="product-card" key={item.id}>
                        <div
                          className={
                            safeImageUrl(item.imageUrl || "") &&
                            !failedProductImages.has(item.imageUrl)
                              ? "product-art has-product-image"
                              : "product-art"
                          }
                        >
                          {safeImageUrl(item.imageUrl || "") &&
                          !failedProductImages.has(item.imageUrl) ? (
                            <img
                              src={safeImageUrl(item.imageUrl || "")!}
                              alt={item.imageAlt || item.name}
                              loading="lazy"
                              onError={() =>
                                setFailedProductImages((current) =>
                                  new Set(current).add(item.imageUrl),
                                )
                              }
                            />
                          ) : (
                            <>
                              <span className="product-art-number">
                                0{i + 1}
                              </span>
                              <div className="abstract-shape" />
                            </>
                          )}
                          <span className="product-status">{item.status}</span>
                        </div>
                        <div className="product-meta">
                          <span>{item.category}</span>
                          {safeHttpsUrl(item.url) && (
                            <a
                              href={safeHttpsUrl(item.url)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${item.name} 열기`}
                            >
                              <ArrowUpRight size={21} />
                            </a>
                          )}
                        </div>
                        <h3>{item.name}</h3>
                        <p>{item.description}</p>
                      </article>
                    ))
                  ) : (
                    <div className="empty-panel">
                      <span className="empty-icon">
                        <Plus size={24} />
                      </span>
                      <h3>새로운 프로젝트를 준비하고 있습니다.</h3>
                      <p>
                        첫 번째 제품과 서비스 소식을 곧 이곳에서 전하겠습니다.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {page === "/notices" && (
            <section className="news-section section-wrap" id="news">
              <div className="section-topline">
                <p className="section-kicker">
                  <span>04 /</span> LATEST NEWS
                </p>
                <span className="small-aside">새로운 소식</span>
              </div>
              <div className="news-layout">
                <div>
                  <h2>
                    Geek Byte의
                    <br />
                    <em>지금.</em>
                  </h2>
                  <p className="muted">
                    팀의 이야기와 새로운 소식을 확인하세요.
                  </p>
                </div>
                <div className="notice-list">
                  {visibleNotices.length ? (
                    visibleNotices.slice(0, 5).map((item) => (
                      <details className="notice-row" key={item.id}>
                        <summary>
                          <div>
                            <span className="notice-date">
                              {item.pinned ? "PINNED · " : ""}
                              {item.date}
                            </span>
                            <h3>{item.title}</h3>
                          </div>
                          <span className="notice-arrow">
                            <ChevronDown size={20} />
                          </span>
                        </summary>
                        <p>{item.body}</p>
                      </details>
                    ))
                  ) : (
                    <div className="notice-empty">
                      아직 등록된 공지사항이 없습니다.
                      <span>
                        새 소식이 올라오면 이곳에서 확인할 수 있습니다.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {page === "/events" && (
            <section className="events-section" id="events">
              <div className="section-wrap">
                <div className="section-topline">
                  <p className="section-kicker">
                    <span>05 /</span> GEEK BYTE EVENTS
                  </p>
                  <span className="small-aside">함께 만나는 시간</span>
                </div>
                <div className="events-heading">
                  <h2>
                    경험이 다음
                    <br />
                    <em>시작이 되도록.</em>
                  </h2>
                  <p>
                    새로운 관점을 발견하고, 경험을 나누며, 사람과 연결됩니다.
                  </p>
                </div>
                {user && myApplications.length > 0 && (
                  <section
                    className="my-applications"
                    aria-labelledby="my-applications-title"
                  >
                    <div>
                      <span>MY APPLICATIONS</span>
                      <h3 id="my-applications-title">내 신청 현황</h3>
                    </div>
                    <div className="my-application-list">
                      {myApplications.map((application) => (
                        <article key={application.id}>
                          <div>
                            <strong>
                              {events.items.find(
                                (event) => event.id === application.eventId,
                              )?.title || application.eventId}
                            </strong>
                            <span
                              className={`application-status ${application.status}`}
                            >
                              {applicationStatusLabels[application.status]}
                            </span>
                          </div>
                          {(application.status === "new" ||
                            application.status === "reviewing") &&
                            (cancelApplicationId === application.id ? (
                              <span className="application-cancel-confirm">
                                <button
                                  disabled={savingApplication}
                                  onClick={() =>
                                    cancelOwnApplication(application)
                                  }
                                >
                                  취소 확정
                                </button>
                                <button
                                  disabled={savingApplication}
                                  onClick={() => setCancelApplicationId(null)}
                                >
                                  돌아가기
                                </button>
                              </span>
                            ) : (
                              <button
                                className="application-cancel"
                                onClick={() =>
                                  setCancelApplicationId(application.id)
                                }
                              >
                                신청 취소
                              </button>
                            ))}
                        </article>
                      ))}
                    </div>
                  </section>
                )}
                <div className="event-grid">
                  {visibleEvents.length ? (
                    visibleEvents.map((event, i) => {
                      const application = applicationsByEvent.get(event.id);
                      const canRegister = registrationAvailable(event);
                      return (
                        <article className="event-card" key={event.id}>
                          <div className="event-top">
                            <span className="event-number">
                              EVENT / {String(i + 1).padStart(2, "0")}
                            </span>
                            <span
                              className={
                                canRegister
                                  ? "event-badge"
                                  : "event-badge closed"
                              }
                            >
                              {canRegister ? "모집 중" : "모집 마감"}
                            </span>
                          </div>
                          <span className="event-category">
                            {event.category}
                          </span>
                          <h3>{event.title}</h3>
                          <p>{event.description}</p>
                          <div className="event-info">
                            <span>{event.schedule || "일정 추후 안내"}</span>
                            <span>{event.location || event.format}</span>
                            {event.capacity && (
                              <span>정원 {event.capacity}</span>
                            )}
                          </div>
                          {event.registrationDeadline && (
                            <span className="event-deadline">
                              신청 마감 {event.registrationDeadline}
                            </span>
                          )}
                          <button
                            className="event-button"
                            disabled={!canRegister || Boolean(application)}
                            onClick={() => openApplication(event)}
                          >
                            {application
                              ? applicationStatusLabels[application.status]
                              : canRegister
                                ? "행사 신청하기"
                                : "신청 마감"}{" "}
                            {application ? (
                              <Check size={18} />
                            ) : (
                              <ArrowUpRight size={18} />
                            )}
                          </button>
                        </article>
                      );
                    })
                  ) : (
                    <div className="empty-panel events-empty">
                      <span className="empty-icon">
                        <Sparkles size={24} />
                      </span>
                      <h3>새로운 경험을 준비하고 있습니다.</h3>
                      <p>행사가 열리면 이곳에서 신청하실 수 있습니다.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {page === "/contact" && (
            <section className="contact-section section-wrap" id="contact">
              <div className="contact-copy">
                <p className="section-kicker">
                  <span>06 /</span> LET'S CONNECT
                </p>
                <h2>
                  좋은 아이디어는
                  <br />
                  <em>대화에서 시작됩니다.</em>
                </h2>
                <p>협업, 제안, 궁금한 점이 있다면 편하게 이야기해 주세요.</p>
              </div>
              {overview.email ? (
                <div className="contact-panel">
                  <div className="contact-address">
                    <span>OFFICIAL CONTACT</span>
                    <a href={`mailto:${overview.email}`}>
                      {overview.email}
                      <ArrowUpRight size={18} />
                    </a>
                  </div>
                  <form className="contact-form" onSubmit={openContactEmail}>
                    <label>
                      문의 유형
                      <select
                        value={contactForm.category}
                        onChange={(event) =>
                          setContactForm({
                            ...contactForm,
                            category: event.target.value,
                          })
                        }
                      >
                        <option>협업 제안</option>
                        <option>제품·서비스 문의</option>
                        <option>행사 문의</option>
                        <option>미디어·기타 문의</option>
                      </select>
                    </label>
                    <div className="contact-form-grid">
                      <label>
                        이름
                        <input
                          required
                          maxLength={80}
                          value={contactForm.name}
                          onChange={(event) =>
                            setContactForm({
                              ...contactForm,
                              name: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        회신 이메일
                        <input
                          required
                          type="email"
                          maxLength={254}
                          value={contactForm.email}
                          onChange={(event) =>
                            setContactForm({
                              ...contactForm,
                              email: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      문의 내용
                      <textarea
                        required
                        rows={7}
                        minLength={10}
                        maxLength={2000}
                        value={contactForm.message}
                        onChange={(event) =>
                          setContactForm({
                            ...contactForm,
                            message: event.target.value,
                          })
                        }
                      />
                      <small>{contactForm.message.length} / 2,000자</small>
                    </label>
                    <p>
                      입력 내용은 사이트에 저장되지 않습니다. 버튼을 누르면 메일
                      앱에서 내용을 확인한 뒤 직접 전송할 수 있습니다.
                    </p>
                    <button className="button button-primary">
                      메일 앱에서 문의 작성 <ArrowUpRight size={17} />
                    </button>
                  </form>
                </div>
              ) : (
                <span className="contact-link pending">
                  연락 채널 준비 중 <ArrowUpRight size={25} />
                </span>
              )}
            </section>
          )}
          {page === "/intranet" && (
            <section className="intranet-section section-wrap">
              {!authReady ? (
                <div className="intranet-gate" aria-busy="true">
                  <LockKeyhole size={32} />
                  <p className="section-kicker">
                    <span>SECURE ACCESS /</span> CHECKING
                  </p>
                  <h1>접근 권한을 확인하고 있습니다.</h1>
                </div>
              ) : !user ? (
                <div className="intranet-gate">
                  <LockKeyhole size={32} />
                  <p className="section-kicker">
                    <span>MEMBERS ONLY /</span> GEEK BYTE INTRANET
                  </p>
                  <h1>구성원 로그인이 필요합니다.</h1>
                  <p>
                    내부 자료와 공지는 승인된 Geek Byte 구성원만 확인할 수
                    있습니다.
                  </p>
                  <button
                    className="button button-primary"
                    onClick={() => setLoginOpen(true)}
                  >
                    로그인 <ArrowRight size={17} />
                  </button>
                </div>
              ) : !isMember ? (
                <div className="intranet-gate">
                  <ShieldCheck size={32} />
                  <p className="section-kicker">
                    <span>ACCESS /</span> PENDING
                  </p>
                  <h1>구성원 권한이 필요합니다.</h1>
                  <p>
                    현재 계정에는 인트라넷 권한이 없습니다. 관리자에게 등록을
                    요청해 주세요.
                  </p>
                </div>
              ) : (
                <>
                  <div className="intranet-hero">
                    <div>
                      <p className="section-kicker">
                        <span>MEMBERS ONLY /</span> GEEK BYTE INTRANET
                      </p>
                      <h1>팀의 일을 한곳에서.</h1>
                      <p>
                        {user.displayName || user.email}님, Geek Byte 내부 업무
                        공간입니다.
                      </p>
                    </div>
                    {isAdmin && (
                      <button
                        className="button button-ghost"
                        onClick={() => {
                          setAdminTab("intranetNotices");
                          setActiveAdmin(true);
                        }}
                      >
                        내부 콘텐츠 관리 <ArrowUpRight size={17} />
                      </button>
                    )}
                  </div>
                  <div className="intranet-grid">
                    <IntranetEvents
                      events={visibleIntranetEvents}
                      user={user}
                    />
                    <IntranetChat
                      channels={visibleChatChannels}
                      user={user}
                      isAdmin={isAdmin}
                      onManageChannels={() => {
                        setAdminTab("chatChannels");
                        setActiveAdmin(true);
                      }}
                    />
                    <IntranetDirectMessages user={user} />
                    <section className="intranet-panel intranet-directory-panel">
                      <div className="intranet-panel-heading">
                        <span>TEAM DIRECTORY</span>
                        <strong>{visibleIntranetProfiles.length}</strong>
                      </div>
                      <div className="intranet-profile-list">
                        {visibleIntranetProfiles.length ? (
                          visibleIntranetProfiles.map((profile) => (
                            <article
                              className="intranet-profile"
                              key={profile.id}
                            >
                              <span
                                className="intranet-profile-avatar"
                                aria-hidden="true"
                              >
                                {profile.displayName.trim().slice(0, 1) || "G"}
                              </span>
                              <div>
                                <span>{profile.role || "TEAM MEMBER"}</span>
                                <h2>{profile.displayName}</h2>
                                {profile.bio && <p>{profile.bio}</p>}
                                {profile.skills && (
                                  <small>{profile.skills}</small>
                                )}
                              </div>
                            </article>
                          ))
                        ) : (
                          <p className="intranet-empty">
                            공개된 구성원 프로필이 없습니다.
                          </p>
                        )}
                      </div>
                    </section>
                    <section className="intranet-panel">
                      <div className="intranet-panel-heading">
                        <span>INTERNAL NOTICE</span>
                        <strong>{visibleIntranetNotices.length}</strong>
                      </div>
                      {visibleIntranetNotices.length ? (
                        visibleIntranetNotices.map((notice) => (
                          <article className="intranet-notice" key={notice.id}>
                            <time dateTime={notice.date}>{notice.date}</time>
                            <h2>
                              {notice.pinned && <span>필독</span>}
                              {notice.title}
                            </h2>
                            <p>{notice.body}</p>
                          </article>
                        ))
                      ) : (
                        <p className="intranet-empty">
                          등록된 내부 공지가 없습니다.
                        </p>
                      )}
                    </section>
                    <section className="intranet-panel">
                      <div className="intranet-panel-heading">
                        <span>TEAM RESOURCES</span>
                        <strong>{visibleIntranetResources.length}</strong>
                      </div>
                      <div className="intranet-resource-list">
                        {visibleIntranetResources.length ? (
                          visibleIntranetResources.map((resource) => {
                            const resourceUrl = safeHttpsUrl(resource.url);
                            return (
                              <article
                                className="intranet-resource"
                                key={resource.id}
                              >
                                <span>{resource.category}</span>
                                <h2>{resource.title}</h2>
                                <p>{resource.description}</p>
                                {resourceUrl && (
                                  <a
                                    href={resourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    자료 열기 <ArrowUpRight size={16} />
                                  </a>
                                )}
                              </article>
                            );
                          })
                        ) : (
                          <p className="intranet-empty">
                            등록된 팀 자료가 없습니다.
                          </p>
                        )}
                      </div>
                    </section>
                    <section className="intranet-panel intranet-project-panel">
                      <div className="intranet-panel-heading">
                        <span>PROJECT STATUS</span>
                        <strong>{visibleIntranetProjects.length}</strong>
                      </div>
                      <div className="intranet-project-list">
                        {visibleIntranetProjects.length ? (
                          visibleIntranetProjects.map((project) => {
                            const projectUrl = safeHttpsUrl(project.url);
                            const progress = Math.max(
                              0,
                              Math.min(100, Number(project.progress) || 0),
                            );
                            const statusLabels = {
                              planning: "기획",
                              active: "진행 중",
                              blocked: "확인 필요",
                              done: "완료",
                            };
                            return (
                              <article
                                className="intranet-project"
                                key={project.id}
                              >
                                <div className="intranet-project-top">
                                  <span
                                    className={`project-status ${project.status}`}
                                  >
                                    {statusLabels[project.status]}
                                  </span>
                                  <span>{progress}%</span>
                                </div>
                                <h2>{project.title}</h2>
                                <p>{project.summary}</p>
                                <div
                                  className="project-progress"
                                  aria-label={`진행률 ${progress}%`}
                                >
                                  <span style={{ width: `${progress}%` }} />
                                </div>
                                <div className="intranet-project-footer">
                                  <span>담당 {project.owner || "미정"}</span>
                                  {projectUrl && (
                                    <a
                                      href={projectUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      프로젝트 열기 <ArrowUpRight size={15} />
                                    </a>
                                  )}
                                </div>
                              </article>
                            );
                          })
                        ) : (
                          <p className="intranet-empty">
                            등록된 프로젝트가 없습니다.
                          </p>
                        )}
                      </div>
                    </section>
                    <section className="intranet-panel intranet-meeting-panel">
                      <div className="intranet-panel-heading">
                        <span>MEETING NOTES</span>
                        <strong>{visibleIntranetMeetings.length}</strong>
                      </div>
                      <div className="intranet-meeting-list">
                        {visibleIntranetMeetings.length ? (
                          visibleIntranetMeetings.map((meeting) => (
                            <article
                              className="intranet-meeting"
                              key={meeting.id}
                            >
                              <time dateTime={meeting.date}>
                                {meeting.date}
                              </time>
                              <h2>{meeting.title}</h2>
                              <p>{meeting.summary}</p>
                              {meeting.decisions && (
                                <div>
                                  <strong>결정 사항</strong>
                                  <p>{meeting.decisions}</p>
                                </div>
                              )}
                              {meeting.nextActions && (
                                <div>
                                  <strong>다음 할 일</strong>
                                  <p>{meeting.nextActions}</p>
                                </div>
                              )}
                            </article>
                          ))
                        ) : (
                          <p className="intranet-empty">
                            등록된 회의 기록이 없습니다.
                          </p>
                        )}
                      </div>
                    </section>
                  </div>
                </>
              )}
            </section>
          )}
          {page === "/404" && (
            <section className="not-found section-wrap">
              <span>404</span>
              <h1>페이지를 찾을 수 없습니다.</h1>
              <p>주소를 확인하거나 홈에서 다시 시작해 주세요.</p>
              <Link className="button button-primary" to="/">
                홈으로 이동
              </Link>
            </section>
          )}
        </main>
        <footer className="site-footer">
          <div className="section-wrap footer-inner">
            <div>
              <span className="footer-brand">
                GEEK BYTE<span>.</span>
              </span>
              <p>Build what matters.</p>
            </div>
            <div className="footer-links">
              <Link to="/">홈</Link>
              <button onClick={() => setPrivacyOpen(true)}>
                개인정보 안내
              </button>
              <button onClick={enterAdmin}>관리자</button>
            </div>
            <small>
              © {new Date().getFullYear()} Geek Byte. All rights reserved.
            </small>
          </div>
        </footer>
      </div>

      {loginOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLoginOpen(false);
          }}
        >
          <section
            className="modal login-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-title"
          >
            <button
              className="modal-close"
              onClick={() => setLoginOpen(false)}
              aria-label="닫기"
            >
              <X />
            </button>
            <span className="modal-icon">
              <LockKeyhole size={25} />
            </span>
            <p className="section-kicker">
              <span>GEEK BYTE /</span> ACCOUNT
            </p>
            <h2 id="login-title">Geek Byte 로그인</h2>
            <p className="modal-subtitle">
              행사 신청은 Google 계정으로, 관리자는 등록된 계정으로
              로그인하세요.
            </p>
            {configured ? (
              <>
                <button
                  className="google-button"
                  disabled={authLoading}
                  onClick={googleLogin}
                >
                  Google 계정으로 계속하기 <ArrowRight size={17} />
                </button>
                <div className="divider">
                  <span>관리자 이메일 로그인</span>
                </div>
                <form onSubmit={emailLogin} className="login-form">
                  <label>
                    이메일
                    <input
                      autoFocus
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      autoComplete="username"
                    />
                  </label>
                  <label>
                    비밀번호
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </label>
                  <button
                    className="button button-primary"
                    disabled={authLoading}
                  >
                    로그인 <ArrowRight size={17} />
                  </button>
                </form>
                <button
                  type="button"
                  className="password-reset"
                  disabled={authLoading}
                  onClick={resetAdminPassword}
                >
                  비밀번호 재설정
                </button>
              </>
            ) : (
              <p className="setup-note">
                Firebase 설정이 아직 연결되지 않았습니다. 운영자가 프로젝트
                설정을 완료하면 로그인을 이용할 수 있습니다.
              </p>
            )}
            {loginError && (
              <p className="form-message error" role="alert">
                {loginError}
              </p>
            )}
            {loginNotice && (
              <p className="form-message success" role="status">
                {loginNotice}
              </p>
            )}
          </section>
        </div>
      )}

      {selectedEvent && privacyReady && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedEvent(null);
          }}
        >
          <section
            className="modal application-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="application-title"
          >
            <button
              className="modal-close"
              onClick={() => setSelectedEvent(null)}
              aria-label="닫기"
            >
              <X />
            </button>
            <p className="section-kicker">
              <span>GEEK BYTE /</span> EVENTS
            </p>
            <h2 id="application-title">행사 신청</h2>
            <p className="modal-subtitle">{selectedEvent.title}</p>
            {!configured ? (
              <p className="setup-note">현재 신청 시스템을 준비 중입니다.</p>
            ) : !user ? (
              <div className="login-required">
                <ShieldCheck size={30} />
                <h3>로그인 후 신청할 수 있습니다.</h3>
                <p>
                  신청 내역을 안전하게 관리하기 위해 계정 확인이 필요합니다.
                </p>
                <button
                  className="button button-primary"
                  onClick={() => {
                    setSelectedEvent(null);
                    setLoginOpen(true);
                  }}
                >
                  로그인하기 <ArrowRight size={17} />
                </button>
              </div>
            ) : (
              <form className="application-form" onSubmit={submitApplication}>
                <div className="form-grid">
                  <label>
                    이름
                    <input
                      autoFocus
                      required
                      minLength={2}
                      maxLength={80}
                      value={applicationForm.name}
                      onChange={(e) =>
                        setApplicationForm({
                          ...applicationForm,
                          name: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    이메일
                    <input
                      required
                      type="email"
                      maxLength={254}
                      value={applicationForm.email}
                      onChange={(e) =>
                        setApplicationForm({
                          ...applicationForm,
                          email: e.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  연락처
                  <input
                    required
                    type="tel"
                    minLength={8}
                    maxLength={30}
                    value={applicationForm.phone}
                    onChange={(e) =>
                      setApplicationForm({
                        ...applicationForm,
                        phone: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  신청 동기 <span className="optional">선택</span>
                  <textarea
                    maxLength={1000}
                    rows={4}
                    value={applicationForm.motivation}
                    onChange={(e) =>
                      setApplicationForm({
                        ...applicationForm,
                        motivation: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    required
                    checked={applicationForm.consent}
                    onChange={(e) =>
                      setApplicationForm({
                        ...applicationForm,
                        consent: e.target.checked,
                      })
                    }
                  />
                  <span>
                    행사 신청 처리 및 연락을 위해 이름, 이메일, 연락처, 신청
                    동기를 수집·이용하는 데 동의합니다.
                  </span>
                </label>
                <button
                  className="button button-primary"
                  disabled={
                    savingApplication || applicationMessage.startsWith("신청이")
                  }
                >
                  {savingApplication ? "접수 중..." : "신청 제출하기"}{" "}
                  <ArrowRight size={17} />
                </button>
                {applicationMessage && (
                  <p
                    className={`form-message ${applicationMessage.startsWith("신청이") ? "success" : "error"}`}
                    role={
                      applicationMessage.startsWith("신청이")
                        ? "status"
                        : "alert"
                    }
                  >
                    {applicationMessage}
                  </p>
                )}
              </form>
            )}
          </section>
        </div>
      )}

      {selectedEvent && !privacyReady && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedEvent(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="application-unavailable-title"
          >
            <button
              className="modal-close"
              onClick={() => setSelectedEvent(null)}
              aria-label="닫기"
            >
              <X />
            </button>
            <p className="section-kicker">
              <span>GEEK BYTE /</span> EVENTS
            </p>
            <h2 id="application-unavailable-title">신청 준비 중</h2>
            <p className="modal-subtitle">{selectedEvent.title}</p>
            <p className="setup-note">
              개인정보 안내가 게시되면 신청을 받습니다.
            </p>
          </section>
        </div>
      )}
      {privacyOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPrivacyOpen(false);
          }}
        >
          <section
            className="modal privacy-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-title"
          >
            <button
              className="modal-close"
              onClick={() => setPrivacyOpen(false)}
              aria-label="닫기"
            >
              <X />
            </button>
            <p className="section-kicker">
              <span>GEEK BYTE /</span> PRIVACY
            </p>
            <h2 id="privacy-title">개인정보 안내</h2>
            {privacyReady ? (
              <div className="privacy-content">
                <p>
                  <strong>운영 주체</strong> {privacy.operator}
                </p>
                <p>
                  <strong>문의처</strong> {privacy.contact}
                </p>
                <p>
                  <strong>보유 기간</strong> {privacy.retention}
                </p>
                <div>{privacy.body}</div>
              </div>
            ) : (
              <p className="setup-note">
                개인정보 안내를 준비 중입니다. 안내가 게시되기 전에는 참가
                신청을 받지 않습니다.
              </p>
            )}
          </section>
        </div>
      )}
      {activeAdmin && isAdmin && (
        <AdminPanel
          overview={overview}
          privacy={privacy}
          history={history.items}
          notices={notices.items}
          products={products.items}
          events={events.items}
          intranetNotices={intranetNotices.items}
          intranetResources={intranetResources.items}
          intranetProjects={intranetProjects.items}
          intranetMeetings={intranetMeetings.items}
          intranetProfiles={intranetProfiles.items}
          intranetEvents={intranetEvents.items}
          chatChannels={chatChannels.items}
          applications={applications}
          members={members}
          auditLogs={auditLogs}
          currentUser={user!}
          currentUserEmail={user?.email?.toLocaleLowerCase("en-US") || ""}
          hasRootAdminClaim={hasAdminClaim}
          tab={adminTab}
          setTab={setAdminTab}
          onClose={() => setActiveAdmin(false)}
          onSaveOverview={saveOverview}
          onSavePrivacy={savePrivacy}
          onSaveEntry={saveEntry}
          onStatus={changeApplicationStatus}
          onDeleteApplication={deleteApplication}
          onSaveMember={saveMember}
          onSetMemberRole={setMemberRole}
          onSetMemberActive={setMemberActive}
          onDeleteMember={deleteMember}
          onDeleteEntry={deleteEntry}
          onRestoreContentBackup={restoreContentBackup}
          message={adminMessage}
          setMessage={setAdminMessage}
        />
      )}
    </>
  );
}

type AdminProps = {
  overview: Overview;
  privacy: Privacy;
  history: HistoryItem[];
  notices: Notice[];
  products: Product[];
  events: Event[];
  intranetNotices: Notice[];
  intranetResources: IntranetResource[];
  intranetProjects: IntranetProject[];
  intranetMeetings: IntranetMeeting[];
  intranetProfiles: IntranetProfile[];
  intranetEvents: IntranetEvent[];
  chatChannels: ChatChannel[];
  applications: Application[];
  members: Member[];
  auditLogs: AdminAuditLog[];
  currentUser: User;
  currentUserEmail: string;
  hasRootAdminClaim: boolean;
  tab: AdminTab;
  setTab: (tab: AdminTab) => void;
  onClose: () => void;
  onSaveOverview: (value: Overview) => Promise<void>;
  onSavePrivacy: (value: Privacy) => Promise<void>;
  onSaveEntry: (
    name: Exclude<CollectionName, "applications">,
    value: Record<string, unknown>,
    id?: string,
  ) => Promise<void>;
  onStatus: (item: Application, status: Application["status"]) => Promise<void>;
  onDeleteApplication: (id: string) => Promise<void>;
  onSaveMember: (
    email: string,
    displayName: string,
    roles: { adminAccess: boolean; memberAccess: boolean },
  ) => Promise<void>;
  onSetMemberRole: (
    member: Member,
    role: "adminAccess" | "memberAccess",
    enabled: boolean,
  ) => Promise<void>;
  onSetMemberActive: (member: Member, active: boolean) => Promise<void>;
  onDeleteMember: (id: string) => Promise<void>;
  onDeleteEntry: (
    name: Exclude<CollectionName, "applications">,
    id: string,
  ) => Promise<void>;
  onRestoreContentBackup: (payload: ContentBackupPayload) => Promise<number>;
  message: string;
  setMessage: (message: string) => void;
};

function AdminPanel(props: AdminProps) {
  const {
    overview,
    privacy,
    history,
    notices,
    products,
    events,
    intranetNotices,
    intranetResources,
    intranetProjects,
    intranetMeetings,
    intranetProfiles,
    intranetEvents,
    chatChannels,
    applications,
    members,
    auditLogs,
    currentUser,
    currentUserEmail,
    hasRootAdminClaim,
    tab,
    setTab,
    onClose,
    onSaveOverview,
    onSavePrivacy,
    onSaveEntry,
    onStatus,
    onDeleteApplication,
    onSaveMember,
    onSetMemberRole,
    onSetMemberActive,
    onDeleteMember,
    onDeleteEntry,
    onRestoreContentBackup,
    message,
    setMessage,
  } = props;
  const [draftOverview, setDraftOverview] = useState(overview);
  const adminMainRef = useRef<HTMLElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [draftPrivacy, setDraftPrivacy] = useState(privacy);
  useEffect(() => {
    setDraftOverview(overview);
  }, [overview]);
  useEffect(() => {
    setDraftPrivacy(privacy);
  }, [privacy]);
  useEffect(() => {
    adminMainRef.current?.focus();
  }, []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entryDraft, setEntryDraft] = useState<Record<string, unknown>>(
    emptyEditors.history,
  );
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [roleConfirmKey, setRoleConfirmKey] = useState<string | null>(null);
  const [applicationQuery, setApplicationQuery] = useState("");
  const [applicationStatus, setApplicationStatus] = useState<
    "all" | Application["status"]
  >("all");
  const [auditQuery, setAuditQuery] = useState("");
  const [auditAction, setAuditAction] = useState("all");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [newAdminAccess, setNewAdminAccess] = useState(false);
  const [newMemberAccess, setNewMemberAccess] = useState(true);
  const [backupPreview, setBackupPreview] = useState<{
    fileName: string;
    itemCount: number;
    payload: ContentBackupPayload;
  } | null>(null);
  const [backupRestoreConfirm, setBackupRestoreConfirm] = useState(false);
  const collections: Record<
    Exclude<CollectionName, "applications">,
    Entry[]
  > = {
    history,
    notices,
    products,
    events,
    intranetNotices,
    intranetResources,
    intranetProjects,
    intranetMeetings,
    intranetProfiles,
    intranetEvents,
    chatChannels,
  };
  const labels: Record<AdminTab, string> = {
    dashboard: "운영 요약",
    overview: "사이트 소개",
    privacy: "개인정보 안내",
    history: "연혁",
    notices: "공지사항",
    products: "제품·서비스",
    events: "행사",
    intranetNotices: "내부 공지",
    intranetResources: "내부 자료",
    intranetProjects: "프로젝트 현황",
    intranetMeetings: "회의 기록",
    intranetProfiles: "구성원 프로필",
    intranetEvents: "내부 행사",
    chatChannels: "메신저 채널",
    applications: "행사 신청",
    members: "구성원 권한",
    auditLogs: "활동 기록",
    dmAudit: "개인 대화 감사",
  };
  const filteredApplications = useMemo(() => {
    const term = applicationQuery.trim().toLocaleLowerCase("ko-KR");
    return [...applications]
      .filter(
        (item) =>
          applicationStatus === "all" || item.status === applicationStatus,
      )
      .filter((item) => {
        if (!term) return true;
        const eventTitle =
          events.find((event) => event.id === item.eventId)?.title ||
          item.eventId;
        return [item.name, item.email, item.phone, eventTitle].some((value) =>
          value.toLocaleLowerCase("ko-KR").includes(term),
        );
      })
      .sort(
        (a, b) =>
          (timestampDate(b.createdAt)?.getTime() || 0) -
          (timestampDate(a.createdAt)?.getTime() || 0),
      );
  }, [applicationQuery, applicationStatus, applications, events]);
  const auditActions = useMemo(
    () => [...new Set(auditLogs.map((log) => log.action))].sort(),
    [auditLogs],
  );
  const filteredAuditLogs = useMemo(() => {
    const term = auditQuery.trim().toLocaleLowerCase("ko-KR");
    return auditLogs.filter((log) => {
      if (auditAction !== "all" && log.action !== auditAction) return false;
      if (!term) return true;
      return [
        auditActionLabels[log.action] || log.action,
        log.actor,
        log.target,
        log.details,
      ].some((value) => value.toLocaleLowerCase("ko-KR").includes(term));
    });
  }, [auditAction, auditLogs, auditQuery]);
  const pendingApplications = applications.filter(
    (item) => item.status === "new" || item.status === "reviewing",
  ).length;
  const openEvents = events.filter(
    (item) => item.published && registrationAvailable(item),
  ).length;
  const publicContent = [history, notices, products, events]
    .flat()
    .filter((item) => item.published).length;
  const activeProjects = intranetProjects.filter(
    (item) => item.published && item.status === "active",
  ).length;
  const adminMembers = members.filter(
    (item) => item.active && item.adminAccess,
  ).length;
  const intranetMembers = members.filter(
    (item) => item.active && item.memberAccess,
  ).length;
  const currentRootAdminListed = members.some(
    (item) => item.id === currentUserEmail && item.active && item.adminAccess,
  );
  const effectiveAdminCount =
    adminMembers + (hasRootAdminClaim && !currentRootAdminListed ? 1 : 0);
  const invalidEventDeadlineCount = events.filter(
    (item) =>
      item.published &&
      item.registrationOpen &&
      !timestampDate(item.registrationDeadlineAt),
  ).length;
  const missingProductAltCount = products.filter(
    (item) => item.published && item.imageUrl.trim() && !item.imageAlt.trim(),
  ).length;
  const readinessChecks = buildLaunchReadiness({
    firebaseConfigured: configured,
    appCheckConfigured,
    privacyReady: Boolean(
      privacy.published &&
      privacy.operator.trim() &&
      privacy.contact.trim() &&
      privacy.retention.trim() &&
      privacy.body.trim(),
    ),
    contactEmailReady: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(overview.email.trim()),
    administratorCount: effectiveAdminCount,
    intranetMemberCount: intranetMembers,
    publishedChatChannelCount: chatChannels.filter((item) => item.published)
      .length,
    publicContentCount: publicContent,
    invalidEventDeadlineCount,
    missingProductAltCount,
    secureCustomDomain:
      window.location.hostname === "geekbyte.kro.kr" &&
      window.location.protocol === "https:",
  });
  const readinessReadyCount = readinessChecks.filter(
    (check) => check.ready,
  ).length;
  const dashboardStats: Array<{
    label: string;
    value: number;
    detail: string;
    target: AdminTab;
    urgent?: boolean;
  }> = [
    {
      label: "처리 대기 신청",
      value: pendingApplications,
      detail: `전체 신청 ${applications.length}건`,
      target: "applications",
      urgent: pendingApplications > 0,
    },
    {
      label: "모집 중 행사",
      value: openEvents,
      detail: `등록 행사 ${events.length}개`,
      target: "events",
    },
    {
      label: "공개 콘텐츠",
      value: publicContent,
      detail: "연혁·공지·제품·행사",
      target: "notices",
    },
    {
      label: "진행 중 프로젝트",
      value: activeProjects,
      detail: `내부 프로젝트 ${intranetProjects.length}개`,
      target: "intranetProjects",
    },
    {
      label: "관리자",
      value: adminMembers,
      detail: "사이트 운영 권한",
      target: "members",
    },
    {
      label: "내부자",
      value: intranetMembers,
      detail: "인트라넷 접근 권한",
      target: "members",
    },
  ];

  function changeTab(next: AdminTab) {
    setTab(next);
    setEditingId(null);
    setDeletingId(null);
    setRoleConfirmKey(null);
    setMessage("");
  }
  function startEdit(item?: Entry) {
    const key = tab as Exclude<CollectionName, "applications">;
    setEditingId(item?.id || "new");
    setEntryDraft(item ? { ...item } : { ...emptyEditors[key] });
    setMessage("");
  }
  async function submitEntry(event: FormEvent) {
    event.preventDefault();
    const name = tab as Exclude<CollectionName, "applications">;
    const { id: _id, ...value } = entryDraft;
    void _id;
    setSaving(true);
    try {
      if (
        name === "products" &&
        value.imageUrl &&
        !safeImageUrl(String(value.imageUrl))
      ) {
        throw new Error("INVALID_IMAGE_URL");
      }
      if (
        name === "products" &&
        value.url &&
        !safeHttpsUrl(String(value.url))
      ) {
        throw new Error("INVALID_PRODUCT_URL");
      }
      if (
        name === "intranetResources" &&
        (!value.url || !safeHttpsUrl(String(value.url)))
      ) {
        throw new Error("INVALID_RESOURCE_URL");
      }
      if (
        name === "intranetProjects" &&
        value.url &&
        !safeHttpsUrl(String(value.url))
      ) {
        throw new Error("INVALID_PROJECT_URL");
      }
      if (
        name === "intranetEvents" &&
        value.url &&
        !safeHttpsUrl(String(value.url))
      ) {
        throw new Error("INVALID_INTRANET_EVENT_URL");
      }
      if (name === "events") {
        const deadline = String(value.registrationDeadline || "");
        if (value.registrationOpen && !deadline) {
          throw new Error("EVENT_DEADLINE_REQUIRED");
        }
        value.registrationDeadlineAt = deadline
          ? Timestamp.fromDate(new Date(`${deadline}T23:59:59+09:00`))
          : null;
      }
      await onSaveEntry(
        name,
        value,
        editingId === "new" ? undefined : editingId || undefined,
      );
      setEditingId(null);
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "INVALID_IMAGE_URL"
          ? "이미지는 https://로 시작하는 주소를 입력해 주세요."
          : error instanceof Error && error.message === "INVALID_PRODUCT_URL"
            ? "제품 외부 링크는 https://로 시작하는 주소를 입력해 주세요."
            : error instanceof Error && error.message === "INVALID_RESOURCE_URL"
              ? "내부 자료는 https://로 시작하는 주소를 입력해 주세요."
              : error instanceof Error &&
                  error.message === "INVALID_PROJECT_URL"
                ? "프로젝트 링크는 https://로 시작하는 주소를 입력해 주세요."
                : error instanceof Error &&
                    error.message === "INVALID_INTRANET_EVENT_URL"
                  ? "내부 행사 링크는 https://로 시작하는 주소를 입력해 주세요."
                  : error instanceof Error &&
                      error.message === "EVENT_DEADLINE_REQUIRED"
                    ? "신청 접수를 열려면 신청 마감일을 입력해 주세요."
                    : "저장에 실패했습니다. 입력값과 관리자 권한을 확인해 주세요.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function submitOverview(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSaveOverview(draftOverview);
    } catch {
      setMessage("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }
  async function submitPrivacy(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSavePrivacy(draftPrivacy);
    } catch {
      setMessage("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }
  async function removeEntry(id: string) {
    const name = tab as Exclude<CollectionName, "applications">;
    setSaving(true);
    try {
      await onDeleteEntry(name, id);
      if (editingId === id) setEditingId(null);
      setDeletingId(null);
    } catch {
      setMessage("삭제에 실패했습니다. 관리자 권한을 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  }
  async function togglePublished(item: Entry) {
    const name = tab as Exclude<CollectionName, "applications">;
    const { id, ...value } = item;
    setSaving(true);
    try {
      await onSaveEntry(name, { ...value, published: !item.published }, id);
    } catch {
      setMessage("게시 상태 변경에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }
  async function removeApplication(id: string) {
    setSaving(true);
    try {
      await onDeleteApplication(id);
      setDeletingId(null);
    } catch {
      setMessage("신청 내역 삭제에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }
  async function submitMember(event: FormEvent) {
    event.preventDefault();
    if (!newAdminAccess && !newMemberAccess) {
      setMessage("관리자 또는 내부자 역할을 하나 이상 선택해 주세요.");
      return;
    }
    setSaving(true);
    try {
      await onSaveMember(memberEmail, memberName, {
        adminAccess: newAdminAccess,
        memberAccess: newMemberAccess,
      });
      setMemberEmail("");
      setMemberName("");
      setNewAdminAccess(false);
      setNewMemberAccess(true);
    } catch {
      setMessage("구성원 권한 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }
  async function toggleMemberRole(
    member: Member,
    role: "adminAccess" | "memberAccess",
  ) {
    setSaving(true);
    try {
      await onSetMemberRole(member, role, !member[role]);
      setRoleConfirmKey(null);
    } catch {
      setMessage("구성원 권한 변경에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }
  async function toggleMemberActive(member: Member) {
    setSaving(true);
    try {
      await onSetMemberActive(member, !member.active);
      setRoleConfirmKey(null);
    } catch {
      setMessage("구성원 계정 상태 변경에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }
  async function removeMember(id: string) {
    setSaving(true);
    try {
      await onDeleteMember(id);
      setDeletingId(null);
    } catch {
      setMessage("구성원 권한 삭제에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }
  function exportApplications() {
    const headings = [
      "상태",
      "이름",
      "이메일",
      "연락처",
      "행사",
      "신청 동기",
      "접수 일시",
    ];
    const rows = filteredApplications.map((item) => [
      applicationStatusLabels[item.status],
      item.name,
      item.email,
      item.phone,
      events.find((event) => event.id === item.eventId)?.title || item.eventId,
      item.motivation,
      timestampDate(item.createdAt)?.toLocaleString("ko-KR") || "",
    ]);
    const csv = [headings, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `geek-byte-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  function exportAuditLogs() {
    const headings = ["작업", "담당자", "대상", "세부 내용", "일시"];
    const rows = filteredAuditLogs.map((log) => [
      auditActionLabels[log.action] || log.action,
      log.actor,
      log.target,
      log.details,
      timestampDate(log.createdAt)?.toLocaleString("ko-KR") || "",
    ]);
    const csv = [headings, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `geek-byte-admin-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  function exportContentBackup() {
    const backup = {
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      site: { overview, privacy },
      publicContent: { history, notices, products, events },
      intranetContent: {
        notices: intranetNotices,
        resources: intranetResources,
        projects: intranetProjects,
        meetings: intranetMeetings,
        profiles: intranetProfiles,
        events: intranetEvents,
        channels: chatChannels,
      },
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `geek-byte-content-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function inspectContentBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBackupRestoreConfirm(false);
    if (file.size > 5 * 1024 * 1024) {
      setBackupPreview(null);
      setMessage("백업 파일은 5MB 이하여야 합니다.");
      return;
    }
    try {
      const payload = parseContentBackup(await file.text());
      const itemCount = contentBackupCount(payload);
      setBackupPreview({ fileName: file.name, itemCount, payload });
      setMessage("백업 검사가 완료되었습니다. 내용을 확인한 뒤 복원하세요.");
    } catch (error) {
      setBackupPreview(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "백업 파일을 검사하지 못했습니다.",
      );
    }
  }
  async function restoreInspectedBackup() {
    if (!backupPreview) return;
    setSaving(true);
    try {
      await onRestoreContentBackup(backupPreview.payload);
      setBackupPreview(null);
      setBackupRestoreConfirm(false);
    } catch {
      setMessage(
        "백업 복원에 실패했습니다. 파일과 관리자 권한을 확인해 주세요.",
      );
    } finally {
      setSaving(false);
    }
  }
  const textField = (
    key: string,
    label: string,
    required = false,
    multiline = false,
  ) => (
    <label key={key}>
      {label}
      {multiline ? (
        <textarea
          required={required}
          value={String(entryDraft[key] ?? "")}
          onChange={(e) =>
            setEntryDraft({ ...entryDraft, [key]: e.target.value })
          }
          rows={4}
        />
      ) : (
        <input
          required={required}
          type={
            key === "url"
              ? "url"
              : key === "date"
                ? "date"
                : key === "startTime" || key === "endTime"
                  ? "time"
                  : "text"
          }
          value={String(entryDraft[key] ?? "")}
          onChange={(e) =>
            setEntryDraft({ ...entryDraft, [key]: e.target.value })
          }
        />
      )}
    </label>
  );
  const orderField = (
    <label>
      표시 순서
      <input
        type="number"
        min="1"
        value={Number(entryDraft.order || 1)}
        onChange={(event) =>
          setEntryDraft({
            ...entryDraft,
            order: Math.max(1, Number(event.target.value)),
          })
        }
      />
    </label>
  );

  return (
    <div className="admin-screen">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          GEEK BYTE<span>.</span>
          <small>ADMIN STUDIO</small>
        </div>
        <nav>
          {(Object.keys(labels) as AdminTab[]).map((key) => (
            <button
              className={tab === key ? "selected" : ""}
              key={key}
              onClick={() => changeTab(key)}
            >
              {labels[key]} <ArrowRight size={15} />
            </button>
          ))}
        </nav>
        <button className="admin-exit" onClick={onClose}>
          ← 사이트로 돌아가기
        </button>
      </aside>
      <main className="admin-main" ref={adminMainRef} tabIndex={-1}>
        <div className="admin-top">
          <div>
            <p className="section-kicker">
              <span>CONTENT MANAGEMENT /</span> {tab.toUpperCase()}
            </p>
            <h1>{labels[tab]}</h1>
          </div>
          <button className="admin-close" onClick={onClose}>
            <X size={20} /> 닫기
          </button>
        </div>
        {message && (
          <p className="admin-message" role="status">
            {message}
          </p>
        )}
        {tab === "dashboard" ? (
          <div className="admin-dashboard">
            <div className="admin-dashboard-intro">
              <div>
                <span>OPERATIONS AT A GLANCE</span>
                <h2>지금 확인할 운영 현황</h2>
                <p>
                  공개 사이트, 행사 신청, 인트라넷과 계정 권한의 현재 상태를
                  한곳에서 확인합니다.
                </p>
              </div>
              <div className="admin-dashboard-actions">
                <button
                  className="button button-primary"
                  onClick={() => changeTab("auditLogs")}
                >
                  최근 활동 보기 <ArrowRight size={17} />
                </button>
                <button
                  className="button button-ghost"
                  onClick={exportContentBackup}
                >
                  콘텐츠 백업 <Download size={16} />
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => backupInputRef.current?.click()}
                >
                  백업 검사 <Upload size={16} />
                </button>
                <input
                  ref={backupInputRef}
                  className="admin-backup-upload-input"
                  type="file"
                  accept="application/json,.json"
                  onChange={inspectContentBackup}
                />
              </div>
            </div>
            {backupPreview && (
              <section className="admin-backup-preview" aria-live="polite">
                <div>
                  <span>RESTORE PREVIEW</span>
                  <h3>{backupPreview.fileName}</h3>
                  <p>
                    사이트 설정 2개와 콘텐츠 {backupPreview.itemCount}개를
                    복원합니다. 같은 문서 ID는 덮어쓰고 백업에 없는 기존 문서는
                    유지합니다. 신청자·계정 권한·활동 기록은 변경하지 않습니다.
                  </p>
                </div>
                <div className="admin-backup-preview-actions">
                  {backupRestoreConfirm ? (
                    <>
                      <button
                        className="button danger"
                        disabled={saving}
                        onClick={restoreInspectedBackup}
                      >
                        병합 복원 확인
                      </button>
                      <button
                        className="button button-ghost"
                        disabled={saving}
                        onClick={() => setBackupRestoreConfirm(false)}
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <button
                      className="button button-primary"
                      disabled={saving}
                      onClick={() => setBackupRestoreConfirm(true)}
                    >
                      병합 복원 <Upload size={16} />
                    </button>
                  )}
                  <button
                    className="button button-ghost"
                    disabled={saving}
                    onClick={() => {
                      setBackupPreview(null);
                      setBackupRestoreConfirm(false);
                    }}
                  >
                    파일 닫기
                  </button>
                </div>
              </section>
            )}
            <div className="admin-stat-grid">
              {dashboardStats.map((stat) => (
                <button
                  className={`admin-stat-card ${stat.urgent ? "urgent" : ""}`}
                  key={stat.label}
                  onClick={() => changeTab(stat.target)}
                >
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                  <small>{stat.detail}</small>
                  <ArrowUpRight size={18} aria-hidden="true" />
                </button>
              ))}
            </div>
            <section className="admin-readiness">
              <div className="admin-readiness-heading">
                <div>
                  <span>LAUNCH READINESS</span>
                  <h3>출시 준비 점검</h3>
                  <p>
                    운영에 필요한 설정과 콘텐츠 상태를 현재 데이터 기준으로
                    확인합니다.
                  </p>
                </div>
                <div className="admin-readiness-score">
                  <strong>
                    {readinessReadyCount}/{readinessChecks.length}
                  </strong>
                  <span>준비 완료</span>
                </div>
              </div>
              <progress
                className="admin-readiness-progress"
                max={readinessChecks.length}
                value={readinessReadyCount}
                aria-label={`출시 준비 ${readinessChecks.length}개 중 ${readinessReadyCount}개 완료`}
              />
              <div className="admin-readiness-grid">
                {readinessChecks.map((check) => (
                  <article
                    className={`admin-readiness-item ${check.ready ? "ready" : "pending"}`}
                    key={check.id}
                  >
                    <span className="admin-readiness-icon" aria-hidden="true">
                      {check.ready ? (
                        <Check size={17} />
                      ) : (
                        <CircleHelp size={17} />
                      )}
                    </span>
                    <div>
                      <h4>{check.label}</h4>
                      <p>{check.detail}</p>
                    </div>
                    {!check.ready && check.target && (
                      <button onClick={() => changeTab(check.target!)}>
                        설정 열기 <ArrowRight size={13} />
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
            <div className="admin-dashboard-panels">
              <section>
                <div className="admin-dashboard-panel-heading">
                  <div>
                    <span>APPLICATIONS</span>
                    <h3>최근 신청</h3>
                  </div>
                  <button onClick={() => changeTab("applications")}>
                    전체 보기 <ArrowRight size={14} />
                  </button>
                </div>
                {applications.length ? (
                  [...applications]
                    .sort(
                      (a, b) =>
                        (timestampDate(b.createdAt)?.getTime() || 0) -
                        (timestampDate(a.createdAt)?.getTime() || 0),
                    )
                    .slice(0, 5)
                    .map((item) => (
                      <button
                        className="admin-dashboard-row"
                        key={item.id}
                        onClick={() => changeTab("applications")}
                      >
                        <span>
                          <strong>{item.name}</strong>
                          <small>
                            {events.find((event) => event.id === item.eventId)
                              ?.title || item.eventId}
                          </small>
                        </span>
                        <em className={`application-status ${item.status}`}>
                          {applicationStatusLabels[item.status]}
                        </em>
                      </button>
                    ))
                ) : (
                  <p className="admin-dashboard-empty">
                    아직 접수된 신청이 없습니다.
                  </p>
                )}
              </section>
              <section>
                <div className="admin-dashboard-panel-heading">
                  <div>
                    <span>ACTIVITY</span>
                    <h3>최근 관리자 활동</h3>
                  </div>
                  <button onClick={() => changeTab("auditLogs")}>
                    전체 보기 <ArrowRight size={14} />
                  </button>
                </div>
                {auditLogs.length ? (
                  auditLogs.slice(0, 5).map((log) => (
                    <div className="admin-dashboard-row" key={log.id}>
                      <span>
                        <strong>
                          {auditActionLabels[log.action] || log.action}
                        </strong>
                        <small>{log.details}</small>
                      </span>
                      <time>
                        {timestampDate(log.createdAt)?.toLocaleDateString(
                          "ko-KR",
                        ) || "확인 중"}
                      </time>
                    </div>
                  ))
                ) : (
                  <p className="admin-dashboard-empty">
                    아직 기록된 관리자 작업이 없습니다.
                  </p>
                )}
              </section>
            </div>
          </div>
        ) : tab === "overview" ? (
          <form className="admin-form overview-form" onSubmit={submitOverview}>
            <p className="admin-help">
              공개 사이트의 첫 화면과 팀 소개 문구입니다. 저장 즉시 반영됩니다.
            </p>
            {(
              [
                ["eyebrow", "상단 태그"],
                ["headline", "메인 문구 (줄바꿈 가능)"],
                ["description", "소개 문장"],
                ["mission", "팀 미션"],
                ["email", "문의 이메일"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                {key === "headline" ||
                key === "description" ||
                key === "mission" ? (
                  <textarea
                    rows={key === "headline" ? 3 : 4}
                    value={draftOverview[key]}
                    onChange={(e) =>
                      setDraftOverview({
                        ...draftOverview,
                        [key]: e.target.value,
                      })
                    }
                  />
                ) : (
                  <input
                    type={key === "email" ? "email" : "text"}
                    value={draftOverview[key]}
                    onChange={(e) =>
                      setDraftOverview({
                        ...draftOverview,
                        [key]: e.target.value,
                      })
                    }
                  />
                )}
              </label>
            ))}
            <button className="button button-primary" disabled={saving}>
              변경사항 저장 <Check size={18} />
            </button>
          </form>
        ) : tab === "privacy" ? (
          <form className="admin-form overview-form" onSubmit={submitPrivacy}>
            <p className="admin-help">
              운영 주체·문의처·보유 기간과 실제 처리방침을 확정한 뒤 게시하세요.
              안내가 게시되기 전에는 행사 신청이 차단됩니다.
            </p>
            <label>
              운영 주체
              <input
                required={draftPrivacy.published}
                value={draftPrivacy.operator}
                onChange={(e) =>
                  setDraftPrivacy({ ...draftPrivacy, operator: e.target.value })
                }
              />
            </label>
            <label>
              개인정보 문의처
              <input
                required={draftPrivacy.published}
                value={draftPrivacy.contact}
                onChange={(e) =>
                  setDraftPrivacy({ ...draftPrivacy, contact: e.target.value })
                }
              />
            </label>
            <label>
              보유 기간
              <input
                required={draftPrivacy.published}
                value={draftPrivacy.retention}
                onChange={(e) =>
                  setDraftPrivacy({
                    ...draftPrivacy,
                    retention: e.target.value,
                  })
                }
              />
            </label>
            <label>
              개인정보 처리방침 전문
              <textarea
                required={draftPrivacy.published}
                rows={12}
                value={draftPrivacy.body}
                onChange={(e) =>
                  setDraftPrivacy({ ...draftPrivacy, body: e.target.value })
                }
              />
            </label>
            <label className="admin-check">
              <input
                type="checkbox"
                checked={draftPrivacy.published}
                onChange={(e) =>
                  setDraftPrivacy({
                    ...draftPrivacy,
                    published: e.target.checked,
                  })
                }
              />{" "}
              개인정보 안내 게시 및 행사 신청 허용
            </label>
            <button className="button button-primary" disabled={saving}>
              변경사항 저장 <Check size={18} />
            </button>
          </form>
        ) : tab === "members" ? (
          <div className="admin-content">
            <form className="admin-form member-form" onSubmit={submitMember}>
              <p className="admin-help">
                관리자와 내부자 역할을 독립적으로 설정합니다. 관리자는 사이트
                운영 도구를, 내부자는 인트라넷을 이용합니다. 이메일은 Firebase
                Authentication 계정과 정확히 같아야 합니다. 비활성화하면 기록은
                유지하면서 두 역할의 접근을 즉시 차단합니다.
              </p>
              <div className="form-grid">
                <label>
                  구성원 이메일
                  <input
                    required
                    type="email"
                    value={memberEmail}
                    onChange={(event) => setMemberEmail(event.target.value)}
                    placeholder="member@geekbyte.kro.kr"
                  />
                </label>
                <label>
                  표시 이름
                  <input
                    required
                    value={memberName}
                    onChange={(event) => setMemberName(event.target.value)}
                    placeholder="이름 또는 역할"
                  />
                </label>
              </div>
              <div className="member-role-selector">
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={newAdminAccess}
                    onChange={(event) =>
                      setNewAdminAccess(event.target.checked)
                    }
                  />{" "}
                  관리자 역할
                </label>
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={newMemberAccess}
                    onChange={(event) =>
                      setNewMemberAccess(event.target.checked)
                    }
                  />{" "}
                  내부자 역할
                </label>
              </div>
              <button className="button button-primary" disabled={saving}>
                계정 역할 저장 <ShieldCheck size={17} />
              </button>
            </form>
            <div className="admin-list member-list">
              <p className="application-count" role="status">
                등록된 구성원 {members.length}명
              </p>
              {members.length ? (
                [...members]
                  .sort((a, b) => a.email.localeCompare(b.email))
                  .map((member) => {
                    const protectsCurrentAdmin =
                      member.id === currentUserEmail && !hasRootAdminClaim;
                    return (
                      <article className="admin-row" key={member.id}>
                        <div>
                          <div className="member-role-badges">
                            <span
                              className={`member-role-badge member-account-state ${member.active ? "status-active" : "status-inactive"}`}
                            >
                              {member.active ? "활성" : "비활성"}
                            </span>
                            <span
                              className={`member-role-badge ${member.adminAccess ? "active" : ""}`}
                            >
                              관리자
                            </span>
                            <span
                              className={`member-role-badge ${member.memberAccess ? "active" : ""}`}
                            >
                              내부자
                            </span>
                          </div>
                          <h3>{member.displayName || "이름 없음"}</h3>
                          <p>{member.email}</p>
                          {protectsCurrentAdmin && (
                            <small className="member-self-protection">
                              현재 로그인한 관리자 계정은 자기 잠금 방지를 위해
                              관리자 역할과 계정 항목을 직접 해제할 수 없습니다.
                            </small>
                          )}
                        </div>
                        <div className="admin-row-actions">
                          {roleConfirmKey === `admin:${member.id}` ? (
                            <span className="admin-delete-confirm">
                              <button
                                className="danger"
                                disabled={saving}
                                onClick={() =>
                                  toggleMemberRole(member, "adminAccess")
                                }
                              >
                                관리자 {member.adminAccess ? "해제" : "부여"}{" "}
                                확인
                              </button>
                              <button onClick={() => setRoleConfirmKey(null)}>
                                취소
                              </button>
                            </span>
                          ) : (
                            <button
                              disabled={saving || protectsCurrentAdmin}
                              title={
                                protectsCurrentAdmin
                                  ? "현재 관리자 권한은 다른 관리자 또는 루트 관리자가 변경해야 합니다."
                                  : undefined
                              }
                              onClick={() =>
                                setRoleConfirmKey(`admin:${member.id}`)
                              }
                            >
                              {member.adminAccess ? (
                                <EyeOff size={17} />
                              ) : (
                                <Eye size={17} />
                              )}
                              관리자 {member.adminAccess ? "해제" : "부여"}
                            </button>
                          )}
                          {roleConfirmKey === `member:${member.id}` ? (
                            <span className="admin-delete-confirm">
                              <button
                                className="danger"
                                disabled={saving}
                                onClick={() =>
                                  toggleMemberRole(member, "memberAccess")
                                }
                              >
                                내부자 {member.memberAccess ? "해제" : "부여"}{" "}
                                확인
                              </button>
                              <button onClick={() => setRoleConfirmKey(null)}>
                                취소
                              </button>
                            </span>
                          ) : (
                            <button
                              disabled={saving}
                              onClick={() =>
                                setRoleConfirmKey(`member:${member.id}`)
                              }
                            >
                              {member.memberAccess ? (
                                <EyeOff size={17} />
                              ) : (
                                <Eye size={17} />
                              )}
                              내부자 {member.memberAccess ? "해제" : "부여"}
                            </button>
                          )}
                          {roleConfirmKey === `active:${member.id}` ? (
                            <span className="admin-delete-confirm">
                              <button
                                className={member.active ? "danger" : ""}
                                disabled={saving}
                                onClick={() => toggleMemberActive(member)}
                              >
                                계정 {member.active ? "비활성화" : "활성화"}{" "}
                                확인
                              </button>
                              <button onClick={() => setRoleConfirmKey(null)}>
                                취소
                              </button>
                            </span>
                          ) : (
                            <button
                              disabled={saving || protectsCurrentAdmin}
                              title={
                                protectsCurrentAdmin
                                  ? "현재 관리자 계정은 다른 관리자 또는 루트 관리자가 비활성화해야 합니다."
                                  : undefined
                              }
                              onClick={() =>
                                setRoleConfirmKey(`active:${member.id}`)
                              }
                            >
                              {member.active ? (
                                <EyeOff size={17} />
                              ) : (
                                <Check size={17} />
                              )}
                              {member.active ? "비활성화" : "활성화"}
                            </button>
                          )}
                          {deletingId === `member:${member.id}` ? (
                            <span className="admin-delete-confirm">
                              <button
                                className="danger"
                                disabled={saving}
                                onClick={() => removeMember(member.id)}
                              >
                                삭제 확인
                              </button>
                              <button onClick={() => setDeletingId(null)}>
                                취소
                              </button>
                            </span>
                          ) : (
                            <button
                              className="icon-danger"
                              disabled={saving || protectsCurrentAdmin}
                              onClick={() =>
                                setDeletingId(`member:${member.id}`)
                              }
                              aria-label={`${member.email} 구성원 권한 삭제`}
                            >
                              <Trash2 size={17} />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })
              ) : (
                <p className="admin-empty">등록된 구성원이 없습니다.</p>
              )}
            </div>
          </div>
        ) : tab === "auditLogs" ? (
          <div className="admin-list audit-log-list">
            <p className="admin-help">
              최근 관리자 작업 100건입니다. 기록은 관리자도 수정하거나 삭제할 수
              없습니다.
            </p>
            <div className="application-toolbar audit-toolbar">
              <label>
                <span>기록 검색</span>
                <input
                  type="search"
                  value={auditQuery}
                  onChange={(event) => setAuditQuery(event.target.value)}
                  placeholder="담당자, 대상, 세부 내용"
                />
              </label>
              <label>
                <span>작업 유형</span>
                <select
                  value={auditAction}
                  onChange={(event) => setAuditAction(event.target.value)}
                >
                  <option value="all">전체 작업</option>
                  {auditActions.map((action) => (
                    <option value={action} key={action}>
                      {auditActionLabels[action] || action}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button button-ghost"
                disabled={!filteredAuditLogs.length}
                onClick={exportAuditLogs}
              >
                <Download size={16} /> CSV 내보내기
              </button>
            </div>
            <p className="application-count" role="status">
              전체 {auditLogs.length}건 중 {filteredAuditLogs.length}건 표시
            </p>
            {auditLogs.length ? (
              filteredAuditLogs.length ? (
                filteredAuditLogs.map((log) => (
                  <article className="audit-log-record" key={log.id}>
                    <div className="audit-log-meta">
                      <span>{auditActionLabels[log.action] || log.action}</span>
                      <time>
                        {timestampDate(log.createdAt)?.toLocaleString(
                          "ko-KR",
                        ) || "시간 확인 중"}
                      </time>
                    </div>
                    <h3>{log.details}</h3>
                    <p>{log.target}</p>
                    <small>{log.actor}</small>
                  </article>
                ))
              ) : (
                <p className="admin-empty">
                  검색 조건에 맞는 활동 기록이 없습니다.
                </p>
              )
            ) : (
              <p className="admin-empty">아직 기록된 관리자 작업이 없습니다.</p>
            )}
          </div>
        ) : tab === "dmAudit" ? (
          <AdminDirectMessages user={currentUser} />
        ) : tab === "applications" ? (
          <div className="admin-list">
            <p className="admin-help">
              신청자의 개인정보가 포함되어 있습니다. 업무 목적 외 공유하지
              마세요.
            </p>
            <div className="application-toolbar">
              <label>
                <span>신청 검색</span>
                <input
                  type="search"
                  value={applicationQuery}
                  onChange={(event) => setApplicationQuery(event.target.value)}
                  placeholder="이름, 이메일, 연락처, 행사"
                />
              </label>
              <label>
                <span>상태</span>
                <select
                  value={applicationStatus}
                  onChange={(event) =>
                    setApplicationStatus(
                      event.target.value as "all" | Application["status"],
                    )
                  }
                >
                  <option value="all">전체 상태</option>
                  <option value="new">신규</option>
                  <option value="reviewing">검토 중</option>
                  <option value="accepted">승인</option>
                  <option value="declined">미선정</option>
                  <option value="cancelled">신청 취소</option>
                </select>
              </label>
              <button
                className="button button-ghost"
                disabled={!filteredApplications.length}
                onClick={exportApplications}
              >
                <Download size={16} /> CSV 내보내기
              </button>
            </div>
            <p className="application-count" role="status">
              전체 {applications.length}건 중 {filteredApplications.length}건
              표시
            </p>
            {applications.length ? (
              filteredApplications.length ? (
                filteredApplications.map((item) => (
                  <article className="application-record" key={item.id}>
                    <div>
                      <span className={`admin-pill ${item.status}`}>
                        {applicationStatusLabels[item.status]}
                      </span>
                      <h3>
                        {item.name} <small>{item.email}</small>
                      </h3>
                      <p>
                        행사:{" "}
                        {events.find((c) => c.id === item.eventId)?.title ||
                          item.eventId}
                      </p>
                      <p>연락처: {item.phone}</p>
                      <p>신청 동기: {item.motivation || "없음"}</p>
                    </div>
                    <div className="application-actions">
                      <select
                        value={item.status}
                        disabled={saving}
                        onChange={async (e) => {
                          setSaving(true);
                          try {
                            await onStatus(
                              item,
                              e.target.value as Application["status"],
                            );
                          } catch {
                            setMessage("상태 변경에 실패했습니다.");
                          } finally {
                            setSaving(false);
                          }
                        }}
                        aria-label={`${item.name} 신청 상태`}
                      >
                        <option value="new">신규</option>
                        <option value="reviewing">검토 중</option>
                        <option value="accepted">승인</option>
                        <option value="declined">미선정</option>
                        <option value="cancelled">신청 취소</option>
                      </select>
                      {deletingId === `application:${item.id}` ? (
                        <span className="admin-delete-confirm">
                          <button
                            className="danger"
                            disabled={saving}
                            onClick={() => removeApplication(item.id)}
                          >
                            삭제 확인
                          </button>
                          <button onClick={() => setDeletingId(null)}>
                            취소
                          </button>
                        </span>
                      ) : (
                        <button
                          className="icon-danger"
                          disabled={saving}
                          onClick={() =>
                            setDeletingId(`application:${item.id}`)
                          }
                          aria-label={`${item.name} 신청 내역 삭제`}
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <p className="admin-empty">검색 조건에 맞는 신청이 없습니다.</p>
              )
            ) : (
              <p className="admin-empty">아직 접수된 신청이 없습니다.</p>
            )}
          </div>
        ) : (
          <div className="admin-content">
            <div className="admin-list-heading">
              <p className="admin-help">
                게시 상태인 항목만
                {tab.startsWith("intranet") || tab === "chatChannels"
                  ? " 구성원 인트라넷에 표시됩니다."
                  : " 공개 사이트에 표시됩니다."}
              </p>
              <button
                className="button button-primary"
                onClick={() => startEdit()}
              >
                <Plus size={17} /> 새 항목
              </button>
            </div>
            {editingId && (
              <form className="admin-form entry-form" onSubmit={submitEntry}>
                <div className="entry-form-heading">
                  <h2>{editingId === "new" ? "새 항목 등록" : "항목 수정"}</h2>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    aria-label="편집 닫기"
                  >
                    <X size={18} />
                  </button>
                </div>
                {tab === "history" && (
                  <>
                    {textField("year", "표시 번호 또는 연도", true)}
                    {textField("title", "제목", true)}
                    {textField("description", "설명", true, true)}
                    <label>
                      정렬 순서
                      <input
                        type="number"
                        value={Number(entryDraft.order || 1)}
                        onChange={(e) =>
                          setEntryDraft({
                            ...entryDraft,
                            order: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </>
                )}
                {tab === "notices" && (
                  <>
                    {textField("title", "제목", true)}
                    {textField("body", "내용", true, true)}
                    {textField("date", "날짜", true)}
                    <label className="admin-check">
                      <input
                        type="checkbox"
                        checked={Boolean(entryDraft.pinned)}
                        onChange={(e) =>
                          setEntryDraft({
                            ...entryDraft,
                            pinned: e.target.checked,
                          })
                        }
                      />{" "}
                      상단 고정
                    </label>
                  </>
                )}
                {tab === "intranetNotices" && (
                  <>
                    {textField("title", "내부 공지 제목", true)}
                    {textField("body", "내용", true, true)}
                    {textField("date", "날짜", true)}
                    <label className="admin-check">
                      <input
                        type="checkbox"
                        checked={Boolean(entryDraft.pinned)}
                        onChange={(e) =>
                          setEntryDraft({
                            ...entryDraft,
                            pinned: e.target.checked,
                          })
                        }
                      />{" "}
                      필독 공지
                    </label>
                  </>
                )}
                {tab === "products" && (
                  <>
                    {textField("name", "제품·서비스 이름", true)}
                    {textField("category", "분류", true)}
                    {textField("description", "설명", true, true)}
                    {textField("url", "외부 링크 (선택)")}
                    {textField("status", "상태")}
                    {textField("imageUrl", "이미지 URL (HTTPS)")}
                    <label className="product-image-field">
                      이미지 미리보기
                      {safeImageUrl(String(entryDraft.imageUrl || "")) ? (
                        <img
                          className="product-image-preview"
                          src={safeImageUrl(String(entryDraft.imageUrl || ""))!}
                          alt={String(
                            entryDraft.imageAlt || "제품 이미지 미리보기",
                          )}
                        />
                      ) : (
                        <span className="product-image-empty">
                          HTTPS 이미지 주소를 입력하면 여기에 표시됩니다.
                        </span>
                      )}
                    </label>
                    {textField("imageAlt", "이미지 설명 (접근성)")}
                    {orderField}
                  </>
                )}
                {tab === "events" && (
                  <>
                    {textField("title", "행사 이름", true)}
                    <label>
                      행사 유형
                      <select
                        value={String(entryDraft.category || "세미나")}
                        onChange={(e) =>
                          setEntryDraft({
                            ...entryDraft,
                            category: e.target.value,
                          })
                        }
                      >
                        <option>강연</option>
                        <option>세미나</option>
                        <option>워크숍</option>
                        <option>밋업</option>
                        <option>네트워킹</option>
                        <option>해커톤</option>
                        <option>기타</option>
                      </select>
                    </label>
                    {textField("description", "설명", true, true)}
                    {textField("schedule", "일정")}
                    {textField("format", "진행 방식 (온라인·오프라인·혼합)")}
                    {textField("location", "장소 또는 접속 안내")}
                    {textField("capacity", "정원 (선택)")}
                    {textField("registrationDeadline", "신청 마감일")}
                    {orderField}
                    <label className="admin-check">
                      <input
                        type="checkbox"
                        checked={Boolean(entryDraft.registrationOpen)}
                        onChange={(e) =>
                          setEntryDraft({
                            ...entryDraft,
                            registrationOpen: e.target.checked,
                          })
                        }
                      />{" "}
                      신청 접수
                    </label>
                  </>
                )}
                {tab === "intranetResources" && (
                  <>
                    {textField("title", "자료 이름", true)}
                    {textField("category", "분류", true)}
                    {textField("description", "설명", true, true)}
                    {textField("url", "자료 링크 (HTTPS)", true)}
                    {orderField}
                  </>
                )}
                {tab === "intranetProjects" && (
                  <>
                    {textField("title", "프로젝트 이름", true)}
                    {textField("summary", "현재 상황 요약", true, true)}
                    {textField("owner", "담당자 또는 팀")}
                    {orderField}
                    <label>
                      진행 상태
                      <select
                        value={String(entryDraft.status || "planning")}
                        onChange={(event) =>
                          setEntryDraft({
                            ...entryDraft,
                            status: event.target.value,
                          })
                        }
                      >
                        <option value="planning">기획</option>
                        <option value="active">진행 중</option>
                        <option value="blocked">확인 필요</option>
                        <option value="done">완료</option>
                      </select>
                    </label>
                    <label>
                      진행률 (0–100)
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={Number(entryDraft.progress || 0)}
                        onChange={(event) =>
                          setEntryDraft({
                            ...entryDraft,
                            progress: Math.max(
                              0,
                              Math.min(100, Number(event.target.value)),
                            ),
                          })
                        }
                      />
                    </label>
                    {textField("url", "프로젝트 링크 (HTTPS, 선택)")}
                  </>
                )}
                {tab === "intranetMeetings" && (
                  <>
                    {textField("title", "회의 제목", true)}
                    {textField("date", "회의 날짜", true)}
                    {textField("summary", "회의 요약", true, true)}
                    {textField("decisions", "결정 사항", false, true)}
                    {textField("nextActions", "다음 할 일", false, true)}
                  </>
                )}
                {tab === "intranetProfiles" && (
                  <>
                    {textField("displayName", "표시 이름", true)}
                    {textField("role", "역할 또는 담당 분야", true)}
                    {textField("bio", "소개", false, true)}
                    {textField("skills", "기술·관심 분야")}
                    {orderField}
                  </>
                )}
                {tab === "intranetEvents" && (
                  <>
                    {textField("title", "내부 행사 이름", true)}
                    {textField("category", "행사 유형", true)}
                    {textField("description", "행사 설명", true, true)}
                    {textField("date", "행사 날짜", true)}
                    {textField("startTime", "시작 시간")}
                    {textField("endTime", "종료 시간")}
                    {textField("location", "장소 또는 접속 안내")}
                    {textField("organizer", "주최자 또는 팀")}
                    {textField("url", "행사 링크 (HTTPS, 선택)")}
                    {orderField}
                  </>
                )}
                {tab === "chatChannels" && (
                  <>
                    {textField("name", "채널 이름", true)}
                    {textField("description", "채널 설명", false, true)}
                    <label>
                      채널 유형
                      <select
                        value={String(entryDraft.kind || "chat")}
                        onChange={(event) =>
                          setEntryDraft({
                            ...entryDraft,
                            kind: event.target.value,
                          })
                        }
                      >
                        <option value="chat">일반 대화</option>
                        <option value="announcement">관리자 공지 전용</option>
                      </select>
                    </label>
                    {orderField}
                  </>
                )}
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={Boolean(entryDraft.published)}
                    onChange={(e) =>
                      setEntryDraft({
                        ...entryDraft,
                        published: e.target.checked,
                      })
                    }
                  />{" "}
                  {tab.startsWith("intranet") || tab === "chatChannels"
                    ? "인트라넷에 게시"
                    : "공개 사이트에 게시"}
                </label>
                <div className="entry-actions">
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => setEditingId(null)}
                  >
                    취소
                  </button>
                  <button className="button button-primary" disabled={saving}>
                    저장 <Check size={17} />
                  </button>
                </div>
              </form>
            )}
            <div className="admin-list">
              {collections[tab].length ? (
                [...collections[tab]]
                  .sort((a, b) => displayOrder(a) - displayOrder(b))
                  .map((item) => (
                    <article className="admin-row" key={item.id}>
                      <div>
                        <span
                          className={
                            item.published
                              ? "admin-pill published"
                              : "admin-pill"
                          }
                        >
                          {item.published ? "게시 중" : "비공개"}
                        </span>
                        <h3>
                          {"title" in item
                            ? String(item.title)
                            : "name" in item
                              ? String(item.name)
                              : "displayName" in item
                                ? String(item.displayName)
                                : item.id}
                        </h3>
                        <p>
                          {"description" in item
                            ? String(item.description)
                            : "body" in item
                              ? String(item.body)
                              : "bio" in item
                                ? String(item.bio)
                                : ""}
                        </p>
                      </div>
                      <div className="admin-row-actions">
                        <button
                          disabled={saving}
                          onClick={() => togglePublished(item)}
                          aria-label={`${item.published ? "비공개로 전환" : "게시"}`}
                        >
                          {item.published ? (
                            <EyeOff size={17} />
                          ) : (
                            <Eye size={17} />
                          )}
                          {item.published ? "비공개" : "게시"}
                        </button>
                        <button
                          disabled={saving}
                          onClick={() => startEdit(item)}
                        >
                          수정 <ArrowUpRight size={17} />
                        </button>
                        {deletingId === item.id ? (
                          <span className="admin-delete-confirm">
                            <button
                              className="danger"
                              disabled={saving}
                              onClick={() => removeEntry(item.id)}
                            >
                              삭제 확인
                            </button>
                            <button onClick={() => setDeletingId(null)}>
                              취소
                            </button>
                          </span>
                        ) : (
                          <button
                            className="icon-danger"
                            disabled={saving}
                            onClick={() => setDeletingId(item.id)}
                            aria-label={`${
                              "title" in item
                                ? String(item.title)
                                : "name" in item
                                  ? String(item.name)
                                  : "displayName" in item
                                    ? String(item.displayName)
                                    : "항목"
                            } 삭제`}
                          >
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                    </article>
                  ))
              ) : (
                <p className="admin-empty">
                  등록된 항목이 없습니다. 첫 항목을 추가해 보세요.
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
