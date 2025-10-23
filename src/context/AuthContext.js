import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [displayName, setDisplayName] = useState(null);
  const [loading, setLoading] = useState(true);
  const isAuthenticated = !!user;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const q = query(
            collection(db, "instructors"),
            where("uid", "==", firebaseUser.uid)
          );
          const snap = await getDocs(q);

          if (!snap.empty) {
            const instructorDoc = snap.docs[0];
            const data = instructorDoc.data();

            const nameFromFirestore = data.name && String(data.name).trim().length > 0
              ? String(data.name).trim()
              : firebaseUser.displayName || firebaseUser.email;

            setUser({
              ...firebaseUser,
              name: nameFromFirestore,
              role: data.role || "unknown",
              mustChangePassword: data.mustChangePassword || false,
            });
            setDisplayName(nameFromFirestore);
            setRole(data.role || "unknown");

            console.log("👤 Authenticated:", firebaseUser.email);
            console.log("🔐 Role:", data.role);
            console.log("user:", nameFromFirestore);
            if (data.mustChangePassword) {
              console.warn("⚠️ Password change required on first login");
            }
          } else {
            // no instructor doc found: still provide a user object and try to use firebase displayName/email
            const fallbackName = firebaseUser.displayName || firebaseUser.email || "User";
            setUser({
              ...firebaseUser,
              name: fallbackName,
            });
            setDisplayName(fallbackName);
            setRole("unknown");
            console.warn("❌ No matching instructor doc found for UID");
          }
        } catch (error) {
          console.error("🔥 Error fetching instructor role/name:", error);
          const fallbackName = firebaseUser.displayName || firebaseUser.email || "User";
          setUser({
            ...firebaseUser,
            name: fallbackName,
          });
          setDisplayName(fallbackName);
          setRole("unknown");
        }
      } else {
        setUser(null);
        setRole(null);
        setDisplayName(null);
      }

      setLoading(false);
      console.log("✅ AuthContext initialized");
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, displayName, loading, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
