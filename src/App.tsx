import { useEffect, useMemo, useState, type FormEvent } from "react";
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
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Code2,
  LockKeyhole,
  Menu,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { auth, configured, db } from "./firebase";
import {
  defaultOverview,
  defaultPrivacy,
  starterHistory,
  type Application,
  type Event,
  type Entry,
  type HistoryItem,
  type Notice,
  type Overview,
  type Privacy,
  type Product,
} from "./types";
import logo from "../Geek Byte Logo.png";

type CollectionName =
  "history" | "notices" | "products" | "events" | "applications";
type AdminTab = "overview" | "privacy" | CollectionName;
const initialForm = {
  name: "",
  email: "",
  phone: "",
  motivation: "",
  consent: false,
};
function safeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function safeImageUrl(value: string) {
  const url = safeHttpUrl(value);
  return url?.startsWith("https://") ? url : null;
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
    published: false,
  },
};

function useEntries<T extends Entry>(
  name: Exclude<CollectionName, "applications">,
  admin: boolean,
  fallback: T[] = [],
) {
  const [items, setItems] = useState<T[]>(fallback);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!db) return;
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
  }, [name, admin]);
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
  ]);
  const page = validPaths.has(normalizedPath) ? normalizedPath : "/404";
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [overview, setOverview] = useState<Overview>(defaultOverview);
  const [privacy, setPrivacy] = useState<Privacy>(defaultPrivacy);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [activeAdmin, setActiveAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTab>("overview");
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [applicationForm, setApplicationForm] = useState(initialForm);
  const [applicationMessage, setApplicationMessage] = useState("");
  const [savingApplication, setSavingApplication] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [adminMessage, setAdminMessage] = useState("");

  const history = useEntries<HistoryItem>(
    "history",
    isAdmin,
    configured ? [] : starterHistory,
  );
  const notices = useEntries<Notice>("notices", isAdmin);
  const products = useEntries<Product>("products", isAdmin);
  const events = useEntries<Event>("events", isAdmin);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, async (current) => {
      setUser(current);
      try {
        const token = current ? await current.getIdTokenResult(true) : null;
        setIsAdmin(token?.claims.admin === true);
      } catch {
        setIsAdmin(false);
      }
      if (!current) setActiveAdmin(false);
    });
  }, []);

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
    () => products.items.filter((x) => x.published),
    [products.items],
  );
  const visibleEvents = useMemo(
    () => events.items.filter((x) => x.published),
    [events.items],
  );
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
    const titles: Record<string, string> = {
      "/": "Geek Byte — Build what matters.",
      "/about": "팀 소개 | Geek Byte",
      "/products": "제품·서비스 | Geek Byte",
      "/notices": "소식 | Geek Byte",
      "/events": "행사 | Geek Byte",
      "/contact": "문의 | Geek Byte",
      "/404": "페이지를 찾을 수 없습니다 | Geek Byte",
    };
    document.title = titles[page];
  }, [page, normalizedPath]);

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

  async function saveOverview(next: Overview) {
    if (!db) return;
    await setDoc(doc(db, "site", "overview"), next);
    setAdminMessage("소개 내용이 저장되었습니다.");
  }

  async function savePrivacy(next: Privacy) {
    if (!db) return;
    await setDoc(doc(db, "site", "privacy"), next);
    setAdminMessage("개인정보 안내가 저장되었습니다.");
  }

  async function saveEntry(
    name: Exclude<CollectionName, "applications">,
    entry: Record<string, unknown>,
    id?: string,
  ) {
    if (!db) return;
    if (id) await setDoc(doc(db, name, id), entry);
    else await addDoc(collection(db, name), entry);
    setAdminMessage("저장되었습니다.");
  }

  async function changeApplicationStatus(
    item: Application,
    status: Application["status"],
  ) {
    if (!db) return;
    await updateDoc(doc(db, "applications", item.id), { status });
    setAdminMessage("신청 상태가 변경되었습니다.");
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

        <main id="top">
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

          {page !== "/" && page !== "/404" && (
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
                            safeImageUrl(item.imageUrl || "")
                              ? "product-art has-product-image"
                              : "product-art"
                          }
                        >
                          {safeImageUrl(item.imageUrl || "") ? (
                            <img
                              src={safeImageUrl(item.imageUrl || "")!}
                              alt={item.imageAlt || item.name}
                              loading="lazy"
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
                          {safeHttpUrl(item.url) && (
                            <a
                              href={safeHttpUrl(item.url)!}
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
                <div className="event-grid">
                  {visibleEvents.length ? (
                    visibleEvents.map((event, i) => (
                      <article className="event-card" key={event.id}>
                        <div className="event-top">
                          <span className="event-number">
                            EVENT / {String(i + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={
                              event.registrationOpen
                                ? "event-badge"
                                : "event-badge closed"
                            }
                          >
                            {event.registrationOpen ? "모집 중" : "모집 마감"}
                          </span>
                        </div>
                        <span className="event-category">{event.category}</span>
                        <h3>{event.title}</h3>
                        <p>{event.description}</p>
                        <div className="event-info">
                          <span>{event.schedule || "일정 추후 안내"}</span>
                          <span>{event.location || event.format}</span>
                          {event.capacity && <span>정원 {event.capacity}</span>}
                        </div>
                        {event.registrationDeadline && (
                          <span className="event-deadline">
                            신청 마감 {event.registrationDeadline}
                          </span>
                        )}
                        <button
                          className="event-button"
                          disabled={!event.registrationOpen}
                          onClick={() => openApplication(event)}
                        >
                          {event.registrationOpen
                            ? "행사 신청하기"
                            : "신청 마감"}{" "}
                          <ArrowUpRight size={18} />
                        </button>
                      </article>
                    ))
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
              <div>
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
                <a className="contact-link" href={`mailto:${overview.email}`}>
                  {overview.email}
                  <ArrowUpRight size={25} />
                </a>
              ) : (
                <span className="contact-link pending">
                  연락 채널 준비 중 <ArrowUpRight size={25} />
                </span>
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
                    role="status"
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
          applications={applications}
          tab={adminTab}
          setTab={setAdminTab}
          onClose={() => setActiveAdmin(false)}
          onSaveOverview={saveOverview}
          onSavePrivacy={savePrivacy}
          onSaveEntry={saveEntry}
          onStatus={changeApplicationStatus}
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
  applications: Application[];
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
    applications,
    tab,
    setTab,
    onClose,
    onSaveOverview,
    onSavePrivacy,
    onSaveEntry,
    onStatus,
    message,
    setMessage,
  } = props;
  const [draftOverview, setDraftOverview] = useState(overview);
  const [draftPrivacy, setDraftPrivacy] = useState(privacy);
  useEffect(() => {
    setDraftOverview(overview);
  }, [overview]);
  useEffect(() => {
    setDraftPrivacy(privacy);
  }, [privacy]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entryDraft, setEntryDraft] = useState<Record<string, unknown>>(
    emptyEditors.history,
  );
  const [saving, setSaving] = useState(false);
  const collections: Record<
    Exclude<CollectionName, "applications">,
    Entry[]
  > = { history, notices, products, events };
  const labels: Record<AdminTab, string> = {
    overview: "사이트 소개",
    privacy: "개인정보 안내",
    history: "연혁",
    notices: "공지사항",
    products: "제품·서비스",
    events: "행사",
    applications: "행사 신청",
  };

  function changeTab(next: AdminTab) {
    setTab(next);
    setEditingId(null);
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
          type={key === "url" ? "url" : key === "date" ? "date" : "text"}
          value={String(entryDraft[key] ?? "")}
          onChange={(e) =>
            setEntryDraft({ ...entryDraft, [key]: e.target.value })
          }
        />
      )}
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
      <main className="admin-main">
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
        {tab === "overview" ? (
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
        ) : tab === "applications" ? (
          <div className="admin-list">
            <p className="admin-help">
              신청자의 개인정보가 포함되어 있습니다. 업무 목적 외 공유하지
              마세요.
            </p>
            {applications.length ? (
              applications
                .sort(
                  (a, b) =>
                    (b.createdAt?.toDate()?.getTime() || 0) -
                    (a.createdAt?.toDate()?.getTime() || 0),
                )
                .map((item) => (
                  <article className="application-record" key={item.id}>
                    <div>
                      <span className="admin-pill">{item.status}</span>
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
                    <select
                      value={item.status}
                      onChange={async (e) => {
                        try {
                          await onStatus(
                            item,
                            e.target.value as Application["status"],
                          );
                        } catch {
                          setMessage("상태 변경에 실패했습니다.");
                        }
                      }}
                      aria-label={`${item.name} 신청 상태`}
                    >
                      <option value="new">신규</option>
                      <option value="reviewing">검토 중</option>
                      <option value="accepted">승인</option>
                      <option value="declined">거절</option>
                    </select>
                  </article>
                ))
            ) : (
              <p className="admin-empty">아직 접수된 신청이 없습니다.</p>
            )}
          </div>
        ) : (
          <div className="admin-content">
            <div className="admin-list-heading">
              <p className="admin-help">
                게시 상태인 항목만 공개 사이트에 표시됩니다.
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
                    {textField("registrationDeadline", "신청 마감일 (선택)")}
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
                  공개 사이트에 게시
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
                collections[tab].map((item) => (
                  <article className="admin-row" key={item.id}>
                    <div>
                      <span
                        className={
                          item.published ? "admin-pill published" : "admin-pill"
                        }
                      >
                        {item.published ? "게시 중" : "비공개"}
                      </span>
                      <h3>
                        {"title" in item
                          ? String(item.title)
                          : "name" in item
                            ? String(item.name)
                            : item.id}
                      </h3>
                      <p>
                        {"description" in item
                          ? String(item.description)
                          : "body" in item
                            ? String(item.body)
                            : ""}
                      </p>
                    </div>
                    <button onClick={() => startEdit(item)}>
                      수정 <ArrowUpRight size={17} />
                    </button>
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
