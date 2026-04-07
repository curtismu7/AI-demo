#!/bin/bash

# Super Banking Kubernetes Deployment Script
# This script automates the deployment of all Super Banking components

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Check if kubectl is available
check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    if ! kubectl cluster-info &> /dev/null; then
        print_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    print_success "kubectl is available and cluster is accessible"
}

# Check if namespace exists
check_namespace() {
    if kubectl get namespace super-banking &> /dev/null; then
        print_warning "Namespace super-banking already exists"
        read -p "Do you want to delete and recreate? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            kubectl delete namespace super-banking
            print_status "Waiting for namespace deletion..."
            kubectl wait --for=delete namespace/super-banking --timeout=300s
        fi
    fi
}

# Wait for pods to be ready
wait_for_pods() {
    local component=$1
    print_status "Waiting for $component pods to be ready..."
    kubectl wait --for=condition=ready pod -l component=$component -n super-banking --timeout=300s
    print_success "$component pods are ready"
}

# Deploy infrastructure
deploy_infrastructure() {
    print_status "Deploying namespace and infrastructure..."
    kubectl apply -f 01-namespace.yaml
    kubectl apply -f 02-configmap.yaml
    
    # Check if secrets file exists
    if [ -f "03-secrets.yaml" ]; then
        kubectl apply -f 03-secrets.yaml
    else
        print_warning "03-secrets.yaml not found. Copy 03-secrets.yaml.template and configure it manually."
        print_status "Creating placeholder secrets for demo purposes..."
        kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: super-banking-secrets
  namespace: super-banking
type: Opaque
data:
  session-secret: $(echo -n "demo-session-secret" | base64)
  jwt-secret: $(echo -n "demo-jwt-secret" | base64)
  redis-password: $(echo -n "demo-redis-password" | base64)
EOF
    fi
    
    print_success "Infrastructure deployed"
}

# Deploy Redis
deploy_redis() {
    print_status "Deploying Redis..."
    kubectl apply -f 50-redis-deployment.yaml
    wait_for_pods "redis"
    print_success "Redis deployed"
}

# Deploy backend services
deploy_backend() {
    print_status "Deploying backend services..."
    kubectl apply -f 20-api-server-deployment.yaml
    kubectl apply -f 30-mcp-server-deployment.yaml
    kubectl apply -f 40-agent-service-deployment.yaml
    
    wait_for_pods "api-server"
    wait_for_pods "mcp-server"
    wait_for_pods "agent-service"
    
    print_success "Backend services deployed"
}

# Deploy frontend
deploy_frontend() {
    print_status "Deploying frontend..."
    kubectl apply -f 10-frontend-deployment.yaml
    wait_for_pods "frontend"
    print_success "Frontend deployed"
}

# Show deployment status
show_status() {
    print_status "Deployment status:"
    echo
    kubectl get pods -n super-banking
    echo
    print_status "Services:"
    kubectl get services -n super-banking
    echo
    if kubectl get ingress -n super-banking &> /dev/null; then
        print_status "Ingress:"
        kubectl get ingress -n super-banking
        echo
    fi
}

# Test deployment
test_deployment() {
    print_status "Testing deployment..."
    
    # Test Redis connection
    if kubectl exec -n super-banking deployment/banking-api-server -- ping redis-service &> /dev/null; then
        print_success "Redis connection test passed"
    else
        print_warning "Redis connection test failed"
    fi
    
    # Test API server health
    if kubectl exec -n super-banking deployment/banking-api-server -- curl -s http://localhost:3001/health &> /dev/null; then
        print_success "API server health check passed"
    else
        print_warning "API server health check failed"
    fi
    
    # Test frontend
    if kubectl exec -n super-banking deployment/banking-frontend -- curl -s http://localhost:3000 &> /dev/null; then
        print_success "Frontend health check passed"
    else
        print_warning "Frontend health check failed"
    fi
}

# Main deployment function
main() {
    print_status "Starting Super Banking Kubernetes deployment..."
    
    check_kubectl
    check_namespace
    
    deploy_infrastructure
    deploy_redis
    deploy_backend
    deploy_frontend
    
    show_status
    test_deployment
    
    print_success "Super Banking deployment completed!"
    echo
    print_status "Access the application:"
    if kubectl get ingress -n super-banking &> /dev/null; then
        echo "Check ingress endpoint with: kubectl get ingress -n super-banking"
    else
        echo "Use port forwarding:"
        echo "kubectl port-forward -n super-banking service/banking-frontend 3000:3000"
        echo "Then access: http://localhost:3000"
    fi
}

# Cleanup function
cleanup() {
    print_status "Cleaning up Super Banking deployment..."
    kubectl delete namespace super-banking
    print_success "Cleanup completed"
}

# Handle command line arguments
case "${1:-deploy}" in
    deploy)
        main
        ;;
    cleanup)
        cleanup
        ;;
    status)
        show_status
        ;;
    test)
        test_deployment
        ;;
    *)
        echo "Usage: $0 {deploy|cleanup|status|test}"
        echo "  deploy  - Deploy all Super Banking components"
        echo "  cleanup - Remove all Super Banking components"
        echo "  status  - Show deployment status"
        echo "  test    - Test deployment health"
        exit 1
        ;;
esac
