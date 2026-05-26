const admin = require('firebase-admin');
const serviceAccount = require('./firebase-adminsdk.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const token = 'ceHtwpm4QiWzi43DRnJ69i:APA91bE1h2iH2v4ZNurCnccDhAQLWo0mMMZQjanRnX6V5oKOl94qUySZZlzE12TniLnv5TjobD6RN5Qh16AxvZKjoNqnmrPa5aiU6b-gLzxAKfLW8Y6BpNc';

admin.messaging().send({
  token,
  notification: { title: 'Test', body: 'Test body' }
}).then(res => console.log('Success:', res))
  .catch(err => console.error('Error:', err));
