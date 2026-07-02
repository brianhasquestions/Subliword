#!/bin/bash
set -e

# =============================================================================
# Subliword Deployment Script for Ubuntu
# One-shot deployment for subliword.com with Cloudflare SSL
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "=========================================="
echo "  Subliword Deployment Script"
echo "=========================================="
echo ""

# -----------------------------------------------------------------------------
# 1. Check for required dependencies
# -----------------------------------------------------------------------------
echo -e "${YELLOW}[1/5] Checking dependencies...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo ""
    echo "Install Docker on Ubuntu with:"
    echo "  curl -fsSL https://get.docker.com -o get-docker.sh"
    echo "  sudo sh get-docker.sh"
    echo "  sudo usermod -aG docker \$USER"
    echo ""
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: Docker Compose V2 is not installed.${NC}"
    echo ""
    echo "Docker Compose V2 should come with Docker. Try reinstalling Docker."
    exit 1
fi

echo -e "${GREEN}✓ Docker and Docker Compose are installed${NC}"

# -----------------------------------------------------------------------------
# 2. Check for Cloudflare Origin Certificate
# -----------------------------------------------------------------------------
echo -e "${YELLOW}[2/5] Checking SSL certificates...${NC}"

SSL_DIR="./nginx/ssl"
CERT_FILE="$SSL_DIR/origin.pem"
KEY_FILE="$SSL_DIR/origin-key.pem"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo -e "${RED}Error: Cloudflare Origin Certificate not found.${NC}"
    echo ""
    echo "Please create a Cloudflare Origin Certificate:"
    echo "  1. Go to Cloudflare Dashboard → SSL/TLS → Origin Server"
    echo "  2. Click 'Create Certificate'"
    echo "  3. Keep defaults (RSA, 15 years, *.subliword.com and subliword.com)"
    echo "  4. Save the certificate to: $CERT_FILE"
    echo "  5. Save the private key to: $KEY_FILE"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ SSL certificates found${NC}"

# -----------------------------------------------------------------------------
# 3. Create uploads directory if needed (Skipped - Static Site)
# -----------------------------------------------------------------------------
# echo -e "${YELLOW}[3/5] Setting up directories...${NC}"
# 
# mkdir -p uploads
# chmod 755 uploads
# 
# echo -e "${GREEN}✓ Directories ready${NC}"

# -----------------------------------------------------------------------------
# 4. Build and start containers
# -----------------------------------------------------------------------------
echo -e "${YELLOW}[4/5] Building and starting containers...${NC}"

docker compose build --no-cache
docker compose up -d

echo -e "${GREEN}✓ Containers started${NC}"

# -----------------------------------------------------------------------------
# 5. Verify deployment
# -----------------------------------------------------------------------------
echo -e "${YELLOW}[5/5] Verifying deployment...${NC}"

sleep 5

if docker compose ps | grep -q "Up"; then
    echo -e "${GREEN}✓ All containers are running${NC}"
else
    echo -e "${RED}Warning: Some containers may not be running properly${NC}"
    docker compose ps
fi

echo ""
echo "=========================================="
echo -e "${GREEN}  Deployment Complete!${NC}"
echo "=========================================="
echo ""
echo "Cloudflare Setup Reminder:"
echo "  1. DNS: A record pointing to this server's IP"
echo "  2. SSL/TLS: Set to 'Full (strict)' mode"
echo "  3. Proxy: Enable (orange cloud)"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f      # View logs"
echo "  docker compose restart      # Restart services"
echo "  docker compose down         # Stop services"
echo "  docker compose up -d        # Start services"
echo ""
