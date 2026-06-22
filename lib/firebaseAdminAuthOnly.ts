import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export class FirebaseAdminAuthOnlyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseAdminAuthOnlyConfigError";
  }
}

function getFirebaseAdminAuthOnlyConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new FirebaseAdminAuthOnlyConfigError(
      "Firebase Admin environment variables are missing.",
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

export function getFirebaseAdminAuthOnly() {
  if (!getApps().length) {
    const config = getFirebaseAdminAuthOnlyConfig();

    initializeApp({
      credential: cert(config),
    });
  }

  return getAuth();
}
