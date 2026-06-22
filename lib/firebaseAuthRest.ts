const FIREBASE_AUTH_LOOKUP_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

export class FirebaseAuthRestConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseAuthRestConfigError";
  }
}

export class FirebaseAuthRestVerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseAuthRestVerifyError";
  }
}

export async function verifyFirebaseIdTokenWithRest(idToken: string) {
  const apiKey =
    process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!apiKey) {
    throw new FirebaseAuthRestConfigError("Firebase API key is missing.");
  }

  if (!idToken.trim()) {
    throw new FirebaseAuthRestVerifyError("Firebase ID token is missing.");
  }

  const response = await fetch(
    `${FIREBASE_AUTH_LOOKUP_URL}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    users?: Array<{
      localId?: string;
      email?: string;
      emailVerified?: boolean;
    }>;
    error?: {
      message?: string;
    };
  };

  if (!response.ok) {
    throw new FirebaseAuthRestVerifyError(
      `Firebase ID token verification failed: ${payload.error?.message || response.status}`,
    );
  }

  const user = payload.users?.[0];

  if (!user?.localId) {
    throw new FirebaseAuthRestVerifyError("Firebase ID token user is missing.");
  }

  return {
    uid: user.localId,
    email: user.email || "",
    emailVerified: Boolean(user.emailVerified),
  };
}
