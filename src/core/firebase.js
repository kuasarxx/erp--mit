// ============================================================
// ERP ÜMİT v2 — Firebase yapılandırması ve dışa aktarımlar
// Legacy projedeki aynı proje (erp-umit-web) kullanılır;
// böylece mevcut kullanıcılar/veriler korunur.
// ============================================================

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBvP62lkCZ_e12B32I_Mvd1x1AzQ9aUgmw',
  authDomain: 'erp-umit-web.firebaseapp.com',
  projectId: 'erp-umit-web',
  storageBucket: 'erp-umit-web.firebasestorage.app',
  messagingSenderId: '690026705589',
  appId: '1:690026705589:web:37f77e5105d300620604fc',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
