import * as hcloud from "@pulumi/hcloud";

// ---------------------------------------------------------------------------
// Firewall: Hermes VPS
// Allows: SSH (temporary for setup), Tailscale WireGuard, ICMP.
// All Hermes services are accessed via Tailscale only.
// SSH will be removed once Tailscale is configured.
// ---------------------------------------------------------------------------

export const firewall = new hcloud.Firewall("fw-hermes", {
    labels: { project: "hermes-infra" },
    rules: [
        {
            direction: "in",
            protocol: "tcp",
            port: "22",
            sourceIps: ["0.0.0.0/0", "::/0"],
            description: "SSH (temporary - remove after Tailscale setup)",
        },
        {
            direction: "in",
            protocol: "udp",
            port: "41641",
            sourceIps: ["0.0.0.0/0", "::/0"],
            description: "Tailscale WireGuard",
        },
        {
            direction: "in",
            protocol: "icmp",
            sourceIps: ["0.0.0.0/0", "::/0"],
            description: "Ping",
        },
    ],
});
