import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    doc, 
    updateDoc, 
    getDocs, 
    deleteDoc, 
    getDoc, 
    query, 
    where, 
    enableIndexedDbPersistence 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged, 
    sendPasswordResetEmail, 
    updatePassword, 
    EmailAuthProvider, 
    reauthenticateWithCredential, 
    updateProfile 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCGU9sUd4lj8_vdStcBd_DtYauvktlEKeA",
    authDomain: "personal-information-man-b9476.firebaseapp.com",
    projectId: "personal-information-man-b9476",
    storageBucket: "personal-information-man-b9476.firebasestorage.app",
    messagingSenderId: "586841086624",
    appId: "1:586841086624:web:84f0f65944e53ba98747c5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Enable offline persistence: tasks load from IndexedDB when offline
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('[Firestore] Offline persistence unavailable: multiple tabs open.');
    } else if (err.code === 'unimplemented') {
        console.warn('[Firestore] Offline persistence not supported in this environment.');
    }
});

export {
    db,
    auth,
    collection,
    addDoc,
    doc,
    updateDoc,
    getDocs,
    deleteDoc,
    getDoc,
    query,
    where,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    updatePassword,
    EmailAuthProvider,
    reauthenticateWithCredential,
    updateProfile
};
