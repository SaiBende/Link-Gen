#!/bin/bash
set -e

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="${AWS_REGION:-us-east-1}"
REPO_PREFIX="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/redirect-platform"

# Login to ECR
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# Build and push dashboard
docker build -t "${REPO_PREFIX}/dashboard:latest" -f Dockerfile .
docker tag "${REPO_PREFIX}/dashboard:latest" "${REPO_PREFIX}/dashboard:$(git rev-parse --short HEAD)"
docker push "${REPO_PREFIX}/dashboard:latest"
docker push "${REPO_PREFIX}/dashboard:$(git rev-parse --short HEAD)"

# Build and push redirect-engine
docker build -t "${REPO_PREFIX}/engine:latest" -f Dockerfile.redirect .
docker tag "${REPO_PREFIX}/engine:latest" "${REPO_PREFIX}/engine:$(git rev-parse --short HEAD)"
docker push "${REPO_PREFIX}/engine:latest"
docker push "${REPO_PREFIX}/engine:$(git rev-parse --short HEAD)"

echo "Done. Images pushed to ECR."
