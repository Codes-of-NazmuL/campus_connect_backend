"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fcmService = void 0;
const admin = __importStar(require("firebase-admin"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
class FCMService {
    isInitialized = false;
    constructor() {
        this.init();
    }
    init() {
        try {
            const serviceAccountPath = path_1.default.join(__dirname, '../../firebase-adminsdk.json');
            if (fs_1.default.existsSync(serviceAccountPath)) {
                const serviceAccount = require(serviceAccountPath);
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                });
                this.isInitialized = true;
                console.log('✅ Firebase Admin initialized successfully.');
            }
            else {
                console.warn('⚠️ firebase-adminsdk.json not found in backend root. Push notifications will be disabled.');
            }
        }
        catch (error) {
            console.error('❌ Failed to initialize Firebase Admin:', error);
        }
    }
    /**
     * Send a standard push notification (e.g., for chat messages).
     * It will show up in the system tray when the app is in the background/killed.
     */
    async sendNotification(token, title, body, data = {}) {
        if (!this.isInitialized || !token)
            return;
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
        }
        catch (error) {
            console.error('Error sending notification:', error);
        }
    }
    /**
     * Send a data-only message for incoming calls.
     * This is required to wake up the app and trigger CallKit without showing a standard notification.
     */
    async sendCallPayload(token, callerName, callerId, signalData) {
        if (!this.isInitialized || !token)
            return;
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
        }
        catch (error) {
            console.error('Error sending call payload:', error);
        }
    }
}
exports.fcmService = new FCMService();
