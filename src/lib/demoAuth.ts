export const DEMO_AUTH_STORAGE_KEY = 'charlal-demo-auth-user';
export const DEMO_AUTH_CHANGED_EVENT = 'charlal-demo-auth-changed';

export type DemoUser = {
  email: string;
  signedInAt: string;
};

function notifyDemoAuthChanged() {
  window.dispatchEvent(new Event(DEMO_AUTH_CHANGED_EVENT));
}

export function subscribeToDemoAuth(listener: () => void) {
  window.addEventListener(DEMO_AUTH_CHANGED_EVENT, listener);
  window.addEventListener('storage', listener);

  return () => {
    window.removeEventListener(DEMO_AUTH_CHANGED_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function getDemoUser(): DemoUser | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const storedUser = window.localStorage.getItem(DEMO_AUTH_STORAGE_KEY);

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser) as DemoUser;
  } catch {
    window.localStorage.removeItem(DEMO_AUTH_STORAGE_KEY);
    return null;
  }
}

export function isDemoSignedIn() {
  return getDemoUser() !== null;
}

export function getDemoAuthSnapshot() {
  return isDemoSignedIn();
}

export function getDemoAuthServerSnapshot() {
  return false;
}

// DEMO ONLY: this is not secure authentication and must not be used in production.
// It stores only a fake signed-in marker in localStorage so navigation can be tested.
export function demoSignIn(email: string) {
  const demoUser: DemoUser = {
    email,
    signedInAt: new Date().toISOString(),
  };

  window.localStorage.setItem(DEMO_AUTH_STORAGE_KEY, JSON.stringify(demoUser));
  notifyDemoAuthChanged();
}

// DEMO ONLY: this only removes the localStorage marker. A real app needs server auth.
export function demoSignOut() {
  window.localStorage.removeItem(DEMO_AUTH_STORAGE_KEY);
  notifyDemoAuthChanged();
}
