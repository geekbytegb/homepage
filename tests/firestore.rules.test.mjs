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
  where,
} from "firebase/firestore";

let environment;
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
    });
    await setDoc(doc(store, "site", "privacy"), {
      published: true,
      operator: "Geek Byte",
      contact: "contact@example.com",
      retention: "1 year",
      body: "Policy",
    });
    await setDoc(doc(store, "intranetNotices", "internal"), {
      title: "Internal",
      body: "Members only",
      published: true,
    });
    await setDoc(doc(store, "members", "listed@example.com"), {
      email: "listed@example.com",
      displayName: "Listed Member",
      active: true,
    });
    await setDoc(doc(store, "members", "inactive@example.com"), {
      email: "inactive@example.com",
      displayName: "Inactive Member",
      active: false,
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
  const member = environment
    .authenticatedContext("member", { member: true })
    .firestore();
  await assertSucceeds(getDoc(doc(member, "intranetNotices", "internal")));
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
      published: true,
    }),
  );
});

test("an admin claim grants content write and application read access", async () => {
  const store = environment
    .authenticatedContext("admin", { admin: true })
    .firestore();
  await assertSucceeds(
    setDoc(doc(store, "products", "approved"), {
      name: "Approved",
      published: true,
    }),
  );
  await assertSucceeds(getDocs(collection(store, "applications")));
  await assertSucceeds(deleteDoc(doc(store, "notices", "draft")));
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
  await assertFails(getDocs(collection(store, "applications")));
});

test("applications are blocked when the privacy notice is unpublished", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "site", "privacy"), {
      published: false,
      operator: "Geek Byte",
      contact: "contact@example.com",
      retention: "1 year",
      body: "Policy",
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
});
