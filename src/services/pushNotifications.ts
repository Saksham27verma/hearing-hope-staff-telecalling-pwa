import { getAuth } from 'firebase/auth';
import { arrayRemove, arrayUnion, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { app, db } from '../firebase';

let lastRegisteredToken: string | null = null;

/**
 * Registers FCM web push (PWA), saves token on `staff/{uid}` for CRM to target,
 * and shows foreground notifications when the app is open.
 *
 * Requires `VITE_FIREBASE_VAPID_KEY` (Firebase Console → Project settings → Cloud Messaging → Web Push certificates).
 */
export async function setupPushNotifications(): Promise<void> {
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY?.trim();
  if (!vapidKey || typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return;
  }

  const supported = await isSupported().catch(() => false);
  if (!supported) return;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/',
  });
  await navigator.serviceWorker.ready;

  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) return;

  const user = getAuth().currentUser;
  if (!user) return;

  await updateDoc(doc(db, 'staff', user.uid), {
    fcmWebPushTokens: arrayUnion(token),
    fcmWebPushTokenUpdatedAt: serverTimestamp(),
  });

  lastRegisteredToken = token;

  onMessage(messaging, (payload) => {
    const title = payload.notification?.title || 'Hearing Hope';
    const body = payload.notification?.body || '';
    if (document.visibilityState === 'visible' && body) {
      try {
        new Notification(title, {
          body,
          icon: '/manifest-icon-192.maskable.png',
        });
      } catch {
        /* ignore */
      }
    }
  });
}

/** Remove this device token when logging out so another account on the same browser does not receive pushes. */
export async function clearPushRegistration(uid: string): Promise<void> {
  const token = lastRegisteredToken;
  lastRegisteredToken = null;
  if (!token) return;
  try {
    await updateDoc(doc(db, 'staff', uid), {
      fcmWebPushTokens: arrayRemove(token),
    });
  } catch {
    /* non-fatal */
  }
}
