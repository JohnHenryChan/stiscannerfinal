import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Alert,
} from "@mui/material";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebaseConfig";

const Login = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [loadingState, setLoadingState] = useState(false);

  const handleLogin = async () => {
    setError("");
    setLoadingState(true);

    if (!email || !password) {
      setError("Please enter both email and password.");
      setLoadingState(false);
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const q = query(collection(db, "instructors"), where("uid", "==", user.uid));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const instructorRef = snap.docs[0].ref;
        const data = snap.docs[0].data();

        if (data.mustChangePassword) {
          navigate("/passwordreset");
          return;
        }
      }

      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingState(false);
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
      <Box mb={2}>
        <img src="/stilogoo.png" alt="Logo" style={{ height: "60px" }} />
      </Box>

      <Paper
        elevation={3}
        sx={{
          padding: 4,
          width: 350,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Typography variant="h5" fontWeight="bold" mb={3}>
          Log In
        </Typography>

        {error && (
          <Alert severity="error" sx={{ width: "100%", mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          fullWidth
          label="Email"
          variant="outlined"
          margin="normal"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <TextField
          fullWidth
          label="Password"
          type="password"
          variant="outlined"
          margin="normal"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button
          fullWidth
          variant="contained"
          sx={{ mt: 2, backgroundColor: "#0054a6" }}
          onClick={handleLogin}
          disabled={loadingState}
        >
          {loadingState ? "Logging in..." : "LOG IN"}
        </Button>
      </Paper>
    </Box>
  );
};

export default Login;
