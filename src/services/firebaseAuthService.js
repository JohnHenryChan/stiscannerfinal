import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebaseConfig"; // your Firebase app

const functions = getFunctions(app);
export const createInstructorUser = httpsCallable(functions, "createInstructorUser");
