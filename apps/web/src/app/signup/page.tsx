"use client";

import { SignupUi } from "./signup-ui";
import { useSignupPage } from "./use-signup-page";

export default function SignupPage() {
  const state = useSignupPage();
  if (!state.ready) return null;
  return <SignupUi state={state} />;
}
