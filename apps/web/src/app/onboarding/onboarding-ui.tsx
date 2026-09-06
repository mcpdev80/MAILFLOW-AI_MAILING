"use client";

import { WizardShell, wizardStyles as w } from "@/components/wizard-shell";
import styles from "./onboarding.module.css";
import {
  type OnboardingController,
  type OrganizationMember,
  memberUserId,
} from "./use-onboarding-page";

export function OnboardingUi({ controller }: { controller: OnboardingController }) {
  if (controller.loading) {
    return (
      <main className={w.screen}>
        <section className={w.window} style={{ minHeight: 420, justifyContent: "center", alignItems: "center" }}>
          <p style={{ color: "#a1a1aa" }}>Loading Mailflow onboarding…</p>
        </section>
      </main>
    );
  }

  if (controller.step === "welcome") return <Welcome controller={controller} />;
  if (controller.step === "mailbox") return <Mailbox controller={controller} />;
  if (controller.step === "privacy") return <Privacy controller={controller} />;
  if (controller.step === "behavior") return <Behavior controller={controller} />;
  if (controller.step === "existing") return <ExistingMail controller={controller} />;
  return <Ready controller={controller} />;
}

function Welcome({ controller }: { controller: OnboardingController }) {
  return (
    <WizardShell kind="onboarding" step={1} total={6} title="Welcome to Mailflow" subtitle="A few quick steps will connect your mailbox and apply privacy-safe defaults." next={{ label: "Connect your mailbox", onClick: () => controller.setStep("mailbox") }}>
      <div className={styles.benefits}>
        <Benefit icon="✦" title="Smart Classification" copy="AI categorizes your email automatically" />
        <Benefit icon="◈" title="Safe Automation" copy="Nothing is moved or deleted without your configured safety policy" />
        <Benefit icon="⌁" title="Privacy First" copy="Your mailbox data stays private by default" />
      </div>
      <div className={w.info}><span className={w.infoIcon}>i</span><span>Safe by design. Mailflow never automatically deletes mail or sends replies.</span></div>
    </WizardShell>
  );
}

function Benefit({ icon, title, copy }: { icon: string; title: string; copy: string }) {
  return <div className={styles.benefit}><span className={styles.benefitIcon}>{icon}</span><div><h3>{title}</h3><p>{copy}</p></div></div>;
}

function Mailbox({ controller }: { controller: OnboardingController }) {
  const choice = controller.providerChoice;
  const connected = controller.account;
  return (
    <WizardShell kind="onboarding" step={2} total={6} title="Connect your mailbox" subtitle="Link your mail provider to enable Mailflow intelligence." back={{ onClick: () => controller.setStep("welcome") }} next={{ label: "Continue", onClick: controller.continueFromMailbox, disabled: controller.busy }}>
      <div className={styles.providerGrid}>
        {(["gmail", "microsoft", "imap"] as const).map((provider) => (
          <button key={provider} type="button" className={`${styles.provider} ${choice === provider ? styles.providerActive : ""}`} onClick={() => controller.setProviderChoice(provider)}>
            <span className={styles.providerIcon}>{provider === "gmail" ? "G" : provider === "microsoft" ? "M" : "✉"}</span>
            <span>{provider === "gmail" ? "Gmail" : provider === "microsoft" ? "Microsoft" : "IMAP"}</span>
          </button>
        ))}
      </div>

      {choice === "imap" ? <ImapConnection controller={controller} /> : (
        <div className={styles.connectionCard}>
          <h3>{choice === "gmail" ? "Google OAuth Connection" : "Microsoft OAuth Connection"}</h3>
          <p>Mailflow uses the provider's official OAuth flow. Your mailbox password is not stored.</p>
          {connected && connected.provider_type === choice ? (
            <div className={styles.connected}>✓ Connected successfully as {connected.username}</div>
          ) : (
            <button className={styles.oauthButton} type="button" disabled={controller.busy} onClick={() => void controller.connectOAuth(choice)}>
              Connect with {choice === "gmail" ? "Gmail" : "Microsoft"}
            </button>
          )}
        </div>
      )}
      {controller.error && <div className={w.error}>{controller.error}</div>}
      <p style={{ margin: 0, color: "#71717a", fontSize: 12 }}>You can add more mailboxes later in Settings.</p>
    </WizardShell>
  );
}

function ImapConnection({ controller }: { controller: OnboardingController }) {
  const form = controller.accountForm;
  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    controller.setAccountForm({ ...form, [key]: value });
  }
  return (
    <div className={styles.connectionCard}>
      <h3>IMAP Connection</h3>
      <label className={w.field}>IMAP host<input value={form.imap_host} onChange={(e) => update("imap_host", e.target.value)} placeholder="imap.example.com" /></label>
      <label className={w.field}>Username<input value={form.username} onChange={(e) => update("username", e.target.value)} autoComplete="username" /></label>
      <label className={w.field}>Password<input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} autoComplete="current-password" /></label>
      {controller.providers.length > 0 && (
        <label className={w.field}>AI Provider<select value={form.llm_provider_id} onChange={(e) => update("llm_provider_id", e.target.value)}>{controller.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
      )}
    </div>
  );
}

function Privacy({ controller }: { controller: OnboardingController }) {
  const form = controller.accountForm;
  return (
    <WizardShell kind="onboarding" step={3} total={6} title="Mailbox privacy" subtitle="Who should have access to this mailbox?" back={{ onClick: () => controller.setStep("mailbox") }} next={{ label: controller.busy ? "Saving…" : "Continue", onClick: () => void controller.savePrivacyAndMailbox(), disabled: controller.busy }}>
      <div className={styles.radioCards}>
        <button type="button" className={`${styles.radioCard} ${form.ownership_mode === "private" ? styles.radioCardActive : ""}`} onClick={() => controller.setAccountForm({ ...form, ownership_mode: "private", shared_user_ids: [] })}>
          <span className={styles.radioDot} /><span><span className={styles.radioTitle}>⌁ Private (Recommended)</span><span className={styles.radioCopy}>Only you can access this mailbox and its Mailflow intelligence reports.</span></span>
        </button>
        <button type="button" disabled={!controller.canCreateShared} className={`${styles.radioCard} ${form.ownership_mode === "shared" ? styles.radioCardActive : ""}`} onClick={() => controller.setAccountForm({ ...form, ownership_mode: "shared" })}>
          <span className={styles.radioDot} /><span><span className={styles.radioTitle}>◉ Shared Mailbox</span><span className={styles.radioCopy}>Grant custom read/write workspace access to selected team members.</span></span>
        </button>
      </div>
      {form.ownership_mode === "shared" && <MemberAccess controller={controller} />}
      <div className={w.info}><span className={w.infoIcon}>i</span><span><strong>Security Policy Notice</strong><br />Organization membership does not automatically grant mailbox access. Access must be explicitly granted per user.</span></div>
      {controller.error && <div className={w.error}>{controller.error}</div>}
    </WizardShell>
  );
}

function MemberAccess({ controller }: { controller: OnboardingController }) {
  return (
    <div className={styles.members}>
      {controller.members.map((member) => <MemberOption key={member.id} member={member} controller={controller} />)}
      {controller.members.length === 0 && <span style={{ color: "#71717a", fontSize: 12 }}>No additional organization members available.</span>}
    </div>
  );
}

function MemberOption({ member, controller }: { member: OrganizationMember; controller: OnboardingController }) {
  const userId = memberUserId(member);
  if (!userId) return null;
  const label = member.user?.email ?? member.user?.name ?? userId;
  return <label className={styles.member}><input type="checkbox" checked={controller.accountForm.shared_user_ids.includes(userId)} onChange={(event) => controller.toggleSharedUser(userId, event.target.checked)} /><span>{label} · {member.role}</span></label>;
}

function Behavior({ controller }: { controller: OnboardingController }) {
  return (
    <WizardShell kind="onboarding" step={4} total={6} title="Mailflow behavior" subtitle="Recommended defaults are pre-selected. You can adjust these anytime in Settings." back={{ onClick: () => controller.setStep("privacy") }} next={{ label: controller.busy ? "Saving…" : "Continue", onClick: () => void controller.saveBehavior(), disabled: controller.busy }}>
      <div className={styles.behaviorRows}>
        <BehaviorRow title="Classification" copy="Categorize incoming email automatically" control={<span className={styles.toggle} aria-label="Enabled" />} />
        <BehaviorRow title="Tags" copy="Apply system urgency & action tags" control={<span className={styles.toggle} aria-label="Enabled" />} />
        <BehaviorRow title="Move to folders" copy="Organize into mapped folders automatically" control={<span className={styles.policy}>Automatic when safe</span>} />
        <BehaviorRow title="Archive" copy="Archive processed email automatically" control={<span className={styles.policy}>Review first</span>} />
        <BehaviorRow title="Delete" copy="Remove old email automatically" control={<span className={`${styles.policy} ${styles.never}`}>Never automatic</span>} />
      </div>
      <div className={styles.safety}><span style={{ color: "#10b981" }}>✓</span><span>Mailflow never sends email without your explicit approval.</span></div>
      {controller.error && <div className={w.error}>{controller.error}</div>}
    </WizardShell>
  );
}

function BehaviorRow({ title, copy, control }: { title: string; copy: string; control: React.ReactNode }) {
  return <div className={styles.behaviorRow}><span><span className={styles.behaviorTitle}>{title}</span><span className={styles.behaviorCopy}>{copy}</span></span>{control}</div>;
}

function ExistingMail({ controller }: { controller: OnboardingController }) {
  return (
    <WizardShell kind="onboarding" step={5} total={6} title="Existing email" subtitle="Should Mailflow analyze your existing messages?" back={{ onClick: () => controller.setStep("behavior") }} next={{ label: controller.busy ? "Starting…" : "Continue", onClick: () => void controller.finishExisting(), disabled: controller.busy }}>
      <div className={styles.switchCard}>
        <span><strong>Analyze existing messages</strong><span>Processes your historical archive</span></span>
        <button type="button" aria-label="Analyze existing messages" aria-pressed={controller.analyzeExisting} className={`${styles.switchButton} ${controller.analyzeExisting ? styles.switchButtonOn : ""}`} onClick={() => controller.setAnalyzeExisting(!controller.analyzeExisting)} />
      </div>
      <div className={styles.connectionCard}>
        <h3>ⓘ How Dry Run works</h3>
        <p>Mailflow will analyze your existing email in the background using Dry Run mode — it proposes changes without modifying your mailbox. You review and approve before anything changes.</p>
      </div>
      <p style={{ margin: 0, color: "#71717a", fontSize: 12 }}>This runs in the background. You can start using Mailflow immediately.</p>
      {controller.error && <div className={w.error}>{controller.error}</div>}
    </WizardShell>
  );
}

function Ready({ controller }: { controller: OnboardingController }) {
  const account = controller.account;
  return (
    <WizardShell kind="onboarding" step={6} total={6} title="You're all set!" subtitle="Your workspace setup has been successfully completed." back={{ onClick: () => controller.setStep("existing") }} next={{ label: "Open Mailflow", onClick: controller.openMailflow }}>
      <div className={styles.readyPanel}><span className={styles.readyCheck}>✓</span><strong>Ready to onboard</strong><span>{controller.analyzeExisting ? "Existing email analysis is starting in the background." : "You can start using Mailflow immediately."}</span></div>
      <div className={styles.summary}>
        <div className={styles.summaryTitle}>Setup Summary</div>
        <SummaryRow label="Mailbox connected" value={account?.username ?? "Connected"} />
        <SummaryRow label="Privacy policy" value={account?.ownership_mode === "shared" ? "Shared" : "Private"} />
        <SummaryRow label="Safety policy" value="Active" />
        <SummaryRow label="Workspace" value="Classic (default)" />
        <SummaryRow label="Historical analysis" value={controller.analyzeExisting ? "Dry Run active" : "Skipped"} />
      </div>
      <p style={{ margin: 0, display: "flex", justifyContent: "space-between", gap: 12, color: "#a1a1aa", fontSize: 13 }}><span>Want to customize your workspace?</span><span style={{ color: "#4f46e5", fontWeight: 600 }}>Customize workspace later</span></p>
    </WizardShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className={styles.summaryRow}><span>{label}</span><span className={styles.summaryValue}>{value} <span style={{ color: "#10b981" }}>✓</span></span></div>;
}
