import { API_BASE } from "./config";

export type BootstrapSource =
  | "cli"
  | "compose"
  | "helm"
  | "operator"
  | "environment"
  | "default";

export type BootstrapField = {
  value: string | null;
  configured: boolean;
  source: BootstrapSource;
  managed: boolean;
};

export type BootstrapStatus = {
  deployment_source: BootstrapSource;
  fields: {
    public_url: BootstrapField;
    tls: BootstrapField;
    language: BootstrapField;
  };
};

export async function getBootstrapStatus(): Promise<BootstrapStatus> {
  const response = await fetch(`${API_BASE}/bootstrap/status`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("bootstrap_status_failed");
  }
  return (await response.json()) as BootstrapStatus;
}
