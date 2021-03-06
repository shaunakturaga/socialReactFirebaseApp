const functions = require('firebase-functions');
const admin = require('firebase-admin');
const app = require('express')();
const firebase = require('firebase');
const firebaseConfig = require('./fbConfig');

// authentication for local firebase serve
var serviceAccount = require('./instabar-7b464-91f2fd791763');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://instabar-7b464.firebaseio.com/"
});

// authentication
firebase.initializeApp(firebaseConfig)

const db = admin.firestore()

// Firebase Authentication Middleware
const FBAuth = (req,res,next) => {
    let idToken;
    if(req.headers.authorization && req.headers.authorization.startsWith('Bearer ')){
        idToken = req.headers.authorization.split('Bearer ')[1];
    } else {
        console.error('No token found');
        return res.status(403).json({error: 'Unauthorized'})
    }

    admin.auth().verifyIdToken(idToken)
        .then(decodedToken => {
            req.user = decodedToken;
            return db.collection('users')
                .where('userId', '==', req.user.uid)
                .limit(1)
                .get();
        })
        .then(data => {
            req.user.handle = data.docs[0].data().handle;
            return next()
        })
        .catch(err => {
            console.error('Error while verifying token ', err);
            return res.status(403).json(err);
        })
}

// Requests
app.get('/request', (req,res) => {
    db.collection(`requests`)
    .orderBy('createdAt','desc')
    .get()
    .then(data => {
        let requests = [];
        data.forEach(doc => {
            requests.push({
                requestId: doc.id,
                body: doc.data().body,
                userHandle: doc.data().userHandle,
                createdAt: doc.data().createdAt
            });
        })
        return res.json(requests);
    })
    .catch(err => console.error(err))
})

app.post('/request', FBAuth, (req, res) => {
    if(req.method !== 'POST'){
        return res.status(400).json({error: 'Method not allowed.'})
    }
    const newRequest = {
        body: req.body.body,
        userHandle: req.user.handle,
        createdAt: new Date().toISOString()
    }

    db.collection(`requests`)
        .add(newRequest)
        .then(doc => {
            res.json({message: `document ${doc.id} created successfully`});
        })
        .catch(err => {
            res.status(500).json({ error: `something went wrong`});
            console.error(err);
        })
})


// User Signup + Login
const isEmpty = (string) => {
    console.log(`this is the ${string}`)
    if(string.trim() === '') return true;
    else return false;
}

const isEmail = (email) => {
    const regEx = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if(email.match(regEx)) return true;
    else return false;
}

// signup route
app.post('/signup', (req,res) => {
    const newUser = {
        email: req.body.email,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
        handle: req.body.handle
    }

    let errors = {};

    // email
    if(isEmpty(newUser.email)){
        errors.email = 'Must not be empty';
    } else if (!isEmail(newUser.email)){
        errors.email = 'Must be a valid email address';
    }

    // password
    if(isEmpty(newUser.password)) errors.password = 'Must not be empty';
    if(newUser.password !== newUser.confirmPassword) errors.confirmPassword = 'Passwords must match';

    // handle
    if(isEmpty(newUser.handle)) errors.handle = 'Must not be empty';

    if(Object.keys(errors).length > 0) return res.status(400).json(errors);

    //TODO: validate data
    let token, userId;
    db.doc(`/users/${newUser.handle}`).get()
        .then(doc => {
            if(doc.exists){
                return res.status(400).json({ handle: "This handle is already taken"})
            } else {
                return firebase.auth().createUserWithEmailAndPassword(newUser.email, newUser.password)
            }
        })
        .then(data => {
            userId = data.user.uid;
            return data.user.getIdToken();
        })
        .then(token => {
            token = token;
            const userCredentials = {
                handle: newUser.handle,
                email: newUser.email,
                createdAt: new Date().toISOString(),
                userId
            }
            db.doc(`/users/${newUser.handle}`).set(userCredentials)
                .then(() =>{
                    return res.status(201).json({ token })
                })
                .catch(err => {
                    console.error(err)
                    return res.status(400).json({error: err.code})
                })
        })
        .catch(err => {
            console.error(err);
            if(err.code === 'auth/email-already-in-use') {
                return res.status(400).json({email: "This email is already in use"})
            } else {
                return res.status(500).json({error: err.code})
            }
        })
})

app.post('/login', (req,res) =>{
    const user = {
        email: req.body.email,
        password: req.body.password
    }

    let errors = {};

    if(isEmpty(user.email)) errors.email = 'Must not be empty';
    if(isEmpty(user.password)) errors.password = 'Must not be empty';

    if(Object.keys(errors).length > 0) return res.status(400).json(errors);

    firebase
    .auth()
    .signInWithEmailAndPassword(user.email,user.password)
        .then(data => {
            return data.user.getIdToken()
        })
        .then(token => {
            return res.json({token: token})
        })
        .catch(err => {
            console.error(err)
            if(err.code === 'auth/wrong-password'){
                return res.status(403).json({ general: 'Wrong credentials, please try again'})
            } else {
                return res.status(500).json({error: err.code})
            }
        })
})

exports.api = functions.https.onRequest(app);