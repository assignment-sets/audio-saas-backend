# Auth0 Actions & User Synchronization Setup

This directory contains the Auth0 Custom Actions scripts used by the Audio SaaS Backend system to handle real-time user database synchronization and custom claim injection.

---

## 📂 Directory Structure

- [`actions/postUserRegistration.js`](actions/postUserRegistration.js) — Asynchronous trigger executed immediately after a user registers.
- [`actions/postLogin.js`](actions/postLogin.js) — Synchronous guardrail trigger executed during login to inject custom token claims and enforce database hydration before issuing access tokens.

---

## 🔐 Required Auth0 Action Secrets

Configure the following secrets in the Auth0 Dashboard for both Action triggers (**Auth0 Dashboard -> Actions -> Library -> Custom Actions**):

| Secret Key             | Description                                                             | Example                                     |
| :--------------------- | :---------------------------------------------------------------------- | :------------------------------------------ |
| `SYNC_URL`             | Full URL to the backend user sync endpoint                              | `https://api.yourdomain.com/api/users/sync` |
| `INTERNAL_SYNC_SECRET` | Secret key sent in `x-sync-secret` HTTP header for backend verification | `your_internal_shared_secret_key`           |

---

## 🚀 Setup Instructions in Auth0 Dashboard

### 1. Post-User Registration Action

1. Go to **Actions -> Library -> Create Action -> Build from scratch**.
2. Name: `Sync User on Registration`
3. Trigger: **Post User Registration**
4. Copy content from [`actions/postUserRegistration.js`](actions/postUserRegistration.js).
5. Add `axios` (v1.x) under **Dependencies**.
6. Add `SYNC_URL` and `INTERNAL_SYNC_SECRET` under **Secrets**.
7. Click **Deploy** and add to the **Post User Registration** flow pipeline.

### 2. Post-Login Action

1. Go to **Actions -> Library -> Create Action -> Build from scratch**.
2. Name: `Inject Claims & DB Sync Guardrail`
3. Trigger: **Login / Post-Login**
4. Copy content from [`actions/postLogin.js`](actions/postLogin.js).
5. Update `namespace` constant if using a custom API identifier.
6. Add `axios` (v1.x) under **Dependencies**.
7. Add `SYNC_URL` and `INTERNAL_SYNC_SECRET` under **Secrets**.
8. Click **Deploy** and add to the **Login** flow pipeline.
