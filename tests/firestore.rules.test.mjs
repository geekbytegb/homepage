import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  collection,
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
