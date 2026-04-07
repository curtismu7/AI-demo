# Banking Demo Documentation

> Comprehensive documentation for the Banking Demo platform with PingOne authentication and RFC 8693 token exchange.

## Quick Start

- **[Quick Start Guide](SETUP.md)** - 5-minute setup guide
- **[Prerequisites](SETUP.md#prerequisites)** - Required tools and accounts
- **[Architecture Overview](ARCHITECTURE_WALKTHROUGH.md)** - System architecture and components

## API Documentation

### Core APIs
- **[OAuth 2.0 API](oauth-api-documentation.md)** - Authentication and authorization endpoints
- **[Banking API](banking-api-documentation.md)** - Core banking operations and data
- **[Token Exchange API](rfc8693-delegation-api-documentation.md)** - RFC 8693 token exchange implementation
- **[MCP Server API](mcp-server-api-documentation.md)** - MCP tool endpoints for AI agents

### Reference Documentation
- **[OAuth Scope Definitions](oauth-scope-definitions.md)** - Complete scope reference
- **[Client Credentials Guide](oauth-client-credentials-guide.md)** - Service-to-service authentication
- **[PAT to OAuth Migration Guide](pat-to-oauth-migration-guide.md)** - Migration from PAT to OAuth

### API Specifications
- **[OpenAPI Specification](openapi.yaml)** - Machine-readable API specification
- **[Postman Collections](POSTMAN_COLLECTIONS_GUIDE.md)** - Pre-configured API collections
- **[Error Codes Reference](error-codes-reference.md)** - Complete error code documentation

## Integration Guides

### Agent Integration
- **[Agent Integration Documentation](AGENT_INTEGRATION_DOCUMENTATION.md)** - AI agent setup and integration
- **[MCP Server Education](MCP_SERVER_EDUCATION.md)** - MCP server configuration and usage
- **[LangChain Agent Integration](langchain-agent-integration.md)** - LangChain agent setup

### Application Integration
- **[Web Application Integration](web-app-integration.md)** - Frontend integration guide
- **[Mobile App Integration](mobile-app-integration.md)** - iOS/Android integration
- **[Third-party Integrations](third-party-integrations.md)** - External service integrations

### Token Exchange Integration
- **[PingOne Token Exchange Setup](PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md)** - Single exchange flow
- **[PingOne Two-Exchange Setup](PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md)** - Two-exchange flow
- **[Token Exchange Comparison](PINGONE_TOKEN_EXCHANGE_COMPARISON.md)** - Flow comparison and selection

## Operations

### Deployment
- **[Deployment Guide](deployment-guide.md)** - Production deployment procedures
- **[Vercel Setup](VERCEL_SETUP.md)** - Vercel platform deployment
- **[Docker Deployment](docker-deployment.md)** - Container-based deployment
- **[Environment Configuration](environment-configuration.md)** - Complete configuration reference

### Monitoring and Observability
- **[Monitoring Guide](monitoring-guide.md)** - System monitoring and alerting
- **[Logging Configuration](logging-configuration.md)** - Structured logging setup
- **[Health Check Endpoints](health-checks.md)** - Health check implementation
- **[Performance Monitoring](performance-monitoring.md)** - Performance metrics and tuning

### Operations Procedures
- **[Troubleshooting Guide](troubleshooting-guide.md)** - Common issues and solutions
- **[Security Operations](security-operations.md)** - Security monitoring and incident response
- **[Backup and Recovery](backup-recovery.md)** - Data backup and disaster recovery
- **[Maintenance Procedures](maintenance-procedures.md)** - System maintenance tasks

### Runbooks
- **[System Startup Runbook](runbooks/system-startup.md)** - System startup procedures
- **[Emergency Response Runbook](runbooks/emergency-response.md)** - Emergency procedures
- **[Scaling Runbook](runbooks/scaling.md)** - System scaling procedures
- **[Migration Runbook](runbooks/migration.md)** - Data migration procedures

## Reference

### Standards and Compliance
- **[RFC Standards Compliance](RFC-STANDARDS.md)** - Implemented RFC standards and compliance
- **[MCP Spec Compliance](MCP_ERROR_CODE_COMPLIANCE_AUDIT.md)** - MCP specification compliance
- **[RFC 9728 Compliance](RFC9728_COMPLIANCE_AUDIT_REPORT.md)** - Protected Resource Metadata compliance
- **[RFC 8707 Resource Indicators](RFC8707_RESOURCE_INDICATORS.md)** - Resource indicator implementation

### Architecture and Design
- **[Architecture Walkthrough](ARCHITECTURE_WALKTHROUGH.md)** - System architecture overview
- **[Feature Documentation](FEATURES.md)** - Complete feature matrix and descriptions
- **[Quality Criteria](ui-quality-criteria.md)** - UI/UX quality standards
- **[Design Patterns](design-patterns.md)** - Architectural design patterns

### Configuration Reference
- **[PingOne App Configuration](PINGONE_APP_CONFIG.md)** - PingOne application setup
- **[PingOne App Organization](pingone-app-organization.md)** - Application organization structure
- **[PingOne Management API Setup](pingone-management-api-setup.md)** - Management API configuration
- **[Environment Variables Reference](environment-variables-reference.md)** - Complete environment variable reference

### Security Documentation
- **[MFA Setup Guide](MFA_SETUP_GUIDE.md)** - Multi-factor authentication setup
- **[MFA Approach Analysis](MFA_APPROACH_ANALYSIS_AND_RECOMMENDATIONS.md)** - MFA implementation analysis
- **[AI Tokens Education](AI_TOKENS_EDUCATION.md)** - Actor tokens, subject tokens, and AI-related tokens guide
- **[Security Best Practices](security-best-practices.md)** - Security recommendations and guidelines
- **[Token Security](token-security.md)** - Token security best practices

## Developer Resources

### SDK Documentation
- **[JavaScript/TypeScript SDK](javascript-sdk-documentation.md)** - Node.js and browser SDK
- **[Python SDK](python-sdk-documentation.md)** - Python SDK guide
- **[Go SDK](go-sdk-documentation.md)** - Go SDK guide
- **[Java SDK](java-sdk-documentation.md)** - Java SDK guide

### Testing
- **[Testing Guide](testing-guide.md)** - Unit and integration testing
- **[API Testing](api-testing.md)** - API testing procedures
- **[Load Testing](load-testing.md)** - Performance and load testing
- **[Security Testing](security-testing.md)** - Security testing procedures

### Examples and Samples
- **[Code Examples](code-examples.md)** - Practical code examples
- **[Integration Samples](integration-samples.md)** - Integration code samples
- **[Use Case Examples](use-case-examples.md)** - Real-world use cases
- **[Best Practices](best-practices.md)** - Development best practices

## Diagrams and Visualizations

### Architecture Diagrams
- **[System Architecture Overview](diagrams/architecture-overview.drawio)** - High-level architecture
- **[Authentication Flow](diagrams/auth-flow.drawio)** - OAuth authentication flow
- **[Token Exchange Flow](diagrams/token-exchange-flow.drawio)** - Token exchange process
- **[MCP Integration](diagrams/mcp-integration.drawio)** - MCP server integration

### Process Diagrams
- **[User Consent Flow](diagrams/user-consent-flow.drawio)** - User consent process
- **[MFA Device Authentication](diagrams/mfa-device-auth.drawio)** - MFA authentication flow
- **[Agent Request Flow](diagrams/agent-request-flow.drawio)** - AI agent request process
- **[Banking Operations Flow](diagrams/banking-operations-flow.drawio)** - Banking transaction flow

## Community and Support

### Getting Help
- **[FAQ](faq.md)** - Frequently asked questions
- **[Support Channels](support-channels.md)** - How to get help
- **[Community Forums](community-forums.md)** - Community discussion forums
- **[Issue Reporting](issue-reporting.md)** - Bug reporting and feature requests

### Contributing
- **[Contributing Guide](contributing-guide.md)** - How to contribute
- **[Code of Conduct](code-of-conduct.md)** - Community guidelines
- **[Development Setup](development-setup.md)** - Development environment setup
- **[Release Process](release-process.md)** - Release procedures

## Documentation Versions

### Current Version (v1.0)
- Latest documentation for current release
- Updated for latest features and API changes
- Complete coverage of all platform capabilities

### Previous Versions
- **[v0.9 Documentation](v0.9/)** - Previous release documentation
- **[v0.8 Documentation](v0.8/)** - Earlier release documentation
- **[Migration Guides](migration-guides.md)** - Version migration procedures

## Quick Reference

### Common Tasks
- **[Quick Authentication Setup](quick-auth-setup.md)** - Fast authentication setup
- **[Quick API Integration](quick-api-integration.md)** - Rapid API integration
- **[Quick Deployment](quick-deployment.md)** - Fast deployment procedures
- **[Quick Troubleshooting](quick-troubleshooting.md)** - Common issue resolution

### Cheat Sheets
- **[API Endpoints Cheat Sheet](api-endpoints-cheat-sheet.md)** - Quick API reference
- **[Configuration Cheat Sheet](configuration-cheat-sheet.md)** - Quick configuration guide
- **[Commands Cheat Sheet](commands-cheat-sheet.md)** - Common commands reference
- **[Error Codes Cheat Sheet](error-codes-cheat-sheet.md)** - Quick error reference

---

## Documentation Feedback

We welcome feedback on our documentation! Please help us improve by:

- **Reporting Issues**: Found incorrect information? [Create an issue](https://github.com/your-org/banking-demo/issues)
- **Suggesting Improvements**: Have ideas for better docs? [Start a discussion](https://github.com/your-org/banking-demo/discussions)
- **Contributing**: Want to help write docs? See our [Contributing Guide](contributing-guide.md)

### Documentation Quality

This documentation aims to be:
- **Comprehensive**: Cover all aspects of the platform
- **Accurate**: Keep information up-to-date and correct
- **Accessible**: Easy to understand for all skill levels
- **Actionable**: Provide clear steps and examples
- **Maintainable**: Easy to update and extend

---

*Last updated: April 7, 2026*  
*Documentation version: 1.0*  
*Platform version: 1.0*
