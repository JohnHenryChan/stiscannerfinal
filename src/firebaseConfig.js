// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {getFirestore} from "firebase/firestore"
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAiz6AHSScMvXEsxuzTyzoLLni0TInwoQA",
  authDomain: "stiscanner.firebaseapp.com",
  projectId: "stiscanner",
  storageBucket: "stiscanner.firebasestorage.app",
  messagingSenderId: "506209465614",
  appId: "1:506209465614:web:f3e6dd95a00eb3b8c8d35f",
  measurementId: "G-NGR239EKHE"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const db=getFirestore(app, 'maincollegedb', {experimentalAutoDetectLongPolling : true});
export const auth=getAuth(app, {experimentalAutoDetectLongPolling : true,});
export const functions = getFunctions(app);
export const storage = getStorage(app);