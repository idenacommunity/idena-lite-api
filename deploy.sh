#!/bin/bash

# Quick deployment script for idena-lite-api
# Usage: ./deploy.sh

set -e

echo "🚀 Deploying idena-lite-api..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "✅ Created .env file. Please edit it with your configuration:"
    echo "   nano .env"
    echo ""
    read -p "Press Enter to continue after editing .env..."
fi

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose down

# Build and start
echo "🏗️  Building and starting containers..."
docker-compose up -d --build

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 10

# Test the API
echo "🧪 Testing API health..."
if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✅ API is healthy!"
    echo ""
    echo "🎉 Deployment successful!"
    echo ""
    echo "API is now running at: http://localhost:3000"
    echo ""
    echo "Quick test:"
    echo "  curl http://localhost:3000/api/health"
    echo ""
    echo "View logs:"
    echo "  docker-compose logs -f"
    echo ""
    echo "Stop API:"
    echo "  docker-compose down"
else
    echo "❌ API health check failed"
    echo "Check logs with: docker-compose logs"
    exit 1
fi
