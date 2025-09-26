// functions/src/index.ts

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

// ------------------------------------------------------------------
// -- ШИНЭ ФУНКЦ: students collection өөрчлөгдөхөд meta/studentsList update --
// ------------------------------------------------------------------
// functions/src/index.ts

export const updateStudentsList = functions.firestore
  .document("students/{studentId}")
  .onWrite(async () => {
    const db = admin.firestore();
    const snap = await db.collection("students").get();

    const list = snap.docs.map((doc) => {
      const v = doc.data();
      return {
        id: doc.id,
        externalId: v.externalId ?? null,
        firstName: v.firstName ?? "",
        lastName: v.lastName ?? "",
        class: v.class ?? v.grade ?? "N/A",
      };
    });

    await db.collection("meta").doc("studentsList").set({
      students: list,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Students list updated (${list.length} entries).`);
  });