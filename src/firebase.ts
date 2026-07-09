import { initializeApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'

const hasFirebaseConfig = Boolean(import.meta.env.VITE_FIREBASE_API_KEY)

export const auth: Auth | null = hasFirebaseConfig
  ? getAuth(
      initializeApp({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      }),
    )
  : null
