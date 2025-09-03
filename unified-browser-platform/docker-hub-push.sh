#!/bin/bash

# Docker Hub Push Script for Unified Browser Platform
# This script builds, tags, and pushes the Docker image to Docker Hub

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
DOCKER_USERNAME=""  # Set your Docker Hub username here
IMAGE_NAME="unified-browser-platform"
VERSION="latest"
FULL_IMAGE_NAME=""

# Function to get Docker Hub username
get_docker_username() {
    if [ -z "$DOCKER_USERNAME" ]; then
        read -p "Enter your Docker Hub username: " DOCKER_USERNAME
    fi
    
    if [ -z "$DOCKER_USERNAME" ]; then
        print_error "Docker Hub username is required"
        exit 1
    fi
    
    FULL_IMAGE_NAME="${DOCKER_USERNAME}/${IMAGE_NAME}"
    print_success "Using Docker Hub repository: $FULL_IMAGE_NAME"
}

# Function to check if Docker is running and user is logged in
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    # Check if user is logged in to Docker Hub
    if ! docker system info | grep -q "Username:"; then
        print_warning "Not logged in to Docker Hub. Please login first."
        docker login
        if [ $? -ne 0 ]; then
            print_error "Docker login failed"
            exit 1
        fi
    fi
    
    print_success "Docker is running and authenticated"
}

# Function to build the image
build_image() {
    local version=${1:-$VERSION}
    local dockerfile=${2:-"Dockerfile"}
    
    print_status "Building Docker image: ${FULL_IMAGE_NAME}:${version}"
    print_status "Using Dockerfile: $dockerfile"
    
    if docker build -t "${FULL_IMAGE_NAME}:${version}" -f "$dockerfile" .; then
        print_success "Docker image built successfully: ${FULL_IMAGE_NAME}:${version}"
    else
        print_error "Failed to build Docker image"
        exit 1
    fi
    
    # Also tag as latest if version is not latest
    if [ "$version" != "latest" ]; then
        print_status "Tagging as latest..."
        docker tag "${FULL_IMAGE_NAME}:${version}" "${FULL_IMAGE_NAME}:latest"
    fi
}

# Function to push to Docker Hub
push_image() {
    local version=${1:-$VERSION}
    
    print_status "Pushing image to Docker Hub: ${FULL_IMAGE_NAME}:${version}"
    
    if docker push "${FULL_IMAGE_NAME}:${version}"; then
        print_success "Successfully pushed ${FULL_IMAGE_NAME}:${version}"
    else
        print_error "Failed to push image to Docker Hub"
        exit 1
    fi
    
    # Push latest tag if version is not latest
    if [ "$version" != "latest" ]; then
        print_status "Pushing latest tag..."
        if docker push "${FULL_IMAGE_NAME}:latest"; then
            print_success "Successfully pushed ${FULL_IMAGE_NAME}:latest"
        else
            print_warning "Failed to push latest tag"
        fi
    fi
}

# Function to create and push multi-architecture image
push_multiarch() {
    local version=${1:-$VERSION}
    
    print_status "Creating multi-architecture image for platforms: linux/amd64,linux/arm64"
    
    # Create and use a new builder instance
    docker buildx create --name multiarch-builder --use 2>/dev/null || docker buildx use multiarch-builder
    
    # Build and push multi-architecture image
    if docker buildx build \
        --platform linux/amd64,linux/arm64 \
        --tag "${FULL_IMAGE_NAME}:${version}" \
        --tag "${FULL_IMAGE_NAME}:latest" \
        --push .; then
        print_success "Successfully pushed multi-architecture image"
    else
        print_error "Failed to push multi-architecture image"
        exit 1
    fi
}

# Function to show image info
show_image_info() {
    local version=${1:-$VERSION}
    
    print_status "Image information:"
    echo "Repository: ${FULL_IMAGE_NAME}"
    echo "Tag: ${version}"
    echo "Docker Hub URL: https://hub.docker.com/r/${FULL_IMAGE_NAME}"
    echo ""
    echo "To pull this image:"
    echo "  docker pull ${FULL_IMAGE_NAME}:${version}"
    echo ""
    echo "To run this image:"
    echo "  docker run -d -p 3000:3000 --name unified-browser-platform ${FULL_IMAGE_NAME}:${version}"
}

# Main script logic
case "$1" in
    "login")
        docker login
        ;;
    "build")
        get_docker_username
        check_docker
        build_image "$2" "$3"
        ;;
    "push")
        get_docker_username
        check_docker
        push_image "$2"
        ;;
    "build-push")
        get_docker_username
        check_docker
        build_image "$2" "$3"
        push_image "$2"
        show_image_info "$2"
        ;;
    "multiarch")
        get_docker_username
        check_docker
        push_multiarch "$2"
        show_image_info "$2"
        ;;
    "info")
        get_docker_username
        show_image_info "$2"
        ;;
    *)
        echo "Usage: $0 {login|build|push|build-push|multiarch|info}"
        echo ""
        echo "Commands:"
        echo "  login                           - Login to Docker Hub"
        echo "  build [version] [dockerfile]    - Build Docker image"
        echo "  push [version]                  - Push to Docker Hub"
        echo "  build-push [version] [dockerfile] - Build and push"
        echo "  multiarch [version]             - Build and push multi-architecture"
        echo "  info [version]                  - Show image information"
        echo ""
        echo "Examples:"
        echo "  $0 login"
        echo "  $0 build-push"
        echo "  $0 build-push v1.0.0"
        echo "  $0 multiarch"
        echo ""
        echo "Environment variables:"
        echo "  DOCKER_USERNAME - premkumarsk2005"
        exit 1
        ;;
esac
