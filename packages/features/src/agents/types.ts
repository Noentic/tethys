//! Narrow client slice the Providers + Monitoring screens need (M1.12/M1.13).
//!
//! Structural, so tests inject a fake and the real `@tethys/client` satisfies it
//! without a mock layer.

import type {
  AgentLoginOutcome,
  AgentProfileView,
  AgentRegistryEntryView,
  InstallResult,
  LoginTerminalOutput,
  ProcessSample,
  ProfileInput,
} from "@tethys/bindings";

export interface ProvidersClient {
  agent: {
    profilesList(): Promise<AgentProfileView[]>;
    profilesCreate(input: ProfileInput): Promise<AgentProfileView>;
    profilesUpdate(input: ProfileInput): Promise<AgentProfileView>;
    profilesDelete(id: string): Promise<void>;
    registryList(): Promise<AgentRegistryEntryView[]>;
    registryInstall(id: string, version?: string): Promise<InstallResult>;
    registryUpdate(id: string): Promise<InstallResult>;
    connectionsRestart(profileId: string): Promise<void>;
    login(profileId: string, methodId: string): Promise<AgentLoginOutcome>;
    logout(profileId: string): Promise<void>;
    loginTerminalOutput(
      profileId: string,
      terminalId: string,
    ): Promise<LoginTerminalOutput>;
    loginTerminalWrite(
      profileId: string,
      terminalId: string,
      text: string,
    ): Promise<void>;
    loginTerminalCancel(profileId: string, terminalId: string): Promise<void>;
    envSecretSet(
      profileId: string,
      key: string,
      value: string,
    ): Promise<AgentProfileView>;
    stderr(profileId: string): Promise<string>;
    processSample(profileId: string): Promise<ProcessSample[]>;
    healthIntervalSet(seconds: number): Promise<void>;
    recheck(profileId?: string): Promise<void>;
  };
}
