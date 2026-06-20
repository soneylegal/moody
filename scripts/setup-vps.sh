#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Moody — VPS Provisioning Script (Oracle Ampere A1 / Ubuntu 24.04)
# =============================================================================
# Usage:
#   chmod +x scripts/setup-vps.sh
#   ssh moody@<vps-ip> 'bash -s' < scripts/setup-vps.sh
# =============================================================================

echo "=== 1. System packages ==="
sudo apt-get update -qq
sudo apt-get install -y -qq \
    ca-certificates curl gnupg lsb-release ufw

echo "=== 2. Docker ==="
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    echo "  Docker installed — you may need to re-login for group changes"
else
    echo "  Docker already installed"
fi

echo "=== 3. Docker Compose plugin ==="
if ! docker compose version &>/dev/null; then
    sudo apt-get install -y -qq docker-compose-plugin
fi

echo "=== 4. Firewall (UFW) ==="
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    comment 'SSH'
sudo ufw allow 80/tcp    comment 'HTTP'
sudo ufw allow 443/tcp   comment 'HTTPS'
sudo ufw --force enable

echo "=== 5. Swap (1 GB) ==="
if ! swapon --show | grep -q /swapfile; then
    sudo fallocate -l 1G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "  Swap created: 1 GB"
else
    echo "  Swap already exists"
fi

echo "=== 6. Create project directory ==="
mkdir -p ~/moody

echo ""
echo "✅ VPS ready for Moody deploy."
echo "Next steps on your local machine:"
echo "  1. cp .env.vps.example ~/moody/.env"
echo "  2. scp docker-compose.yml Caddyfile ~/moody/"
echo "  3. ssh moody@<vps-ip> 'cd ~/moody && docker compose up -d'"
