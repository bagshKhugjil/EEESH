import admin from 'firebase-admin';

// .env.local-аас Base64 кодчилсон түлхүүрийг унших
const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

if (!admin.apps.length && serviceAccountBase64) {
  try {
    const decodedServiceAccount = Buffer.from(serviceAccountBase64, 'base64').toString('utf-8');
    const serviceAccountJson = JSON.parse(decodedServiceAccount);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountJson),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });

    console.log("✅ Firebase Admin SDK амжилттай инициализ болсон.");
    console.log("➡️ Project ID:", serviceAccountJson.project_id);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('❌ Firebase Admin SDK-г холбоход алдаа:', error.message, error.stack);
    } else {
      console.error('❌ Firebase Admin SDK-г холбоход тодорхойгүй алдаа:', error);
    }
  }
}

const adminDb = admin.firestore();
const adminAuth = admin.auth();
const adminStorage = admin.storage();

export { adminDb, adminAuth, adminStorage };