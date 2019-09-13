const admin = require('firebase-admin');

// authentication for local firebase serve
var serviceAccount = require('../instabar-7b464-91f2fd791763.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://instabar-7b464.firebaseio.com/"
});

const db = admin.firestore()