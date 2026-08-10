#!/usr/bin/env bash
set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}VERIQAS — Quantum Risk & Compliance Platform${RESET}"
echo "────────────────────────────────────────────"
echo ""

# Check Docker
if ! command -v docker &>/dev/null; then
  echo "Docker is not installed. Install it from https://docs.docker.com/get-docker/ and re-run."
  exit 1
fi
if ! docker compose version &>/dev/null 2>&1; then
  echo "Docker Compose v2 is required. Update Docker Desktop or install the compose plugin."
  exit 1
fi

# Generate .env.docker if it doesn't exist
if [ ! -f .env.docker ]; then
  echo -e "${YELLOW}Creating .env.docker from template...${RESET}"
  cp .env.docker.example .env.docker

  # Auto-generate secrets
  if command -v openssl &>/dev/null; then
    AUTH_SECRET=$(openssl rand -base64 32)
    DB_PASSWORD=$(openssl rand -hex 16)
    # Replace placeholders
    sed -i.bak "s|replace_with_output_of_openssl_rand_base64_32|${AUTH_SECRET}|" .env.docker
    sed -i.bak "s|change_me_before_deploy|${DB_PASSWORD}|" .env.docker
    rm -f .env.docker.bak
    echo -e "${GREEN}✓ Secrets generated automatically.${RESET}"
  else
    echo ""
    echo -e "${YELLOW}openssl not found. Please edit .env.docker and set:${RESET}"
    echo "  AUTH_SECRET  — run: openssl rand -base64 32"
    echo "  DB_PASSWORD  — any strong password"
    echo ""
    read -p "Press Enter once you've updated .env.docker..."
  fi
else
  echo -e "${GREEN}✓ .env.docker already exists — skipping generation.${RESET}"
fi

echo ""
echo "Building and starting VERIQAS (this takes a few minutes on first run)..."
echo ""

docker compose up --build -d

echo ""
echo -e "${GREEN}${BOLD}✓ VERIQAS is starting up.${RESET}"
echo ""
echo "  App:     http://localhost:${PORT:-4000}"
echo "  Logs:    docker compose logs -f"
echo "  Stop:    docker compose down"
echo ""
echo "The database is being migrated automatically. Allow ~30 seconds before opening the app."
echo ""
