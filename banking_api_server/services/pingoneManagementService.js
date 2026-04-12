/**
 * PingOne Management API Service
 * 
 * Provides automated resource server and scope setup via PingOne Management API
 * for streamlined configuration and deployment automation.
 */

'use strict';

const axios = require('axios');

class PingOneManagementService {
  constructor() {
    this.baseURL = null;
    this.token = null;
    this.environmentId = null;
    this.region = null;
    this.initialized = false;
  }

  /**
   * Initialize the Management API service
   * @param {string} [token] - Optional token to use (if not provided, uses PINGONE_MANAGEMENT_API_TOKEN env var)
   */
  initialize(token = null) {
    this.token = token || process.env.PINGONE_MANAGEMENT_API_TOKEN;
    this.environmentId = process.env.PINGONE_ENVIRONMENT_ID;
    this.region = process.env.PINGONE_REGION || 'com';

    if (!this.token) {
      throw new Error('PINGONE_MANAGEMENT_API_TOKEN is required for Management API operations');
    }

    if (!this.environmentId) {
      throw new Error('PINGONE_ENVIRONMENT_ID is required for Management API operations');
    }

    this.baseURL = `https://api.pingone.${this.region}/v1/environments/${this.environmentId}`;
    this.initialized = true;
  }

  /**
   * Create HTTP headers for Management API requests
   */
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Create a resource server
   */
  async createResourceServer(name, description, audienceUri) {
    this.ensureInitialized();

    const payload = {
      name,
      description,
      audience: [audienceUri],
      type: 'urn:pingone:resource-server'
    };

    try {
      const response = await axios.post(
        `${this.baseURL}/resources`,
        payload,
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        resourceServer: response.data,
        id: response.data.id
      };
    } catch (error) {
      return this.handleError(error, 'createResourceServer');
    }
  }

  /**
   * Get all resource servers
   */
  async getResourceServers() {
    this.ensureInitialized();

    try {
      const response = await axios.get(
        `${this.baseURL}/resources`,
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        resourceServers: response.data._embedded?.resources || response.data._embedded?.resourceServers || []
      };
    } catch (error) {
      return this.handleError(error, 'getResourceServers');
    }
  }

  /**
   * Create scopes for a resource server
   */
  async createScopes(resourceServerId, scopes) {
    this.ensureInitialized();

    const results = [];

    for (const scope of scopes) {
      try {
        const payload = {
          name: scope.name,
          description: scope.description,
          schema: scope.schema || 'urn:pingone:common:scope'
        };

        const response = await axios.post(
          `${this.baseURL}/resources/${resourceServerId}/scopes`,
          payload,
          { headers: this.getHeaders() }
        );

        results.push({
          success: true,
          scope: response.data,
          name: scope.name
        });
      } catch (error) {
        results.push({
          success: false,
          error: this.formatError(error),
          name: scope.name
        });
      }
    }

    return {
      success: results.every(r => r.success),
      results,
      created: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    };
  }

  /**
   * Get scopes for a resource server
   */
  async getScopes(resourceServerId) {
    this.ensureInitialized();

    try {
      const response = await axios.get(
        `${this.baseURL}/resources/${resourceServerId}/scopes`,
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        scopes: response.data._embedded?.scopes || []
      };
    } catch (error) {
      return this.handleError(error, 'getScopes');
    }
  }

  /**
   * Create an application
   */
  async createApplication(name, description, type, grantTypes, redirectUris = []) {
    this.ensureInitialized();

    const payload = {
      name,
      description,
      type,
      grantTypes,
      redirectUris,
      tokenEndpointAuthMethod: type === 'worker' ? 'client_secret_basic' : 'client_secret_post'
    };

    try {
      const response = await axios.post(
        `${this.baseURL}/applications`,
        payload,
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        application: response.data,
        id: response.data.id,
        clientId: response.data.clientId
      };
    } catch (error) {
      return this.handleError(error, 'createApplication');
    }
  }

  /**
   * Enable grant types for an application
   */
  async enableGrantTypes(applicationId, grantTypes) {
    this.ensureInitialized();

    try {
      const response = await axios.patch(
        `${this.baseURL}/applications/${applicationId}`,
        { grantTypes },
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        application: response.data
      };
    } catch (error) {
      return this.handleError(error, 'enableGrantTypes');
    }
  }

  /**
   * Enable resource server for an application
   */
  async enableResourceServer(applicationId, resourceServerId, scopes) {
    this.ensureInitialized();

    try {
      const payload = {
        resourceId: resourceServerId,
        scopes
      };

      const response = await axios.post(
        `${this.baseURL}/applications/${applicationId}/resources`,
        payload,
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        resourceServer: response.data
      };
    } catch (error) {
      return this.handleError(error, 'enableResourceServer');
    }
  }

  /**
   * Get all applications
   */
  async getApplications() {
    this.ensureInitialized();

    try {
      const response = await axios.get(
        `${this.baseURL}/applications`,
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        applications: response.data._embedded.applications || response.data
      };
    } catch (error) {
      return this.handleError(error, 'getApplications');
    }
  }

  /**
   * Setup complete resource server with scopes and applications
   */
  async setupCompleteResourceServer(config) {
    const {
      name,
      description,
      audienceUri,
      scopes,
      applications = []
    } = config;

    const results = {
      resourceServer: null,
      scopes: [],
      applications: [],
      errors: []
    };

    try {
      // Step 1: Create resource server
      const rsResult = await this.createResourceServer(name, description, audienceUri);
      if (!rsResult.success) {
        results.errors.push(rsResult.error);
        return results;
      }
      results.resourceServer = rsResult.resourceServer;

      // Step 2: Create scopes
      const scopesResult = await this.createScopes(rsResult.id, scopes);
      results.scopes = scopesResult.results;
      if (scopesResult.failed > 0) {
        results.errors.push(`Failed to create ${scopesResult.failed} scopes`);
      }

      // Step 3: Setup applications (if provided)
      for (const appConfig of applications) {
        const appResult = await this.setupApplication(rsResult.id, scopes, appConfig);
        results.applications.push(appResult);
        if (!appResult.success) {
          results.errors.push(`Failed to setup application: ${appConfig.name}`);
        }
      }

      return {
        success: results.errors.length === 0,
        ...results
      };
    } catch (error) {
      results.errors.push(this.formatError(error));
      return results;
    }
  }

  /**
   * Setup an application with resource server and scopes
   */
  async setupApplication(resourceServerId, scopes, config) {
    const {
      name,
      description,
      type,
      grantTypes,
      redirectUris = []
    } = config;

    try {
      // Step 1: Create application
      const appResult = await this.createApplication(name, description, type, grantTypes, redirectUris);
      if (!appResult.success) {
        return appResult;
      }

      // Step 2: Enable grant types (if different from default)
      if (grantTypes && grantTypes.length > 0) {
        await this.enableGrantTypes(appResult.id, grantTypes);
      }

      // Step 3: Enable resource server
      const scopeNames = scopes.map(s => s.name);
      const rsResult = await this.enableResourceServer(appResult.id, resourceServerId, scopeNames);
      if (!rsResult.success) {
        return rsResult;
      }

      return {
        success: true,
        application: appResult.application,
        resourceServer: rsResult.resourceServer
      };
    } catch (error) {
      return this.handleError(error, 'setupApplication');
    }
  }

  /**
   * Validate Management API connection
   */
  async validateConnection() {
    this.ensureInitialized();

    try {
      const response = await axios.get(
        `${this.baseURL}`,
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        environment: response.data,
        message: 'Management API connection successful'
      };
    } catch (error) {
      return this.handleError(error, 'validateConnection');
    }
  }

  /**
   * Get predefined configurations for common setups
   */
  getPredefinedConfigurations() {
    return {
      mcpServer: {
        name: 'Super Banking AI Agent Service',
        description: 'Resource server for MCP AI agent access with banking capabilities',
        audienceUri: 'https://ai-agent.pingdemo.com',
        scopes: [
          {
            name: 'banking:agent:invoke',
            description: 'Allow AI agent to invoke banking operations'
          },
          {
            name: 'banking:read',
            description: 'Read access to banking data'
          },
          {
            name: 'banking:write',
            description: 'Write access to banking operations'
          }
        ],
        applications: [
          {
            name: 'BX Finance AI Agent App',
            description: 'AI agent application for token exchange',
            type: 'worker',
            grantTypes: ['client_credentials'],
            redirectUris: []
          }
        ]
      },
      resourceServerTwoExchange: {
        name: 'Super Banking AI Agent Service',
        description: 'Resource server for 2-exchange delegation with agent capabilities',
        audienceUri: 'https://resource-server.pingdemo.com',
        scopes: [
          {
            name: 'banking:agent:invoke',
            description: 'Agent invocation scope for banking operations'
          },
          {
            name: 'agent:invoke',
            description: 'Generic agent invocation scope'
          }
        ],
        applications: [
          {
            name: 'BX Finance AI Agent App',
            description: 'Agent application for 2-exchange token delegation',
            type: 'worker',
            grantTypes: ['client_credentials'],
            redirectUris: []
          }
        ]
      }
    };
  }

  /**
   * Ensure service is initialized
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('PingOneManagementService must be initialized before use');
    }
  }

  /**
   * Handle API errors consistently
   */
  handleError(error, operation) {
    const message = error.response?.data?.details?.[0]?.message || 
                    error.response?.data?.message || 
                    error.message || 
                    'Unknown error';

    return {
      success: false,
      error: message,
      operation,
      status: error.response?.status,
      details: error.response?.data
    };
  }

  /**
   * Format error for logging
   */
  formatError(error) {
    return error.response?.data?.details?.[0]?.message || 
           error.response?.data?.message || 
           error.message || 
           'Unknown error';
  }
}

// Singleton instance
const managementService = new PingOneManagementService();

module.exports = {
  PingOneManagementService,
  managementService
};
