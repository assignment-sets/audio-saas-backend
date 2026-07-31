/**
 * Auth0 Action: Post-Login
 * 1. Injects custom claims (email, nickname, displayName) into the access token.
 * 2. Enforces database synchronization before issuing tokens if user is not yet marked as synced.
 *
 * Auth0 Flow: Login / Post-Login
 *
 * Required Auth0 Action Secrets:
 * - SYNC_URL: Full URL to backend user sync endpoint (e.g. https://api.yourdomain.com/api/users/sync)
 * - INTERNAL_SYNC_SECRET: Shared secret key sent in x-sync-secret header for authentication
 */

exports.onExecutePostLogin = async (event, api) => {
  const axios = require('axios');
  const namespace = 'https://api.yourdomain.com'; // Replace with your backend API identifier

  // 1. Custom Claims Injection for Access Tokens
  if (event.authorization) {
    api.accessToken.setCustomClaim(`${namespace}/email`, event.user.email);
    api.accessToken.setCustomClaim(
      `${namespace}/nickname`,
      event.user.nickname || '',
    );
    api.accessToken.setCustomClaim(
      `${namespace}/displayName`,
      event.user.name || '',
    );
  }

  // 2. Rigid User Database Synchronization Guardrail ("Current Self" logic)
  if (!event.user.app_metadata?.is_synced) {
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
        timeout: 5000,
      });

      // Mark as synced in Auth0 app_metadata so subsequent logins bypass sync API call
      api.user.setAppMetadata('is_synced', true);
    } catch (err) {
      console.error(
        'Post-login DB sync failed, blocking token issuance:',
        err.message,
      );
      // Deny access if backend sync fails
      api.access.deny('Initialization failed. Please try again in a moment.');
    }
  }
};
