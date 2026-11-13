import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';

const firebaseApp = initializeApp(window.ZYKUN_FIREBASE_CONFIG);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const stateDoc = user => doc(db, 'users', user.uid, 'private', 'finance');

export const watchUser = callback => onAuthStateChanged(auth, callback);
export const register = (email, password) => createUserWithEmailAndPassword(auth, email, password);
export const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const resetPassword = email => sendPasswordResetEmail(auth, email);
export const logout = () => signOut(auth);
export const watchState = (user, callback, onError) => onSnapshot(stateDoc(user), snapshot => callback(snapshot.exists() ? snapshot.data().state : null), onError);
export async function loadState(user) {
  const snapshot = await getDoc(stateDoc(user));
  return snapshot.exists() ? snapshot.data().state : null;
}
export function saveState(user, state) {
  const bytes = new Blob([JSON.stringify(state)]).size;
  if (bytes > 900 * 1024) throw new Error('Catatan cloud terlalu besar untuk satu dokumen. Ekspor cadangan dan hubungi kami untuk memecah penyimpanannya.');
  return setDoc(stateDoc(user), { state, updatedAt: serverTimestamp() });
}
