import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, TextField, Typography, Paper, Alert } from "@mui/material";
import { updatePassword, signOut } from "firebase/auth";
import { collection, query, where, getDocs, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";
import { useAuth } from "../../context/AuthContext";

const PasswordReset = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const DEFAULT_PASSWORD = "test123A";

  const handleChangePassword = async () => {
    setError("");

    if (!newPassword || !confirmPassword) {
      setError("Both fields are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword === DEFAULT_PASSWORD) {
      setError("New password cannot be the default password.");
      return;
    }
    if (!auth.currentUser) {
      setError("No authenticated user found.");
      return;
    }

    setLoading(true);
    try {
      await updatePassword(auth.currentUser, newPassword);

      // clear mustChangePassword flag on instructor doc if applicable (non-fatal)
      try {
        const q = query(collection(db, "instructors"), where("uid", "==", user?.uid || ""));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const instructorRef = snap.docs[0].ref;
          await updateDoc(instructorRef, { mustChangePassword: false });
        }
      } catch (e) {
        // ignore
      }

      // immediately sign out and redirect to login
      try {
        await signOut(auth);
      } catch (e) {
        // ignore signOut errors
      }
      navigate("/login");
    } catch (err) {
      setError("Password update failed: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      bgcolor="#f5f5f5"
    >
      <Paper elevation={3} sx={{ padding: 4, width: 400, display: "flex", flexDirection: "column" }}>
        <Typography variant="h5" fontWeight="bold" mb={3}>
          Change Your Password
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TextField
          fullWidth
          label="New Password"
          type="password"
          variant="outlined"
          margin="normal"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />

        <TextField
          fullWidth
          label="Confirm Password"
          type="password"
          variant="outlined"
          margin="normal"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <Button
          fullWidth
          variant="contained"
          sx={{ mt: 3, backgroundColor: "#0054a6" }}
          onClick={handleChangePassword}
          disabled={loading}
        >
          {loading ? "Updating..." : "Update Password"}
        </Button>
      </Paper>
    </Box>
  );
};

export default PasswordReset;
