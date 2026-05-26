import * as admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

class FCMService {
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private init() {
    try {
      const serviceAccountPath = path.join(__dirname, '../../firebase-adminsdk.json');
      
      if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        this.isInitialized = true;
        console.log('✅ Firebase Admin initialized successfully.');
      } else {
        console.warn('⚠️ firebase-adminsdk.json not found in backend root. Push notifications will be disabled.');
      }
    } catch (error) {
      console.error('❌ Failed to initialize Firebase Admin:', error);
    }
  }

  /**
   * Send a standard push notification (e.g., for chat messages).
   * It will show up in the system tray when the app is in the background/killed.
   */
  async sendNotification(token: string, title: string, body: string, data: any = {}) {
    if (!this.isInitialized || !token) return;

    try {
      await admin.messaging().send({
        token,
        notification: {
          title,
          body,
        },
        data: {
          ...data,
          type: 'message', // to identify payload type in flutter
        },
        android: {
          priority: 'high',
        },
        apns: {
          payload: {
            aps: {
              contentAvailable: true,
              sound: 'default',
            },
          },
        },
      });
      console.log(`Sent notification to ${token.substring(0, 10)}...`);
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  /**
   * Send a data-only message for incoming calls. 
   * This is required to wake up the app and trigger CallKit without showing a standard notification.
   */
  async sendCallPayload(token: string, callerName: string, callerId: string, signalData: string) {
    if (!this.isInitialized || !token) return;

    try {
      await admin.messaging().send({
        token,
        data: {
          type: 'incoming_call',
          callerName,
          callerId,
          signalData, // Stringified JSON of WebRTC offer
        },
        android: {
          priority: 'high',
        },
        apns: {
          headers: {
            'apns-push-type': 'background',
            'apns-priority': '5',
          },
          payload: {
            aps: {
              contentAvailable: true,
            },
          },
        },
      });
      console.log(`Sent call payload to ${token.substring(0, 10)}...`);
    } catch (error) {
      console.error('Error sending call payload:', error);
    }
  }
}

export const fcmService = new FCMService();
