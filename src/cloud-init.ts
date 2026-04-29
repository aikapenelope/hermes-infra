import * as pulumi from "@pulumi/pulumi";

// ---------------------------------------------------------------------------
// Configuration: Optional tokens (added later via pulumi config)
// ---------------------------------------------------------------------------

const config = new pulumi.Config("hermes-infra");
const openrouterApiKey = config.getSecret("openrouterApiKey") || "";
const discordBotToken = config.getSecret("discordBotToken") || "";
const telegramBotToken = config.getSecret("telegramBotToken") || "";
const honchoLlmApiKey = config.getSecret("honchoLlmApiKey") || "";
const apiServerKey = config.getSecret("apiServerKey") || "";

// ---------------------------------------------------------------------------
// Cloud-init: Bootstrap the VPS with Docker and all Hermes services
// ---------------------------------------------------------------------------

export const cloudInit = pulumi.all([
    openrouterApiKey,
    discordBotToken,
    telegramBotToken,
    honchoLlmApiKey,
    apiServerKey,
]).apply(([openrouter, discord, telegram, honchoLlm, apiKey]) => `#cloud-config
package_update: true
package_upgrade: true

packages:
  - curl
  - git
  - jq
  - unzip
  - ca-certificates
  - gnupg
  - lsb-release
  - fail2ban
  - ufw

users:
  - name: hermes
    groups: [docker, sudo]
    shell: /bin/bash
    sudo: ALL=(ALL) NOPASSWD:ALL
    ssh_authorized_keys: []

write_files:
  # Docker Compose for all Hermes services
  - path: /opt/hermes/docker-compose.yml
    permissions: "0644"
    content: |
      services:
        # --- Honcho OSS (memory layer) ---
        honcho-db:
          image: pgvector/pgvector:pg16
          container_name: honcho-db
          restart: unless-stopped
          environment:
            POSTGRES_USER: honcho
            POSTGRES_PASSWORD: honcho-secret
            POSTGRES_DB: honcho
          volumes:
            - honcho-db-data:/var/lib/postgresql/data
          networks:
            - hermes-net
          deploy:
            resources:
              limits:
                memory: 512M

        honcho-redis:
          image: redis:7-alpine
          container_name: honcho-redis
          restart: unless-stopped
          networks:
            - hermes-net
          deploy:
            resources:
              limits:
                memory: 128M

        honcho-api:
          image: ghcr.io/plastic-labs/honcho:latest
          container_name: honcho-api
          restart: unless-stopped
          environment:
            DATABASE_URL: postgresql://honcho:honcho-secret@honcho-db:5432/honcho
            REDIS_URL: redis://honcho-redis:6379
            OPENAI_API_BASE: https://openrouter.ai/api/v1
            OPENAI_API_KEY: ${openrouter || "PLACEHOLDER_OPENROUTER_KEY"}
          ports:
            - "127.0.0.1:8000:8000"
          depends_on:
            - honcho-db
            - honcho-redis
          networks:
            - hermes-net
          deploy:
            resources:
              limits:
                memory: 512M

        # --- Hermes Agent (gateway) ---
        hermes:
          image: nousresearch/hermes-agent:latest
          container_name: hermes
          restart: unless-stopped
          command: gateway run
          ports:
            - "0.0.0.0:8642:8642"
          volumes:
            - hermes-data:/opt/data
          networks:
            - hermes-net
          deploy:
            resources:
              limits:
                memory: 2G
                cpus: "2.0"

        # --- Hermes Dashboard ---
        hermes-dashboard:
          image: nousresearch/hermes-agent:latest
          container_name: hermes-dashboard
          restart: unless-stopped
          command: dashboard --host 0.0.0.0
          ports:
            - "0.0.0.0:9119:9119"
          volumes:
            - hermes-data:/opt/data
          environment:
            GATEWAY_HEALTH_URL: http://hermes:8642
          depends_on:
            - hermes
          networks:
            - hermes-net
          deploy:
            resources:
              limits:
                memory: 512M

        # --- Hermes Workspace (PWA) ---
        hermes-workspace:
          image: ghcr.io/outsourc-e/hermes-workspace:latest
          container_name: hermes-workspace
          restart: unless-stopped
          ports:
            - "0.0.0.0:3000:3000"
          environment:
            HERMES_API_URL: http://hermes:8642
            HERMES_DASHBOARD_URL: http://hermes-dashboard:9119
            HERMES_API_TOKEN: ${apiKey || ""}
          depends_on:
            - hermes
            - hermes-dashboard
          networks:
            - hermes-net
          deploy:
            resources:
              limits:
                memory: 512M

        # --- Camofox (browser automation) ---
        camofox:
          image: jo-inc/camofox-browser:latest
          container_name: camofox
          restart: unless-stopped
          ports:
            - "127.0.0.1:9377:9377"
          environment:
            CAMOFOX_PORT: "9377"
          networks:
            - hermes-net
          deploy:
            resources:
              limits:
                memory: 1G

      volumes:
        hermes-data:
        honcho-db-data:

      networks:
        hermes-net:
          driver: bridge

  # Hermes Agent .env configuration
  - path: /opt/hermes/hermes.env
    permissions: "0600"
    content: |
      # LLM Provider
      OPENROUTER_API_KEY=${openrouter || "PLACEHOLDER_OPENROUTER_KEY"}
      MODEL_PROVIDER=openrouter
      MODEL_NAME=anthropic/claude-sonnet-4

      # API Server (for Workspace/Dashboard access)
      API_SERVER_ENABLED=true
      API_SERVER_HOST=0.0.0.0
      API_SERVER_KEY=${apiKey || "hermes-api-secret"}

      # Messaging platforms (configure later)
      ${discord ? `DISCORD_BOT_TOKEN=${discord}` : "# DISCORD_BOT_TOKEN="}
      ${telegram ? `TELEGRAM_BOT_TOKEN=${telegram}` : "# TELEGRAM_BOT_TOKEN="}

      # Honcho (self-hosted)
      HONCHO_BASE_URL=http://honcho-api:8000

      # Browser automation
      CAMOFOX_URL=http://camofox:9377

      # Security
      HERMES_YOLO_MODE=0

  # Hermes config.yaml
  - path: /opt/hermes/config.yaml
    permissions: "0644"
    content: |
      model:
        default: anthropic/claude-sonnet-4
        provider: openrouter

      memory:
        provider: honcho

      terminal:
        backend: local

      approvals:
        mode: manual
        timeout: 60

      browser:
        cloud_provider: null
        auto_local_for_private_urls: true

  # Honcho config for Hermes
  - path: /opt/hermes/honcho.json
    permissions: "0644"
    content: |
      {
        "baseUrl": "http://localhost:8000",
        "hosts": {
          "hermes": {
            "enabled": true,
            "aiPeer": "hermes",
            "peerName": "angel",
            "workspace": "hermes"
          }
        }
      }

  # Systemd service for docker compose
  - path: /etc/systemd/system/hermes.service
    permissions: "0644"
    content: |
      [Unit]
      Description=Hermes Agent Stack
      After=docker.service
      Requires=docker.service

      [Service]
      Type=oneshot
      RemainAfterExit=yes
      WorkingDirectory=/opt/hermes
      ExecStart=/usr/bin/docker compose up -d
      ExecStop=/usr/bin/docker compose down
      TimeoutStartSec=300

      [Install]
      WantedBy=multi-user.target

runcmd:
  # Install Docker
  - curl -fsSL https://get.docker.com | sh
  - systemctl enable docker
  - systemctl start docker

  # Install Docker Compose plugin
  - apt-get install -y docker-compose-plugin

  # Set permissions
  - chown -R hermes:hermes /opt/hermes
  - chmod 600 /opt/hermes/hermes.env

  # Initialize Hermes data volume with config
  - docker volume create hermes-data
  - |
    docker run --rm -v hermes-data:/opt/data -v /opt/hermes:/config alpine sh -c "
      mkdir -p /opt/data
      cp /config/hermes.env /opt/data/.env
      cp /config/config.yaml /opt/data/config.yaml
      cp /config/honcho.json /opt/data/honcho.json
      chmod 600 /opt/data/.env
    "

  # Enable and start the Hermes service
  - systemctl daemon-reload
  - systemctl enable hermes.service
  - systemctl start hermes.service

  # Configure fail2ban
  - systemctl enable fail2ban
  - systemctl start fail2ban

  # Harden SSH
  - sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
  - sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
  - sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config
  - systemctl restart sshd
`);
