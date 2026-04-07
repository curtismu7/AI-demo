# Super Banking Kubernetes Deployment Guide

## Overview

This guide provides complete instructions for deploying the Super Banking AI demo platform on Kubernetes using the provided manifests and Docker images.

## Architecture

The Super Banking platform consists of the following components:

- **Frontend** (banking-frontend) - React SPA served by Nginx
- **API Server** (banking-api-server) - Node.js Express backend
- **MCP Server** (banking-mcp-server) - WebSocket MCP protocol server
- **Agent Service** (banking-agent-service) - Python LangChain AI agent
- **Redis** (redis) - Session storage and caching

## Prerequisites

### Kubernetes Cluster
- Kubernetes 1.24+ with Ingress controller
- kubectl configured to access cluster
- StorageClass named `fast-ssd` (or modify manifests)

### Docker Images
Build all Docker images before deployment:
```bash
# Build frontend
cd banking_api_ui
docker build -t banking-api-ui:latest .

# Build API server
cd banking_api_server
docker build -t banking-api-server:latest .

# Build MCP server
cd banking_mcp_server
docker build -t banking-mcp-server:latest .

# Build agent service
cd langchain_agent
docker build -t langchain-agent:latest .
```

### Secrets Configuration
Copy and configure secrets:
```bash
cp k8s/03-secrets.yaml.template k8s/03-secrets.yaml
# Edit k8s/03-secrets.yaml with actual values
```

## Deployment Steps

### 1. Create Namespace and Infrastructure
```bash
kubectl apply -f k8s/01-namespace.yaml
kubectl apply -f k8s/02-configmap.yaml
kubectl apply -f k8s/03-secrets.yaml
```

### 2. Deploy Redis (Backend Services First)
```bash
kubectl apply -f k8s/50-redis-deployment.yaml
```

Wait for Redis to be ready:
```bash
kubectl wait --for=condition=ready pod -l component=redis -n super-banking --timeout=300s
```

### 3. Deploy Backend Services
```bash
kubectl apply -f k8s/20-api-server-deployment.yaml
kubectl apply -f k8s/30-mcp-server-deployment.yaml
kubectl apply -f k8s/40-agent-service-deployment.yaml
```

Wait for backend services:
```bash
kubectl wait --for=condition=ready pod -l component=api-server -n super-banking --timeout=300s
kubectl wait --for=condition=ready pod -l component=mcp-server -n super-banking --timeout=300s
kubectl wait --for=condition=ready pod -l component=agent-service -n super-banking --timeout=300s
```

### 4. Deploy Frontend
```bash
kubectl apply -f k8s/10-frontend-deployment.yaml
```

Wait for frontend:
```bash
kubectl wait --for=condition=ready pod -l component=frontend -n super-banking --timeout=300s
```

## Verification

### Check All Pods
```bash
kubectl get pods -n super-banking
```

Expected output:
```
NAME                                      READY   STATUS    RESTARTS   AGE
banking-agent-service-xxxxxxxxxx-xxxxx    1/1     Running   0          2m
banking-api-server-xxxxxxxxxx-xxxxx       1/1     Running   0          2m
banking-frontend-xxxxxxxxxx-xxxxx          1/1     Running   0          1m
banking-mcp-server-xxxxxxxxxx-xxxxx        1/1     Running   0          2m
redis-0                                   1/1     Running   0          3m
```

### Check Services
```bash
kubectl get services -n super-banking
```

### Check Ingress
```bash
kubectl get ingress -n super-banking
```

### Test Endpoints
```bash
# Frontend health
kubectl exec -n super-banking deployment/banking-frontend -- curl -s http://localhost:3000 | head -10

# API server health
kubectl exec -n super-banking deployment/banking-api-server -- curl -s http://localhost:3001/health

# MCP server health
kubectl exec -n super-banking deployment/banking-mcp-server -- curl -s http://localhost:8080/.well-known/mcp-server

# Agent service health
kubectl exec -n super-banking deployment/banking-agent-service -- curl -s http://localhost:8080/health
```

## Configuration

### Environment Variables
Key configuration in `k8s/02-configmap.yaml`:
- Frontend URLs and API endpoints
- Service ports and hosts
- Feature flags
- Banking configuration

### Secrets
Sensitive data in `k8s/03-secrets.yaml`:
- PingOne credentials
- Database passwords
- JWT secrets
- API keys

### Resource Limits
Each deployment includes resource limits:
- Frontend: 128-256Mi memory, 100-200m CPU
- API Server: 256-512Mi memory, 200-500m CPU
- MCP Server: 256-512Mi memory, 200-500m CPU
- Agent Service: 512Mi-2Gi memory, 300-1000m CPU
- Redis: 128-512Mi memory, 100-300m CPU

## Scaling

### Horizontal Pod Autoscaling
API Server has HPA configured:
```bash
kubectl get hpa -n super-banking
```

Manual scaling:
```bash
kubectl scale deployment banking-api-server --replicas=3 -n super-banking
```

### Resource Adjustments
Modify `resources` sections in deployment manifests as needed.

## Monitoring and Logging

### Pod Logs
```bash
# Frontend logs
kubectl logs -n super-banking deployment/banking-frontend -f

# API server logs
kubectl logs -n super-banking deployment/banking-api-server -f

# MCP server logs
kubectl logs -n super-banking deployment/banking-mcp-server -f

# Agent service logs
kubectl logs -n super-banking deployment/banking-agent-service -f

# Redis logs
kubectl logs -n super-banking statefulset/redis -f
```

### Health Checks
All services include liveness and readiness probes. Check status:
```bash
kubectl describe pod -n super-banking -l component=api-server
```

## Troubleshooting

### Common Issues

#### Pod Not Starting
```bash
kubectl describe pod -n super-banking <pod-name>
kubectl logs -n super-banking <pod-name>
```

#### Service Not Accessible
```bash
kubectl get endpoints -n super-banking
kubectl describe service -n super-banking <service-name>
```

#### Ingress Not Working
```bash
kubectl describe ingress -n super-banking
kubectl logs -n ingress-nginx-controller ingress-nginx-controller
```

#### Redis Connection Issues
```bash
kubectl exec -n super-banking deployment/banking-api-server -- ping redis-service
kubectl exec -n super-banking deployment/banking-api-server -- telnet redis-service 6379
```

### Debug Commands
```bash
# Port forward to local
kubectl port-forward -n super-banking service/banking-frontend 3000:3000
kubectl port-forward -n super-banking service/banking-api-server 3001:3001

# Exec into pod
kubectl exec -it -n super-banking deployment/banking-api-server -- /bin/sh

# Check events
kubectl get events -n super-banking --sort-by='.lastTimestamp'
```

## Maintenance

### Updates
Update images and apply manifests:
```bash
# Build new images
docker build -t banking-api-ui:v2.0.0 .

# Update deployment
kubectl set image deployment/banking-frontend frontend=banking-api-ui:v2.0.0 -n super-banking

# Check rollout status
kubectl rollout status deployment/banking-frontend -n super-banking
```

### Rollbacks
```bash
kubectl rollout undo deployment/banking-frontend -n super-banking
```

### Backup Redis
```bash
kubectl exec -n super-banking redis-0 -- redis-cli BGSAVE
kubectl cp super-banking/redis-0:/data/dump.rdb ./redis-backup.rdb
```

## Security

### Network Policies
Namespace includes network policy restricting traffic to same namespace and ingress controller.

### Pod Security
All pods run as non-root users with proper security contexts.

### Secrets Management
Use Kubernetes secrets for sensitive data. Never commit actual secrets to version control.

## Cleanup

Remove all resources:
```bash
kubectl delete namespace super-banking
```

Or remove individual components:
```bash
kubectl delete -f k8s/10-frontend-deployment.yaml
kubectl delete -f k8s/20-api-server-deployment.yaml
kubectl delete -f k8s/30-mcp-server-deployment.yaml
kubectl delete -f k8s/40-agent-service-deployment.yaml
kubectl delete -f k8s/50-redis-deployment.yaml
kubectl delete -f k8s/02-configmap.yaml
kubectl delete -f k8s/01-namespace.yaml
```

## Production Considerations

### High Availability
- Use multiple replicas for stateless services
- Configure Redis clustering for HA
- Use persistent storage with backup strategy

### Performance
- Enable resource monitoring
- Configure appropriate resource limits
- Use CDN for static assets

### Security
- Enable RBAC
- Use network policies
- Regular security updates
- Audit logging

### Monitoring
- Deploy Prometheus + Grafana
- Configure alerting
- Log aggregation with ELK stack

## Support

For issues with the Super Banking Kubernetes deployment:

1. Check this guide for common solutions
2. Review pod logs and events
3. Verify configuration in ConfigMaps and Secrets
4. Ensure all prerequisites are met

The deployment is designed to be production-ready with proper resource management, health checks, and security configurations.
