import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = ['https://www.googleapis.com/auth/documents'];

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}

let isSigningIn = false;
// In-memory cache only (never store OAuth access tokens in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;

export function initGoogleAuth(
  onUserChange: (user: User | null, hasToken: boolean) => void
) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      if (!isSigningIn && !cachedAccessToken) {
        onUserChange(user, false);
      } else {
        onUserChange(user, Boolean(cachedAccessToken));
      }
    } else {
      cachedAccessToken = null;
      onUserChange(null, false);
    }
  });
}

export async function signInWithGoogleDocs(): Promise<{
  user: User;
  accessToken: string;
}> {
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'Could not obtain Google Docs access token. Please try signing in again.'
      );
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err: unknown) {
    const errCode = (err as { code?: string })?.code || '';
    if (
      errCode.includes('disallowed-useragent') ||
      errCode.includes('popup-blocked') ||
      errCode.includes('popup-closed-by-user')
    ) {
      throw new Error(
        'Google Sign-In popups are restricted in Android WebViews. Tap "Copy Report Text" below to paste directly into Google Docs or Email!'
      );
    }
    throw err;
  } finally {
    isSigningIn = false;
  }
}

export function getGoogleAccessToken(): string | null {
  return cachedAccessToken;
}

export async function signOutGoogle(): Promise<void> {
  cachedAccessToken = null;
  await auth.signOut();
}
