import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
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

            setUser({
              ...firebaseUser,
              role: data.role || "unknown",
              mustChangePassword: data.mustChangePassword || false,
            });
            setRole(data.role || "unknown");

            console.log("👤 Authenticated:", firebaseUser.email);
            console.log("🔐 Role:", data.role);
            if (data.mustChangePassword) {
              console.warn("⚠️ Password change required on first login");
            }
          }

          else {
            setUser(firebaseUser);
            setRole("unknown");
            console.warn("❌ No matching instructor doc found for UID");
          }
        } catch (error) {
          console.error("🔥 Error fetching instructor role:", error);
          setUser(firebaseUser);
          setRole("unknown");
        }
      } else {
        setUser(null);
        setRole(null);
      }

      setLoading(false);
      console.log("✅ AuthContext initialized");
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
