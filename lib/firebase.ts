import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDceG44xHtxCTkiqkkgvvARcpq50Mqpbd8",
  authDomain: "project-lumeo.firebaseapp.com",
  projectId: "project-lumeo",
  storageBucket: "project-lumeo.firebasestorage.app",
  messagingSenderId: "996900369958",
  appId: "1:996900369958:web:6f154ccdc5ab3c97f698e7",
  measurementId: "G-64M4XEZ9Z6",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);