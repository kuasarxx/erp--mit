// ============================================================
// ERP ÜMİT v2 — Kimlik doğrulama servisi
// Eski yapıda window.firebase* globalleri üzerinden dağınık
// çağrılar vardı; burada tek bir servis üzerinden yürür.
// ============================================================

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { setState } from './store.js';

/** Firestore'daki kullanıcı profili dokümanı yolu */
const userDocPath = (uid) => ['kullanicilar', uid];

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function register(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await setDoc(doc(db, ...userDocPath(cred.user.uid)), {
    email: cred.user.email,
    displayName: displayName || cred.user.email,
    createdAt: Date.now(),
  });
  return cred.user;
}

export async function logout() {
  await signOut(auth);
}

/** Kullanıcı profilini Firestore'dan getirir (yoksa null). */
export async function fetchProfile(uid) {
  const snap = await getDoc(doc(db, ...userDocPath(uid)));
  return snap.exists() ? snap.data() : null;
}

/**
 * Oturum dinleyicisi: durum değiştiğinde store'u günceller.
 * @returns unsubscribe fonksiyonu
 */
export function watchAuth() {
  return onAuthStateChanged(auth, (user) => {
    setState(
      'auth',
      user
        ? { user: { uid: user.uid, email: user.email, displayName: user.displayName }, status: 'authenticated' }
        : { user: null, status: 'anonymous' },
      { persist: false },
    );
  });
}
