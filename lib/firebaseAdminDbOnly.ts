import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export class FirebaseAdminDbOnlyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseAdminDbOnlyConfigError";
  }
}

function getFirebaseAdminDbOnlyConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new FirebaseAdminDbOnlyConfigError(
      "Firebase Admin environment variables are missing.",
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

export function getFirebaseAdminDbOnly() {
  if (!getApps().length) {
    const config = getFirebaseAdminDbOnlyConfig();

    initializeApp({
      credential: cert(config),
    });
  }

  return getFirestore();
}
