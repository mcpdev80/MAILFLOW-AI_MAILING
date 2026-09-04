/**
 * Better Auth browser client.
 *
 * Authentication stays on the Next.js origin under /api/auth/*; neither the
 * MailFlow API key nor mailbox credentials are exposed to browser code.
 */
"use client";

import { passkeyClient } from "@better-auth/passkey/client";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [organizationClient(), passkeyClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
