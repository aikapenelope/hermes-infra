import * as pulumi from "@pulumi/pulumi";
import * as hcloud from "@pulumi/hcloud";

import { sshKey } from "./ssh";
import { firewall } from "./firewall";
import { cloudInit } from "./cloud-init";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const config = new pulumi.Config("hermes-infra");
const location = config.get("location") || "hel1";
const serverType = config.get("serverType") || "cx33";

// ---------------------------------------------------------------------------
// Server: Hermes Agent VPS
// CX33: 4 vCPU, 8 GB RAM, 80 GB NVMe
// ---------------------------------------------------------------------------

export const server = new hcloud.Server("hermes-agent", {
    serverType: serverType,
    location: location,
    image: "ubuntu-24.04",
    sshKeys: [sshKey.id],
    firewallIds: [firewall.id.apply((id) => parseInt(id, 10))],
    userData: cloudInit,
    backups: true,
    labels: {
        project: "hermes-infra",
        role: "agent",
    },
});

// ---------------------------------------------------------------------------
// Network attachment (standalone - no private network needed)
// ---------------------------------------------------------------------------

export const serverNetwork = server.ipv4Address;
