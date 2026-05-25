const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const admin = require('../config/firebase');

const token = 'fm_PzII9w31M14foMLtiOW:APA91bGUKy-QEF4Rh2qLwqA35bWcxZZnQiuyPYgc5RzqB05FULfa_iWZ8_Ynf_8WtV1YJEgm5c39e2f9pk2iEls7636nquB_xqbS1KLZ1oo49ufMvnXEzVI';

const payload = {
  notification: {
    title: 'Diagnostic Test Notification',
    body: 'This is a test notification from the diagnostics script!'
  },
  data: {
    groupId: 'test-group-123'
  },
  webpush: {
    fcmOptions: {
      link: '/?openChat=test-group-123'
    }
  },
  token: token
};

async function testSend() {
  console.log("Sending test notification to token:", token);
  try {
    const response = await admin.messaging().send(payload);
    console.log("SUCCESS! Message sent successfully:", response);
  } catch (error) {
    console.error("FAILURE! Error sending message:");
    console.error("Code:", error.code);
    console.error("Message:", error.message);
    if (error.errorInfo) {
      console.error("ErrorInfo:", JSON.stringify(error.errorInfo, null, 2));
    }
  }
}

testSend().then(() => process.exit(0));
