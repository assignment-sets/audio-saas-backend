/**
 * Auth0 Action: Post-User Registration
 * Triggers asynchronous user database hydration in the backend upon registration.
 *
 * Auth0 Flow: Post User Registration
 *
 * Required Auth0 Action Secrets:
 * - SYNC_URL: Full URL to backend user sync endpoint (e.g. https://api.yourdomain.com/api/users/sync)
 * - INTERNAL_SYNC_SECRET: Shared secret key sent in x-sync-secret header for authentication
 */

exports.onExecutePostUserRegistration = async (event, api) => {
  const axios = require('axios');

  const payload = {
    id: event.user.user_id,
    email: event.user.email,
    displayName: event.user.name || event.user.nickname || '',
  };

  try {
    await axios.post(event.secrets.SYNC_URL, payload, {
      headers: {
        'x-sync-secret': event.secrets.INTERNAL_SYNC_SECRET,
        'ngrok-skip-browser-warning': 'true',
      },
    });
  } catch (err) {
    console.error(
      'User registration sync failed:',
      err.response?.data || err.message,
    );
  }
};
