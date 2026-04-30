import * as pulumi from "@pulumi/pulumi";

// ---------------------------------------------------------------------------
// Module imports
// ---------------------------------------------------------------------------

import { sshKey, privateKey } from "./src/ssh";
import { firewall } from "./src/firewall";
import { server, serverNetwork } from "./src/server";

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export const serverIp = server.ipv4Address;
export const serverStatus = server.status;
export const sshPrivateKey = privateKey;

export const nextSteps = pulumi.interpolate`
=== Hermes Agent VPS Deployed ===

1. SSH access (temporary, until Tailscale is configured):
   ssh -i <private-key-file> hermes@${server.ipv4Address}

2. Services (accessible via Tailscale after setup):
   - Hermes Gateway API: http://<tailscale-ip>:8642
   - Hermes Dashboard:   http://<tailscale-ip>:9119
   - Hermes Workspace:   http://<tailscale-ip>:3000

3. To configure messaging platforms:
   pulumi config set --secret hermes-infra:discordBotToken <TOKEN>
   pulumi config set --secret hermes-infra:telegramBotToken <TOKEN>

4. To add Tailscale (final step):
   pulumi config set --secret hermes-infra:tailscaleAuthKey <KEY>
`;
