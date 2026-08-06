'use client';

import { useEffect, useState } from 'react';
import {
  getDemoUser,
  subscribeToDemoAuth,
  type DemoUser,
} from '@/lib/demoAuth';

export type DemoAuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

type DemoAuthState = {
  status: DemoAuthStatus;
  user: DemoUser | null;
};

export function useDemoAuthStatus(): DemoAuthState {
  const [authState, setAuthState] = useState<DemoAuthState>({
    status: 'checking',
    user: null,
  });

  useEffect(() => {
    function refreshAuthState(): void {
      const nextUser = getDemoUser();

      setAuthState({
        status: nextUser ? 'authenticated' : 'unauthenticated',
        user: nextUser,
      });
    }

    refreshAuthState();

    return subscribeToDemoAuth(refreshAuthState);
  }, []);

  return authState;
}
