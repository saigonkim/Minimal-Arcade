/* ============================================================
   index.js — Firebase Cloud Functions
   PayPal Webhook: server-side payment verification
   ============================================================ */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Secrets stored in Firebase Secret Manager (never in source code)
const PAYPAL_CLIENT_ID = defineSecret('PAYPAL_CLIENT_ID');
const PAYPAL_SECRET    = defineSecret('PAYPAL_SECRET');
const PAYPAL_WEBHOOK_ID = defineSecret('PAYPAL_WEBHOOK_ID');

// ── Helpers ───────────────────────────────────────────────────

async function getAccessToken(clientId, secret) {
  const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get PayPal access token');
  return data.access_token;
}

async function verifyWebhookSignature(req, accessToken, webhookId) {
  const body = {
    auth_algo:        req.headers['paypal-auth-algo'],
    cert_url:         req.headers['paypal-cert-url'],
    transmission_id:  req.headers['paypal-transmission-id'],
    transmission_sig: req.headers['paypal-transmission-sig'],
    transmission_time:req.headers['paypal-transmission-time'],
    webhook_id:       webhookId,
    webhook_event:    req.body,   // already parsed JSON object
  };

  const res = await fetch('https://api-m.paypal.com/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return data.verification_status === 'SUCCESS';
}

// ── Webhook Handler ───────────────────────────────────────────

exports.paypalWebhook = onRequest(
  { secrets: [PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_WEBHOOK_ID] },
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    try {
      // 1. Verify signature
      const accessToken = await getAccessToken(
        PAYPAL_CLIENT_ID.value(),
        PAYPAL_SECRET.value(),
      );
      const isValid = await verifyWebhookSignature(req, accessToken, PAYPAL_WEBHOOK_ID.value());
      if (!isValid) {
        console.warn('[Webhook] Invalid PayPal signature — rejected');
        return res.status(400).send('Invalid signature');
      }

      // 2. Only handle capture-completed events
      const event = req.body;
      if (event.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
        return res.status(200).send('Ignored');
      }

      // 3. Extract user UID from custom_id
      const uid = event.resource?.purchase_units?.[0]?.custom_id
               || event.resource?.supplementary_data?.related_ids?.order_id;
      if (!uid) {
        console.warn('[Webhook] No UID in custom_id');
        return res.status(400).send('Missing UID');
      }

      // 4. Idempotent update — skip if already premium
      const userRef = db.collection('users').doc(uid);
      const snap = await userRef.get();
      if (snap.exists && snap.data().isPremium === true) {
        console.log('[Webhook] Already premium, skipping:', uid);
        return res.status(200).send('Already premium');
      }

      // 5. Persist premium status
      await userRef.set({
        isPremium:    true,
        premiumSince: admin.firestore.FieldValue.serverTimestamp(),
        paypalCaptureId: event.resource?.id ?? null,
      }, { merge: true });

      console.log('[Webhook] Premium activated for UID:', uid);
      return res.status(200).send('OK');

    } catch (err) {
      console.error('[Webhook] Unexpected error:', err);
      return res.status(500).send('Internal error');
    }
  },
);
