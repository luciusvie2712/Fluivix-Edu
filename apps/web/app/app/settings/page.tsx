"use client";
import { TenantSettingsWorkspace } from "../../../components/tenant-settings-workspace";
import { TenantSubscriptionSummary } from "../../../components/tenant-subscription-summary";
export default function Settings() {
  return (
    <>
      <h1>Cài đặt trung tâm</h1>
      <TenantSettingsWorkspace>
        <TenantSubscriptionSummary />
      </TenantSettingsWorkspace>
    </>
  );
}
