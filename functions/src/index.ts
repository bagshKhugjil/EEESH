// functions/src/index.ts (Шинэ функц нэмэгдсэн хувилбар)

import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

admin.initializeApp();

// ------------------------------------------------------------------
// -- Админ болгодог хуучин функц (Энэ хэвээрээ үлдэнэ) --
// ------------------------------------------------------------------
export const setAdminRole = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Энэ үйлдлийг хийхийн тулд нэвтэрсэн байх шаардлагатай."
    );
  }

  const ADMIN_EMAIL = "ariunbold31iu@moes.edu.mn"; // <-- Таны админ имэйл

  const callerEmail = context.auth.token.email;
  if (callerEmail !== ADMIN_EMAIL) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Танд энэ үйлдлийг хийх эрх байхгүй."
    );
  }
  
  try {
    const user = await admin.auth().getUserByEmail(ADMIN_EMAIL);
    await admin.auth().setCustomUserClaims(user.uid, { role: "admin" });

    return {
      message: `${ADMIN_EMAIL} хаягтай хэрэглэгчийг амжилттай админ болголоо.`,
    };
  } catch (error) {
    throw new functions.https.HttpsError(
      "internal",
      "Админ роль олгоход алдаа гарлаа."
    );
  }
});


// ------------------------------------------------------------------
// -- ШИНЭ ФУНКЦ: Шинэ хэрэглэгчийг автоматаар "сурагч" болгох --
// ------------------------------------------------------------------
export const createStudentRole = functions.auth.user().onCreate(async (user) => {
    // 1. Шинэ хэрэглэгчид "student" гэсэн custom claim оноох
    try {
        await admin.auth().setCustomUserClaims(user.uid, { role: "student" });
        console.log(`Successfully set 'student' role for user: ${user.email}`);
    } catch (error) {
        console.error(`Error setting custom claim for ${user.email}:`, error);
    }

    // 2. Firestore-ийн "users" коллекцод хэрэглэгчийн мэдээллийг хадгалах
    // Энэ нь админ самбарт хэрэглэгчийг харуулахад хэрэгтэй
    const userRef = admin.firestore().collection("users").doc(user.uid);
    try {
        await userRef.set({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            role: "student", // Анхны роль
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`Successfully created user document for: ${user.email}`);
    } catch (error) {
        console.error(`Error creating user document for ${user.email}:`, error);
    }
});