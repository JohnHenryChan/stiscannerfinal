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
