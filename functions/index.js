const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.createInstructorUser = functions.https.onCall(async (data, context) => {
  const {email, name, password} = data.data || data || {};

  if (!email || !name || !password) {
    throw new functions.https.HttpsError("invalid-argument", "Missing.");
  }

  try {
    const userRecord = await admin.auth().createUser({
      email: email.trim(),
      password: password.trim(),
      displayName: name.trim(),
    });

    return {uid: userRecord.uid};
  } catch (err) {
    console.error("🔥 Failed to create user:", err);
    throw new functions.https.HttpsError("internal", err.message);
  }
});

exports.deleteUserByUid = functions.https.onCall(async (data, context) => {
  // Optional security: restrict to admin role only
  // if (!context.auth?.token?.admin) {
  //   throw new functions.https.HttpsError("permission-denied", "Admin only.");
  // }

  const {uid} = data.data || data || {};

  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "UID is required");
  }

  try {
    await admin.auth().deleteUser(uid);
    console.log("✅ Deleted auth user:", uid);
    return {success: true};
  } catch (err) {
    console.error("🔥 Error deleting auth user:", err);
    throw new functions.https.HttpsError("internal", err.message);
  }
});

// Generate password reset link for instructors only
exports.generatePWResetLink = functions.https.onCall(async (data, context) => {
  // ✅ FIX: Use consistent parameter access pattern like other functions
  const {email} = data.data || data || {};

  console.log("📧 [generatePWResetLink] Received data:", data);
  console.log("📧 [generatePWResetLink] Extracted email:", email);

  if (!email) {
    console.error("📧 [generatePWResetLink] No email provided");
    throw new functions.https.HttpsError("Email is required");
  }

  try {
    // Generate the password reset link
    console.log("📧 [generatePWResetLink] Generating reset link for:", email);
    const resetLink = await admin.auth().generatePasswordResetLink(email);

    console.log("✅ Generated password reset link for instructor:", email);
    return {
      success: true,
      resetLink: resetLink,
      email: email,
    };
  } catch (err) {
    console.error("🔥 Error generating password reset link:", err);


    if (err.code === "auth/user-not-found") {
      throw new functions.https.HttpsError("No user with this email address");
    } else if (err.code === "auth/invalid-email") {
      throw new functions.https.HttpsError("Invalid email address format");
    } else {
      throw new functions.https.HttpsError("internal", err.message);
    }
  }
});
