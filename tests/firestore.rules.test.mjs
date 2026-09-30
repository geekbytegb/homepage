import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

let environment;

function validProduct(name = "Approved") {
  return {
    name,
    category: "Service",
    description: "A production ready Geek Byte service.",
    url: "https://example.com/product",
    status: "Available",
    imageUrl: "https://example.com/product.png",
    imageAlt: `${name} preview`,
    published: true,
  };
}
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-geek-byte",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    const store = context.firestore();
    await setDoc(doc(store, "notices", "published"), {
      title: "Public",
      published: true,
    });
    await setDoc(doc(store, "notices", "draft"), {
      title: "Draft",
      published: false,
    });
    await setDoc(doc(store, "events", "event1"), {
      title: "Event",
      published: true,
      registrationOpen: true,
      registrationDeadlineAt: Timestamp.fromDate(
        new Date("2099-12-31T23:59:59Z"),
      ),
    });
    await setDoc(doc(store, "site", "privacy"), {
      published: true,
      operator: "Geek Byte",
      contact: "contact@example.com",
      retention: "1 year",
      retentionDays: 365,
      body: "Geek Byte 개인정보 처리방침은 수집 항목, 이용 목적, 보유 기간, 파기 절차, 정보주체의 권리와 문의 방법을 구체적으로 안내합니다. 자세한 내용입니다.",
    });
    await setDoc(doc(store, "intranetNotices", "internal"), {
      title: "Internal",
      body: "Members only",
      published: true,
    });
    await setDoc(doc(store, "intranetProjects", "project"), {
      title: "Project",
      published: true,
    });
    await setDoc(doc(store, "intranetMeetings", "meeting"), {
      title: "Meeting",
      published: true,
    });
    await setDoc(doc(store, "intranetNotices", "internal-draft"), {
      title: "Internal draft",
      body: "Administrators only",
      published: false,
    });
    await setDoc(doc(store, "intranetProfiles", "profile"), {
      displayName: "Geek Byte Member",
      role: "Developer",
      published: true,
    });
    await setDoc(doc(store, "intranetProfiles", "profile-draft"), {
      displayName: "Draft Member",
      role: "Developer",
      published: false,
    });
    await setDoc(doc(store, "intranetEvents", "internal-event"), {
      title: "Team Day",
      published: true,
    });
    await setDoc(doc(store, "intranetEvents", "internal-event-draft"), {
      title: "Secret Team Day",
      published: false,
    });
    await setDoc(doc(store, "chatChannels", "general"), {
      name: "general",
      kind: "chat",
      published: true,
    });
    await setDoc(doc(store, "chatChannels", "announcements"), {
      name: "announcements",
      kind: "announcement",
      published: true,
    });
    await setDoc(doc(store, "chatChannels", "draft-channel"), {
      name: "draft",
      kind: "chat",
      published: false,
    });
    await setDoc(doc(store, "memberIdentities", "member-a"), {
      uid: "member-a",
      displayName: "Member A",
      updatedAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
    });
    await setDoc(doc(store, "memberIdentities", "member-b"), {
      uid: "member-b",
      displayName: "Member B",
      updatedAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
    });
    await setDoc(doc(store, "memberIdentities", "member-d"), {
      uid: "member-d",
      displayName: "Member D",
      updatedAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
    });
    await setDoc(doc(store, "directConversations", "member-a--member-b"), {
      participants: ["member-a", "member-b"],
      createdAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
    });
    await setDoc(
      doc(
        store,
        "directConversations",
        "member-a--member-b",
        "messages",
        "seed-message",
      ),
      {
        authorUid: "member-a",
        authorName: "Member A",
        text: "Private hello",
        createdAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
      },
    );
    await setDoc(doc(store, "members", "listed@example.com"), {
      email: "listed@example.com",
      displayName: "Listed Member",
      active: true,
      adminAccess: false,
      memberAccess: true,
    });
    await setDoc(doc(store, "members", "inactive@example.com"), {
      email: "inactive@example.com",
      displayName: "Inactive Member",
      active: false,
      adminAccess: false,
      memberAccess: true,
    });
    await setDoc(doc(store, "members", "siteadmin@example.com"), {
      email: "siteadmin@example.com",
      displayName: "Site Admin",
      active: true,
      adminAccess: true,
      memberAccess: false,
    });
    await setDoc(doc(store, "members", "managed@example.com"), {
      email: "managed@example.com",
      displayName: "Managed Member",
      active: true,
      adminAccess: false,
      memberAccess: true,
      updatedAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
    });
  });
});
after(async () => {
  await environment?.cleanup();
});

test("visitors can list published content but cannot read drafts or write", async () => {
  const store = environment.unauthenticatedContext().firestore();
  const published = await assertSucceeds(
    getDocs(
      query(collection(store, "notices"), where("published", "==", true)),
    ),
  );
  if (published.size !== 1)
    throw new Error("Unexpected published content count");
  await assertFails(getDoc(doc(store, "notices", "draft")));
  await assertFails(
    setDoc(doc(store, "notices", "injected"), {
      title: "Injected",
      published: true,
    }),
  );
});

test("a signed-in visitor cannot gain admin write access", async () => {
  const store = environment.authenticatedContext("visitor").firestore();
  await assertFails(
    setDoc(doc(store, "products", "injected"), {
      name: "Injected",
      published: true,
    }),
  );
});

test("only members and admins can read intranet content", async () => {
  const visitor = environment.authenticatedContext("visitor").firestore();
  await assertFails(getDoc(doc(visitor, "intranetNotices", "internal")));
  await assertFails(getDocs(collection(visitor, "intranetProfiles")));
  const member = environment
    .authenticatedContext("member", { member: true })
    .firestore();
  await assertSucceeds(getDoc(doc(member, "intranetNotices", "internal")));
  await assertFails(getDoc(doc(member, "intranetNotices", "internal-draft")));
  await assertSucceeds(getDoc(doc(member, "intranetProfiles", "profile")));
  await assertFails(getDoc(doc(member, "intranetProfiles", "profile-draft")));
  const publishedProfiles = await assertSucceeds(
    getDocs(
      query(
        collection(member, "intranetProfiles"),
        where("published", "==", true),
      ),
    ),
  );
  if (publishedProfiles.size !== 1)
    throw new Error("Unexpected intranet profile count");
  await assertFails(getDocs(collection(member, "intranetProfiles")));
  await assertFails(
    setDoc(doc(member, "intranetNotices", "member-write"), {
      title: "Not allowed",
      published: true,
    }),
  );
  const listedMember = environment
    .authenticatedContext("listed", { email: "listed@example.com" })
    .firestore();
  await assertSucceeds(
    getDoc(doc(listedMember, "intranetNotices", "internal")),
  );
  await assertSucceeds(
    getDoc(doc(listedMember, "intranetProjects", "project")),
  );
  await assertSucceeds(
    getDoc(doc(listedMember, "intranetMeetings", "meeting")),
  );
  await assertSucceeds(
    getDoc(doc(listedMember, "members", "listed@example.com")),
  );
  await assertFails(getDocs(collection(listedMember, "members")));
  const inactiveMember = environment
    .authenticatedContext("inactive", { email: "inactive@example.com" })
    .firestore();
  await assertFails(getDoc(doc(inactiveMember, "intranetNotices", "internal")));
  const admin = environment
    .authenticatedContext("admin", { admin: true })
    .firestore();
  await assertSucceeds(getDoc(doc(admin, "intranetNotices", "internal")));
  await assertSucceeds(
    setDoc(doc(admin, "intranetResources", "handbook"), {
      title: "Handbook",
      description: "Internal handbook",
      category: "Policy",
      url: "https://example.com/handbook",
      published: true,
    }),
  );
  await assertFails(
    setDoc(doc(admin, "chatChannels", "invalid-channel"), {
      name: "Invalid",
      description: "Unexpected channel type",
      kind: "external",
      published: true,
    }),
  );
  await assertSucceeds(getDoc(doc(admin, "intranetProfiles", "profile-draft")));
});

test("an admin claim grants content write and application read access", async () => {
  const store = environment
    .authenticatedContext("admin", { admin: true })
    .firestore();
  await assertSucceeds(
    setDoc(doc(store, "products", "approved"), validProduct()),
  );
  await assertFails(
    setDoc(doc(store, "products", "unsafe-link"), {
      ...validProduct("Unsafe"),
      url: "http://example.com/product",
    }),
  );
  await assertSucceeds(getDocs(collection(store, "applications")));
  await assertSucceeds(deleteDoc(doc(store, "notices", "draft")));
});

test("site settings accept only bounded overview and complete published privacy data", async () => {
  const store = environment
    .authenticatedContext("site-settings-admin", { admin: true })
    .firestore();
  await assertSucceeds(
    setDoc(doc(store, "site", "overview"), {
      eyebrow: "IDEAS INTO IMPACT",
      headline: "Technology that works",
      description: "Geek Byte introduction",
      mission: "Build and share",
      email: "contact@example.com",
    }),
  );
  await assertFails(
    setDoc(doc(store, "site", "overview"), {
      eyebrow: "IDEAS INTO IMPACT",
      headline: "Technology that works",
      description: "Geek Byte introduction",
      mission: "Build and share",
      email: "contact@example.com",
      injected: true,
    }),
  );
  await assertFails(
    setDoc(doc(store, "site", "privacy"), {
      published: true,
      operator: "Geek Byte",
      contact: "contact@example.com",
      retention: "1 year",
      retentionDays: 365,
      body: "임시",
    }),
  );
  await assertSucceeds(
    setDoc(doc(store, "site", "privacy"), {
      published: false,
      operator: "Geek Byte",
      contact: "contact@example.com",
      retention: "1 year",
      retentionDays: 365,
      body: "임시",
    }),
  );
  await assertSucceeds(
    setDoc(doc(store, "site", "privacy"), {
      published: true,
      operator: "Geek Byte",
      contact: "contact@example.com",
      retention: "1 year",
      retentionDays: 365,
      body: "Geek Byte 개인정보 처리방침은 수집 항목, 이용 목적, 보유 기간, 파기 절차, 정보주체의 권리와 문의 방법을 구체적으로 안내합니다. 자세한 내용입니다.",
    }),
  );
});

test("members can manage only their own RSVP for published internal events", async () => {
  const member = environment
    .authenticatedContext("rsvp-member", {
      member: true,
      name: "RSVP Member",
      email: "rsvp@example.com",
    })
    .firestore();
  const response = doc(
    member,
    "intranetEventRsvps",
    "internal-event_rsvp-member",
  );
  await assertSucceeds(
    setDoc(response, {
      eventId: "internal-event",
      userId: "rsvp-member",
      displayName: "RSVP Member",
      response: "going",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(response, {
      eventId: "internal-event",
      userId: "rsvp-member",
      displayName: "Spoofed Member",
      response: "maybe",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(
      doc(member, "intranetEventRsvps", "internal-event-draft_rsvp-member"),
      {
        eventId: "internal-event-draft",
        userId: "rsvp-member",
        displayName: "RSVP Member",
        response: "going",
        updatedAt: serverTimestamp(),
      },
    ),
  );
  const other = environment
    .authenticatedContext("other-rsvp", {
      member: true,
      name: "Other Member",
    })
    .firestore();
  await assertFails(
    deleteDoc(doc(other, "intranetEventRsvps", "internal-event_rsvp-member")),
  );
  await assertSucceeds(deleteDoc(response));
  const visitor = environment.authenticatedContext("rsvp-visitor").firestore();
  await assertFails(getDoc(doc(visitor, "intranetEvents", "internal-event")));
});

test("published chat channels support secure member group messaging", async () => {
  const member = environment
    .authenticatedContext("chat-member", {
      member: true,
      name: "Chat Member",
      email: "chat@example.com",
    })
    .firestore();
  await assertSucceeds(getDoc(doc(member, "chatChannels", "general")));
  await assertFails(getDoc(doc(member, "chatChannels", "draft-channel")));
  const message = doc(member, "chatChannels", "general", "messages", "one");
  await assertSucceeds(
    setDoc(message, {
      authorUid: "chat-member",
      authorName: "Chat Member",
      text: "안녕하세요.",
      createdAt: serverTimestamp(),
    }),
  );
  const readState = doc(
    member,
    "messageReadStates",
    "chat-member_group_general",
  );
  await assertSucceeds(
    setDoc(readState, {
      userId: "chat-member",
      scope: "group",
      targetId: "general",
      readAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(doc(member, "chatChannels", "general", "messages", "spoof"), {
      authorUid: "chat-member",
      authorName: "Someone Else",
      text: "위조된 이름",
      createdAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(
      doc(member, "chatChannels", "announcements", "messages", "member-post"),
      {
        authorUid: "chat-member",
        authorName: "Chat Member",
        text: "공지 채널 쓰기 시도",
        createdAt: serverTimestamp(),
      },
    ),
  );
  await assertFails(
    setDoc(
      doc(member, "chatChannels", "draft-channel", "messages", "draft-post"),
      {
        authorUid: "chat-member",
        authorName: "Chat Member",
        text: "비공개 채널 쓰기 시도",
        createdAt: serverTimestamp(),
      },
    ),
  );
  const other = environment
    .authenticatedContext("other-chat", {
      member: true,
      name: "Other Chat",
    })
    .firestore();
  await assertFails(
    deleteDoc(doc(other, "chatChannels", "general", "messages", "one")),
  );
  await assertFails(getDoc(doc(other, "messageReadStates", readState.id)));
  await assertFails(
    setDoc(doc(other, "messageReadStates", readState.id), {
      userId: "chat-member",
      scope: "group",
      targetId: "general",
      readAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(deleteDoc(message));
  const admin = environment
    .authenticatedContext("chat-admin", {
      admin: true,
      name: "Chat Admin",
    })
    .firestore();
  await assertSucceeds(
    setDoc(
      doc(admin, "chatChannels", "announcements", "messages", "admin-post"),
      {
        authorUid: "chat-admin",
        authorName: "Chat Admin",
        text: "관리자 공지",
        createdAt: serverTimestamp(),
      },
    ),
  );
});

test("members can create identities and access only their direct conversations", async () => {
  const memberA = environment
    .authenticatedContext("member-a", {
      member: true,
      name: "Member A",
      email: "a@example.com",
    })
    .firestore();
  await assertSucceeds(
    setDoc(doc(memberA, "memberIdentities", "member-a"), {
      uid: "member-a",
      displayName: "Member A",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(doc(memberA, "memberIdentities", "member-a"), {
      uid: "member-a",
      displayName: "Impersonated Name",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    getDoc(doc(memberA, "directConversations", "member-a--member-b")),
  );
  await assertSucceeds(
    setDoc(doc(memberA, "directConversations", "member-a--member-d"), {
      participants: ["member-a", "member-d"],
      createdAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(doc(memberA, "directConversations", "member-a--missing"), {
      participants: ["member-a", "missing"],
      createdAt: serverTimestamp(),
    }),
  );
  const ownMessage = doc(
    memberA,
    "directConversations",
    "member-a--member-b",
    "messages",
    "member-a-message",
  );
  await assertSucceeds(
    setDoc(ownMessage, {
      authorUid: "member-a",
      authorName: "Member A",
      text: "Secure direct message",
      createdAt: serverTimestamp(),
    }),
  );
  const outsider = environment
    .authenticatedContext("member-c", {
      member: true,
      name: "Member C",
    })
    .firestore();
  await assertFails(
    getDoc(doc(outsider, "directConversations", "member-a--member-b")),
  );
  await assertFails(
    getDoc(
      doc(
        outsider,
        "directConversations",
        "member-a--member-b",
        "messages",
        "seed-message",
      ),
    ),
  );
  await assertSucceeds(deleteDoc(ownMessage));

  const directoryMember = environment
    .authenticatedContext("listed-name", {
      email: "listed@example.com",
      name: "Token Name",
    })
    .firestore();
  await assertSucceeds(
    setDoc(doc(directoryMember, "memberIdentities", "listed-name"), {
      uid: "listed-name",
      displayName: "Listed Member",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(doc(directoryMember, "memberIdentities", "listed-name"), {
      uid: "listed-name",
      displayName: "Token Name",
      updatedAt: serverTimestamp(),
    }),
  );
});

test("administrators must append an audit log before reading direct messages", async () => {
  const admin = environment
    .authenticatedContext("dm-admin", {
      admin: true,
      email: "dm-admin@example.com",
      name: "DM Admin",
    })
    .firestore();
  const message = doc(
    admin,
    "directConversations",
    "member-a--member-b",
    "messages",
    "seed-message",
  );
  await assertSucceeds(
    getDoc(doc(admin, "directConversations", "member-a--member-b")),
  );
  await assertFails(getDoc(message));
  await assertFails(
    setDoc(doc(admin, "directMessageAccess", "dm-admin_member-a--member-b"), {
      actorUid: "dm-admin",
      conversationId: "member-a--member-b",
      auditId: "missing-audit",
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
    }),
  );
  const batch = writeBatch(admin);
  batch.set(doc(admin, "adminAuditLogs", "dm-view-audit"), {
    action: "dm.view",
    target: "directConversations/member-a--member-b",
    details: "개인 대화 열람: Member A ↔ Member B",
    actor: "dm-admin@example.com",
    createdAt: serverTimestamp(),
  });
  batch.set(doc(admin, "directMessageAccess", "dm-admin_member-a--member-b"), {
    actorUid: "dm-admin",
    conversationId: "member-a--member-b",
    auditId: "dm-view-audit",
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
  });
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(message));
  await assertSucceeds(getDoc(doc(admin, "adminAuditLogs", "dm-view-audit")));
  await assertFails(
    setDoc(doc(admin, "directMessageAccess", "dm-admin_member-a--member-b"), {
      actorUid: "dm-admin",
      conversationId: "member-a--member-b",
      auditId: "dm-view-audit",
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
    }),
  );
});

test("directory administrator and intranet member roles stay independent", async () => {
  const directoryAdmin = environment
    .authenticatedContext("directory-admin", {
      email: "siteadmin@example.com",
    })
    .firestore();
  await assertSucceeds(
    setDoc(
      doc(directoryAdmin, "products", "directory-approved"),
      validProduct(),
    ),
  );
  await assertFails(
    setDoc(doc(directoryAdmin, "members", "mismatch@example.com"), {
      email: "other@example.com",
      displayName: "Mismatch",
      active: true,
      adminAccess: false,
      memberAccess: true,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(doc(directoryAdmin, "members", "injected@example.com"), {
      email: "injected@example.com",
      displayName: "Injected",
      active: true,
      adminAccess: false,
      memberAccess: true,
      unexpected: "field",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    setDoc(doc(directoryAdmin, "members", "newmember@example.com"), {
      email: "newmember@example.com",
      displayName: "New Member",
      active: true,
      adminAccess: false,
      memberAccess: true,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    updateDoc(doc(directoryAdmin, "members", "managed@example.com"), {
      active: false,
      updatedAt: serverTimestamp(),
    }),
  );
  const managedMember = environment
    .authenticatedContext("managed", { email: "managed@example.com" })
    .firestore();
  await assertFails(getDoc(doc(managedMember, "intranetNotices", "internal")));
  await assertSucceeds(
    updateDoc(doc(directoryAdmin, "members", "siteadmin@example.com"), {
      memberAccess: true,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(directoryAdmin, "members", "siteadmin@example.com"), {
      adminAccess: false,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(directoryAdmin, "members", "siteadmin@example.com"), {
      active: false,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    deleteDoc(doc(directoryAdmin, "members", "siteadmin@example.com")),
  );
  const rootAdmin = environment
    .authenticatedContext("root-admin", {
      admin: true,
      email: "siteadmin@example.com",
    })
    .firestore();
  await assertSucceeds(
    updateDoc(doc(rootAdmin, "members", "siteadmin@example.com"), {
      adminAccess: false,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(
    deleteDoc(doc(rootAdmin, "members", "siteadmin@example.com")),
  );
  const listedMember = environment
    .authenticatedContext("listed-role", { email: "listed@example.com" })
    .firestore();
  await assertFails(
    setDoc(doc(listedMember, "products", "member-injected"), {
      name: "Injected",
      published: true,
    }),
  );
});

test("admin audit logs are append-only and hidden from members", async () => {
  const admin = environment
    .authenticatedContext("audit-admin", {
      admin: true,
      email: "root@example.com",
    })
    .firestore();
  const reference = doc(admin, "adminAuditLogs", "audit-entry");
  await assertSucceeds(
    setDoc(reference, {
      action: "content.update",
      target: "notices/published",
      details: "공지 수정",
      actor: "root@example.com",
      createdAt: serverTimestamp(),
    }),
  );
  await assertFails(updateDoc(reference, { details: "변조" }));
  await assertFails(deleteDoc(reference));
  const member = environment
    .authenticatedContext("audit-member", {
      member: true,
      email: "member@example.com",
    })
    .firestore();
  await assertFails(getDoc(doc(member, "adminAuditLogs", "audit-entry")));
});

test("only an admin can delete application records", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "applications", "delete-test"), {
      userId: "student",
    });
  });
  const applicant = environment.authenticatedContext("student").firestore();
  await assertFails(deleteDoc(doc(applicant, "applications", "delete-test")));
  const admin = environment
    .authenticatedContext("admin", { admin: true })
    .firestore();
  await assertSucceeds(deleteDoc(doc(admin, "applications", "delete-test")));
});

test("applicants can create only their own initial application once", async () => {
  const store = environment.authenticatedContext("student").firestore();
  const payload = {
    userId: "student",
    eventId: "event1",
    name: "Student",
    email: "student@example.com",
    phone: "010-1234-5678",
    motivation: "",
    consent: true,
    status: "new",
    createdAt: serverTimestamp(),
  };
  await assertFails(
    setDoc(doc(store, "applications", "another_event1"), payload),
  );
  await assertSucceeds(
    setDoc(doc(store, "applications", "student_event1"), payload),
  );
  await assertSucceeds(getDoc(doc(store, "applications", "student_event1")));
  const ownApplications = await assertSucceeds(
    getDocs(
      query(
        collection(store, "applications"),
        where("userId", "==", "student"),
      ),
    ),
  );
  if (ownApplications.size !== 1) {
    throw new Error("Unexpected own application count");
  }
  await assertFails(
    getDoc(
      doc(
        environment.authenticatedContext("another-student").firestore(),
        "applications",
        "student_event1",
      ),
    ),
  );
  await assertFails(
    setDoc(doc(store, "applications", "student_event1"), {
      ...payload,
      status: "accepted",
    }),
  );
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "events", "expired-event"), {
      title: "Expired",
      published: true,
      registrationOpen: true,
      registrationDeadlineAt: Timestamp.fromDate(
        new Date("2020-01-01T00:00:00Z"),
      ),
    });
  });
  await assertFails(
    setDoc(doc(store, "applications", "student_expired-event"), {
      ...payload,
      eventId: "expired-event",
    }),
  );
  await assertSucceeds(
    updateDoc(doc(store, "applications", "student_event1"), {
      status: "cancelled",
    }),
  );
  await assertFails(
    updateDoc(doc(store, "applications", "student_event1"), {
      status: "new",
    }),
  );
  await assertFails(getDocs(collection(store, "applications")));
});

test("applications are blocked when the privacy notice is unpublished or incomplete", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "site", "privacy"), {
      published: false,
      operator: "Geek Byte",
      contact: "contact@example.com",
      retention: "1 year",
      retentionDays: 365,
      body: "Geek Byte 개인정보 처리방침은 수집 항목, 이용 목적, 보유 기간, 파기 절차, 정보주체의 권리와 문의 방법을 구체적으로 안내합니다. 자세한 내용입니다.",
    });
  });
  const store = environment.authenticatedContext("student2").firestore();
  await assertFails(
    setDoc(doc(store, "applications", "student2_event1"), {
      userId: "student2",
      eventId: "event1",
      name: "Student Two",
      email: "two@example.com",
      phone: "010-1234-5678",
      motivation: "",
      consent: true,
      status: "new",
      createdAt: serverTimestamp(),
    }),
  );
  await assertFails(getDoc(doc(store, "site", "privacy")));

  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "site", "privacy"), {
      published: true,
      operator: "Geek Byte",
      contact: "contact@example.com",
      retention: "1 year",
      retentionDays: 365,
      body: "임시",
    });
  });
  await assertFails(
    setDoc(doc(store, "applications", "student2_event1"), {
      userId: "student2",
      eventId: "event1",
      name: "Student Two",
      email: "two@example.com",
      phone: "010-1234-5678",
      motivation: "",
      consent: true,
      status: "new",
      createdAt: serverTimestamp(),
    }),
  );
});
