import * as hcloud from "@pulumi/hcloud";
import * as tls from "@pulumi/tls";

// ---------------------------------------------------------------------------
// SSH Key: Generated TLS key pair for server access
// ---------------------------------------------------------------------------

const sshKeyPair = new tls.PrivateKey("hermes-ssh-key", {
    algorithm: "ED25519",
});

export const sshKey = new hcloud.SshKey("hermes-ssh-key", {
    publicKey: sshKeyPair.publicKeyOpenssh,
    labels: { project: "hermes-infra" },
});

export const privateKey = sshKeyPair.privateKeyOpenssh;
