import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const [email, action = "grant"] = process.argv.slice(2);
if (!email || !["grant", "revoke"].includes(action)) {
  console.error(
    "Usage: npm run grant-admin -- email@example.com [grant|revoke]",
  );
  process.exit(1);
}
if (!process.env.GOOGLE_CLOUD_PROJECT) {
  console.error(
    "Set GOOGLE_CLOUD_PROJECT to the Firebase project ID and configure Google Application Default Credentials.",
  );
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
});
const auth = getAuth();
const user = await auth.getUserByEmail(email);
const claims = { ...user.customClaims };
if (action === "grant") claims.admin = true;
else delete claims.admin;
await auth.setCustomUserClaims(user.uid, claims);
await auth.revokeRefreshTokens(user.uid);
console.log(`${action} completed for ${email}. The user must sign in again.`);
