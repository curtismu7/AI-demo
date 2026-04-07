/**
 * PingOne Provisioning Service
 * 
 * Automated setup service for creating PingOne resources via Management API.
 * Creates apps, resource servers, scopes, and demo users with SSE streaming progress.
 */

'use strict';

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class PingOneProvisionService {
  constructor() {
    this.baseURL = null;
    this.workerToken = null;
    this.envId = null;
    this.region = null;
    this.populationId = null;
  }

  /**
   * Get worker token using client credentials flow
   */
  async getWorkerToken(envId, clientId, clientSecret, region = 'com') {
    try {
      const response = await axios.post(
        `https://auth.pingone.${region}/${envId}/as/token`,
        'grant_type=client_credentials',
        {
          auth: { username: clientId, password: clientSecret },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000
        }
      );
      return response.data.access_token;
    } catch (error) {
      throw new Error(`Failed to get worker token: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Initialize the service with worker credentials
   */
  async initialize(envId, workerClientId, workerClientSecret, region = 'com') {
    this.envId = envId;
    this.region = region;
    this.baseURL = `https://api.pingone.${region}/${envId}`;
    this.workerToken = await this.getWorkerToken(envId, workerClientId, workerClientSecret, region);
    
    // Get default population ID for user creation
    await this.getPopulationId();
  }

  /**
   * Get default population ID
   */
  async getPopulationId() {
    try {
      const response = await this.makeRequest('GET', '/populations');
      const populations = response.data._embedded?.populations || [];
      const defaultPop = populations.find(pop => pop.default) || populations[0];
      
      if (!defaultPop) {
        throw new Error('No population found in environment');
      }
      
      this.populationId = defaultPop.id;
      return this.populationId;
    } catch (error) {
      throw new Error(`Failed to get population ID: ${error.message}`);
    }
  }

  /**
   * Make authenticated request to PingOne Management API
   */
  async makeRequest(method, endpoint, data = null, customHeaders = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.workerToken}`,
      'Content-Type': 'application/json',
      ...customHeaders
    };

    try {
      const config = { method, url, headers };
      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response;
    } catch (error) {
      const errorMessage = error.response?.data?.details?.[0]?.message || 
                          error.response?.data?.message || 
                          error.message;
      throw new Error(`${method} ${endpoint} failed: ${errorMessage}`);
    }
  }

  /**
   * Check if resource exists by name
   */
  async findResourceByName(type, name) {
    try {
      const endpoint = type === 'application' ? '/applications' : '/resources';
      const response = await this.makeRequest('GET', endpoint);
      
      const resources = response.data._embedded?.[type === 'application' ? 'applications' : 'resources'] || [];
      return resources.find(resource => resource.name === name);
    } catch (error) {
      return null; // Resource doesn't exist or access denied
    }
  }

  /**
   * Create resource server
   */
  async createResourceServer(name, description, audience) {
    const existing = await this.findResourceByName('resource', name);
    if (existing) {
      return { 
        exists: true, 
        resource: existing,
        resourceKey: `resource:${existing.id}`
      };
    }

    const data = {
      name,
      description,
      type: 'urn:pingone:resource-server',
      audience: [audience]
    };

    const response = await this.makeRequest('POST', '/resources', data);
    return { 
      exists: false, 
      resource: response.data,
      resourceKey: `resource:${response.data.id}`
    };
  }

  /**
   * Create scopes on resource server
   */
  async createScopes(resourceId, scopes) {
    const results = [];
    
    for (const scope of scopes) {
      try {
        const data = {
          name: scope.name,
          description: scope.description,
          schema: 'urn:pingone:common:scope'
        };

        const response = await this.makeRequest('POST', `/resources/${resourceId}/scopes`, data);
        results.push({ 
          success: true, 
          scope: response.data,
          name: scope.name 
        });
      } catch (error) {
        results.push({ 
          success: false, 
          error: error.message,
          name: scope.name 
        });
      }
    }

    return results;
  }

  /**
   * Create OIDC application
   */
  async createApplication(name, description, type, grantTypes) {
    const existing = await this.findResourceByName('application', name);
    if (existing) {
      return { 
        exists: true, 
        application: existing,
        resourceKey: `application:${existing.id}`
      };
    }

    const data = {
      name,
      description,
      type,
      grantTypes,
      tokenEndpointAuthMethod: 'client_secret_post',
      pkceMethod: 'S256',
      refreshToken: {
        rotating: true,
        reuseTokens: false
      }
    };

    const response = await this.makeRequest('POST', '/applications', data);
    return { 
      exists: false, 
      application: response.data,
      resourceKey: `application:${response.data.id}`
    };
  }

  /**
   * Update application redirect URIs and PKCE settings
   */
  async updateApplication(appId, updates) {
    const response = await this.makeRequest('PUT', `/applications/${appId}`, updates);
    return response.data;
  }

  /**
   * Grant scopes to application
   */
  async grantScopesToApplication(appId, resourceId, scopes) {
    try {
      const data = {
        resourceId,
        scopes
      };

      const response = await this.makeRequest('POST', `/applications/${appId}/grants`, data);
      return { success: true, grant: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create user
   */
  async createUser(username, firstName, lastName, email) {
    const existing = await this.findUserByUsername(username);
    if (existing) {
      return { 
        exists: true, 
        user: existing,
        resourceKey: `user:${existing.id}`
      };
    }

    const data = {
      username,
      name: {
        given: firstName,
        family: lastName
      },
      email,
      enabled: true,
      population: { id: this.populationId }
    };

    const response = await this.makeRequest('POST', '/users', data);
    return { 
      exists: false, 
      user: response.data,
      resourceKey: `user:${response.data.id}`
    };
  }

  /**
   * Find user by username
   */
  async findUserByUsername(username) {
    try {
      const response = await this.makeRequest('GET', `/users?filter=username eq "${username}"`);
      const users = response.data._embedded?.users || [];
      return users[0] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Set user password
   */
  async setUserPassword(userId, password) {
    const data = {
      currentPassword: null,
      newPassword: password
    };

    const response = await this.makeRequest(
      'PUT', 
      `/users/${userId}/password`, 
      data,
      { 'Content-Type': 'application/vnd.pingidentity.password.set+json' }
    );
    
    return response.data;
  }

  /**
   * Write .env file
   */
  async writeEnvFile(config, provisioned) {
    const envContent = this.generateEnvContent(config, provisioned);
    const envPath = path.join(process.cwd(), '.env');
    
    await fs.writeFile(envPath, envContent, 'utf8');
    return envPath;
  }

  /**
   * Set Vercel environment variables
   */
  async setVercelEnvVars(config, provisioned) {
    if (!config.vercelToken || !config.vercelProjectId) {
      throw new Error('Vercel token and project ID required for Vercel deployment');
    }

    const envVars = this.generateVercelEnvVars(config, provisioned);
    const results = [];

    for (const [key, value] of Object.entries(envVars)) {
      try {
        await axios.post(
          `https://api.vercel.com/v9/projects/${config.vercelProjectId}/env`,
          {
            key,
            value,
            type: 'plain',
            target: ['production', 'preview', 'development']
          },
          {
            headers: {
              'Authorization': `Bearer ${config.vercelToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        results.push({ key, success: true });
      } catch (error) {
        results.push({ key, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Generate .env file content
   */
  generateEnvContent(config, provisioned) {
    const lines = [
      '# PingOne Configuration - Generated by Setup Wizard',
      `PINGONE_ENVIRONMENT_ID=${config.envId}`,
      `PINGONE_REGION=${config.region}`,
      '',
      '# Admin Application',
      `PINGONE_ADMIN_CLIENT_ID=${provisioned.adminApp.clientId}`,
      `PINGONE_ADMIN_CLIENT_SECRET=${provisioned.adminApp.clientSecret || '<set-in-pingone-console>'}`,
      `PINGONE_ADMIN_REDIRECT_URI=${config.publicAppUrl}/api/auth/oauth/callback`,
      '',
      '# User Application',
      `PINGONE_CORE_CLIENT_ID=${provisioned.userApp.clientId}`,
      `PINGONE_CORE_CLIENT_SECRET=${provisioned.userApp.clientSecret || '<set-in-pingone-console>'}`,
      `PINGONE_CORE_REDIRECT_URI=${config.publicAppUrl}/api/auth/oauth/callback`,
      '',
      '# Resource Server',
      `ENDUSER_AUDIENCE=${provisioned.resourceServer.audience[0]}`,
      '',
      '# MCP Resource Server',
      `MCP_RESOURCE_URI=${provisioned.mcpResourceServer?.audience?.[0] || 'https://mcp-server.pingdemo.com'}`,
      '',
      '# Admin Token Exchange',
      `ff_admin_token_exchange=true`,
      `ADMIN_TOKEN_LIFETIME=7200`,
      `ADMIN_REFRESH_TOKEN_LIFETIME=86400`,
      '',
      '# Demo Users',
      `DEMO_USER_USERNAME=bankuser`,
      `DEMO_USER_PASSWORD=${provisioned.bankUser.password}`,
      `DEMO_ADMIN_USERNAME=bankadmin`,
      `DEMO_ADMIN_PASSWORD=${provisioned.bankAdmin.password}`,
      '',
      '# Worker Credentials (for future management)',
      `PINGONE_WORKER_CLIENT_ID=${config.workerClientId}`,
      `PINGONE_WORKER_CLIENT_SECRET=${config.workerClientSecret}`,
    ];

    return lines.join('\n');
  }

  /**
   * Generate Vercel environment variables
   */
  generateVercelEnvVars(config, provisioned) {
    return {
      PINGONE_ENVIRONMENT_ID: config.envId,
      PINGONE_REGION: config.region,
      PINGONE_ADMIN_CLIENT_ID: provisioned.adminApp.clientId,
      PINGONE_ADMIN_CLIENT_SECRET: provisioned.adminApp.clientSecret || '<set-in-pingone-console>',
      PINGONE_ADMIN_REDIRECT_URI: `${config.publicAppUrl}/api/auth/oauth/callback`,
      PINGONE_CORE_CLIENT_ID: provisioned.userApp.clientId,
      PINGONE_CORE_CLIENT_SECRET: provisioned.userApp.clientSecret || '<set-in-pingone-console>',
      PINGONE_CORE_REDIRECT_URI: `${config.publicAppUrl}/api/auth/oauth/callback`,
      ENDUSER_AUDIENCE: provisioned.resourceServer.audience[0],
      MCP_RESOURCE_URI: provisioned.mcpResourceServer?.audience?.[0] || 'https://mcp-server.pingdemo.com',
      ff_admin_token_exchange: 'true',
      ADMIN_TOKEN_LIFETIME: '7200',
      ADMIN_REFRESH_TOKEN_LIFETIME: '86400',
      PINGONE_WORKER_CLIENT_ID: config.workerClientId,
      PINGONE_WORKER_CLIENT_SECRET: config.workerClientSecret,
    };
  }

  /**
   * Main provisioning function
   */
  async provisionEnvironment(config, onStep) {
    const steps = [];
    const provisioned = {};

    try {
      // Step 1: Initialize and validate worker credentials
      steps.push({ step: 'validate', icon: '🔐', message: 'Validating worker credentials...' });
      onStep(steps[steps.length - 1]);
      
      await this.initialize(config.envId, config.workerClientId, config.workerClientSecret, config.region);
      
      steps.push({ step: 'validate', icon: '✅', message: 'Worker credentials validated' });
      onStep(steps[steps.length - 1]);

      // Step 2: Get population ID (done in initialize)
      steps.push({ step: 'population', icon: '👥', message: `Using population: ${this.populationId}` });
      onStep(steps[steps.length - 1]);

      // Step 3: Create Resource Server
      steps.push({ step: 'resource-server', icon: '🏗️', message: 'Creating resource server...' });
      onStep(steps[steps.length - 1]);
      
      const resourceResult = await this.createResourceServer(
        'Super Banking API',
        'Banking API resource server for user and admin applications',
        config.audience || 'banking_api_enduser'
      );
      
      if (resourceResult.exists) {
        steps.push({ 
          step: 'resource-server', 
          icon: '⚠️', 
          message: 'Resource server already exists',
          resourceKey: resourceResult.resourceKey
        });
      } else {
        steps.push({ step: 'resource-server', icon: '✅', message: 'Resource server created' });
      }
      onStep(steps[steps.length - 1]);
      provisioned.resourceServer = resourceResult.resource;

      // Step 4.5: Create MCP Resource Server for Admin Operations
      steps.push({ step: 'mcp-resource-server', icon: '🔧', message: 'Creating MCP resource server for admin operations...' });
      onStep(steps[steps.length - 1]);
      
      const mcpResourceResult = await this.createResourceServer(
        'Super Banking MCP Server',
        'https://mcp-server.pingdemo.com',
        'MCP server for admin tool execution and privileged operations'
      );
      
      if (mcpResourceResult.exists) {
        steps.push({ 
          step: 'mcp-resource-server', 
          icon: '⚠️', 
          message: 'MCP resource server already exists',
          resourceKey: mcpResourceResult.resourceKey
        });
      } else {
        steps.push({ step: 'mcp-resource-server', icon: '✅', message: 'MCP resource server created' });
      }
      onStep(steps[steps.length - 1]);
      provisioned.mcpResourceServer = mcpResourceResult.resource;

      // Step 4.6: Create MCP-specific scopes
      steps.push({ step: 'mcp-scopes', icon: '🎯', message: 'Creating MCP-specific scopes...' });
      onStep(steps[steps.length - 1]);
      
      const mcpScopes = [
        { name: 'admin:read', description: 'Read administrative data and system status' },
        { name: 'admin:write', description: 'Modify administrative settings and configurations' },
        { name: 'admin:delete', description: 'Delete users and administrative resources' },
        { name: 'users:read', description: 'Read user profiles and account information' },
        { name: 'users:manage', description: 'Manage user accounts and permissions' },
        { name: 'banking:read', description: 'Read banking data and transaction history' },
        { name: 'banking:write', description: 'Perform banking operations and transfers' }
      ];
      
      const mcpScopeResults = await this.createScopes(mcpResourceResult.resource.id, mcpScopes);
      const createdMcpScopes = mcpScopeResults.filter(r => r.success).length;
      const failedMcpScopes = mcpScopeResults.filter(r => !r.success).length;
      
      if (failedMcpScopes > 0) {
        steps.push({ 
          step: 'mcp-scopes', 
          icon: '⚠️', 
          message: `Created ${createdMcpScopes} MCP scopes, ${failedMcpScopes} failed` 
        });
      } else {
        steps.push({ step: 'mcp-scopes', icon: '✅', message: `Created ${createdMcpScopes} MCP scopes` });
      }
      onStep(steps[steps.length - 1]);

      // Step 5: Create scopes
      steps.push({ step: 'scopes', icon: '🎯', message: 'Creating banking scopes...' });
      onStep(steps[steps.length - 1]);
      
      const scopes = [
        { name: 'banking:read', description: 'Read access to banking data' },
        { name: 'banking:write', description: 'Write access to banking operations' },
        { name: 'banking:accounts:read', description: 'Read account information and balances' },
        { name: 'banking:transactions:read', description: 'Read transaction history and details' },
        { name: 'banking:accounts', description: 'Account access and management' },
        { name: 'banking:admin', description: 'Administrative access' },
        { name: 'banking:agent:invoke', description: 'Agent invocation permission' },
        { name: 'p1:read:user', description: 'Read user profile data' },
        { name: 'p1:update:user', description: 'Update user profile data' },
        { name: 'ai_agent', description: 'AI agent identity' },
        // Admin-specific scopes
        { name: 'admin:read', description: 'Read administrative data and system status' },
        { name: 'admin:write', description: 'Modify administrative settings and configurations' },
        { name: 'admin:delete', description: 'Delete users and administrative resources' },
        { name: 'users:read', description: 'Read user profiles and account information' },
        { name: 'users:manage', description: 'Manage user accounts and permissions' }
      ];
      
      const scopeResults = await this.createScopes(resourceResult.resource.id, scopes);
      const createdScopes = scopeResults.filter(r => r.success).length;
      const failedScopes = scopeResults.filter(r => !r.success).length;
      
      if (failedScopes > 0) {
        steps.push({ 
          step: 'scopes', 
          icon: '⚠️', 
          message: `Created ${createdScopes} scopes, ${failedScopes} failed` 
        });
      } else {
        steps.push({ step: 'scopes', icon: '✅', message: `Created ${createdScopes} scopes` });
      }
      onStep(steps[steps.length - 1]);

      // Step 5: Create Admin Application
      steps.push({ step: 'admin-app', icon: '🔧', message: 'Creating admin application...' });
      onStep(steps[steps.length - 1]);
      
      const adminAppResult = await this.createApplication(
        'Super Banking Admin App',
        'Admin application for Super Banking demo',
        'WEB_APP',
        ['authorization_code', 'refresh_token']
      );
      
      if (adminAppResult.exists) {
        steps.push({ 
          step: 'admin-app', 
          icon: '⚠️', 
          message: 'Admin application already exists',
          resourceKey: adminAppResult.resourceKey
        });
      } else {
        steps.push({ step: 'admin-app', icon: '✅', message: 'Admin application created' });
      }
      onStep(steps[steps.length - 1]);
      provisioned.adminApp = adminAppResult.application;

      // Step 6: Configure Admin Application
      if (!adminAppResult.exists) {
        steps.push({ step: 'admin-config', icon: '⚙️', message: 'Configuring admin application...' });
        onStep(steps[steps.length - 1]);
        
        await this.updateApplication(adminAppResult.application.id, {
          redirectUris: [`${config.publicAppUrl}/api/auth/oauth/callback`],
          pkceMethod: 'S256',
          tokenEndpointAuthMethod: 'client_secret_post',
          grantTypes: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:token-exchange'],
          tokenLifetime: 7200, // 2 hours for admin sessions
          refreshTokenLifetime: 86400 // 24 hours
        });
        
        // Enable token customization for may_act claim
        await this.enableTokenCustomization(adminAppResult.application.id);
        
        // Add may_act claim for token exchange
        await this.addTokenClaim(adminAppResult.application.id, 'may_act', 'JSON', {
          sub: "{{PINGONE_ADMIN_CLIENT_ID}}"
        });
        
        steps.push({ step: 'admin-config', icon: '✅', message: 'Admin application configured with token exchange' });
        onStep(steps[steps.length - 1]);
      }

      // Step 7: Grant scopes to Admin Application
      steps.push({ step: 'admin-grants', icon: '🔑', message: 'Granting scopes to admin application...' });
      onStep(steps[steps.length - 1]);
      
      // Grant scopes from main resource server
      const adminGrantResult = await this.grantScopesToApplication(
        adminAppResult.application.id,
        resourceResult.resource.id,
        scopes.map(s => s.name)
      );
      
      // Grant admin-specific scopes from MCP resource server
      const adminMcpGrantResult = await this.grantScopesToApplication(
        adminAppResult.application.id,
        mcpResourceResult.resource.id,
        mcpScopes.map(s => s.name)
      );
      
      if (adminGrantResult.success && adminMcpGrantResult.success) {
        steps.push({ step: 'admin-grants', icon: '✅', message: 'Admin scopes granted from both resource servers' });
      } else {
        steps.push({ step: 'admin-grants', icon: '⚠️', message: 'Failed to grant some admin scopes' });
      }
      onStep(steps[steps.length - 1]);

      // Step 8: Create User Application
      steps.push({ step: 'user-app', icon: '👤', message: 'Creating user application...' });
      onStep(steps[steps.length - 1]);
      
      const userAppResult = await this.createApplication(
        'Super Banking User App',
        'User application for Super Banking demo',
        'WEB_APP',
        ['authorization_code', 'refresh_token']
      );
      
      if (userAppResult.exists) {
        steps.push({ 
          step: 'user-app', 
          icon: '⚠️', 
          message: 'User application already exists',
          resourceKey: userAppResult.resourceKey
        });
      } else {
        steps.push({ step: 'user-app', icon: '✅', message: 'User application created' });
      }
      onStep(steps[steps.length - 1]);
      provisioned.userApp = userAppResult.application;

      // Step 9: Configure User Application
      if (!userAppResult.exists) {
        steps.push({ step: 'user-config', icon: '⚙️', message: 'Configuring user application...' });
        onStep(steps[steps.length - 1]);
        
        await this.updateApplication(userAppResult.application.id, {
          redirectUris: [`${config.publicAppUrl}/api/auth/oauth/callback`],
          pkceMethod: 'S256',
          tokenEndpointAuthMethod: 'client_secret_post'
        });
        
        steps.push({ step: 'user-config', icon: '✅', message: 'User application configured' });
        onStep(steps[steps.length - 1]);
      }

      // Step 10: Grant scopes to User Application
      steps.push({ step: 'user-grants', icon: '🔑', message: 'Granting scopes to user application...' });
      onStep(steps[steps.length - 1]);
      
      const userGrantResult = await this.grantScopesToApplication(
        userAppResult.application.id,
        resourceResult.resource.id,
        ['banking:agent:invoke', 'banking:read', 'banking:write']
      );
      
      if (userGrantResult.success) {
        steps.push({ step: 'user-grants', icon: '✅', message: 'User scopes granted' });
      } else {
        steps.push({ step: 'user-grants', icon: '⚠️', message: 'Failed to grant user scopes' });
      }
      onStep(steps[steps.length - 1]);

      // Step 11: Create demo user bankuser
      steps.push({ step: 'bankuser', icon: '👨', message: 'Creating demo user: bankuser...' });
      onStep(steps[steps.length - 1]);
      
      const bankUserResult = await this.createUser(
        'bankuser',
        'Demo',
        'User',
        `bankuser@${config.publicAppUrl.replace(/^https?:\/\//, '')}`
      );
      
      if (bankUserResult.exists) {
        steps.push({ 
          step: 'bankuser', 
          icon: '⚠️', 
          message: 'User bankuser already exists',
          resourceKey: bankUserResult.resourceKey
        });
      } else {
        steps.push({ step: 'bankuser', icon: '✅', message: 'User bankuser created' });
      }
      onStep(steps[steps.length - 1]);

      // Step 12: Set bankuser password
      if (!bankUserResult.exists) {
        const bankUserPassword = this.generatePassword();
        steps.push({ step: 'bankuser-password', icon: '🔒', message: 'Setting bankuser password...' });
        onStep(steps[steps.length - 1]);
        
        await this.setUserPassword(bankUserResult.user.id, bankUserPassword);
        provisioned.bankUser = { ...bankUserResult.user, password: bankUserPassword };
        
        steps.push({ step: 'bankuser-password', icon: '✅', message: 'Bankuser password set' });
        onStep(steps[steps.length - 1]);
      } else {
        provisioned.bankUser = { ...bankUserResult.user, password: 'BankUser123!' };
      }

      // Step 13: Create demo user bankadmin
      steps.push({ step: 'bankadmin', icon: '👨‍💼', message: 'Creating demo user: bankadmin...' });
      onStep(steps[steps.length - 1]);
      
      const bankAdminResult = await this.createUser(
        'bankadmin',
        'Demo',
        'Admin',
        `bankadmin@${config.publicAppUrl.replace(/^https?:\/\//, '')}`
      );
      
      if (bankAdminResult.exists) {
        steps.push({ 
          step: 'bankadmin', 
          icon: '⚠️', 
          message: 'User bankadmin already exists',
          resourceKey: bankAdminResult.resourceKey
        });
      } else {
        steps.push({ step: 'bankadmin', icon: '✅', message: 'User bankadmin created' });
      }
      onStep(steps[steps.length - 1]);

      // Step 14: Set bankadmin password
      if (!bankAdminResult.exists) {
        const bankAdminPassword = this.generatePassword();
        steps.push({ step: 'bankadmin-password', icon: '🔒', message: 'Setting bankadmin password...' });
        onStep(steps[steps.length - 1]);
        
        await this.setUserPassword(bankAdminResult.user.id, bankAdminPassword);
        provisioned.bankAdmin = { ...bankAdminResult.user, password: bankAdminPassword };
        
        steps.push({ step: 'bankadmin-password', icon: '✅', message: 'Bankadmin password set' });
        onStep(steps[steps.length - 1]);
      } else {
        provisioned.bankAdmin = { ...bankAdminResult.user, password: 'BankAdmin123!' };
      }

      // Step 15: Create MCP Server Application
      steps.push({ step: 'mcp-app', icon: '🤖', message: 'Creating MCP Server application...' });
      onStep(steps[steps.length - 1]);
      
      const mcpAppResult = await this.createApplication(
        'Super Banking MCP Server',
        'MCP server for client credentials and PingOne API access',
        'WORKER',
        ['client_credentials']
      );
      
      if (mcpAppResult.exists) {
        steps.push({ 
          step: 'mcp-app', 
          icon: '⚠️', 
          message: 'MCP Server application already exists',
          resourceKey: mcpAppResult.resourceKey
        });
      } else {
        steps.push({ step: 'mcp-app', icon: '✅', message: 'MCP Server application created' });
      }
      onStep(steps[steps.length - 1]);
      provisioned.mcpApp = mcpAppResult.application;

      // Step 16: Configure MCP Server Application
      if (!mcpAppResult.exists) {
        steps.push({ step: 'mcp-config', icon: '⚙️', message: 'Configuring MCP Server application...' });
        onStep(steps[steps.length - 1]);
        
        await this.updateApplication(mcpAppResult.application.id, {
          tokenEndpointAuthMethod: 'client_secret_basic'
        });
        
        steps.push({ step: 'mcp-config', icon: '✅', message: 'MCP Server application configured' });
        onStep(steps[steps.length - 1]);
      }

      // Step 17: Grant scopes to MCP Server Application
      steps.push({ step: 'mcp-grants', icon: '🔑', message: 'Granting scopes to MCP Server application...' });
      onStep(steps[steps.length - 1]);
      
      // Grant scopes for client credentials (Step 6 in documentation)
      const mcpAppGrantResult = await this.grantScopesToApplication(
        mcpAppResult.application.id,
        resourceResult.resource.id,
        ['banking:read', 'banking:agent:invoke']
      );
      
      if (mcpAppGrantResult.success) {
        steps.push({ step: 'mcp-grants', icon: '✅', message: 'MCP Server scopes granted' });
      } else {
        steps.push({ step: 'mcp-grants', icon: '⚠️', message: 'Failed to grant MCP Server scopes' });
      }
      onStep(steps[steps.length - 1]);

      // Step 18: Create Worker Application
      steps.push({ step: 'worker-app', icon: '🔧', message: 'Creating Worker application...' });
      onStep(steps[steps.length - 1]);
      
      const workerAppResult = await this.createApplication(
        'Super Banking Worker',
        'Worker application for PingOne Management API operations',
        'WORKER',
        ['client_credentials']
      );
      
      if (workerAppResult.exists) {
        steps.push({ 
          step: 'worker-app', 
          icon: '⚠️', 
          message: 'Worker application already exists',
          resourceKey: workerAppResult.resourceKey
        });
      } else {
        steps.push({ step: 'worker-app', icon: '✅', message: 'Worker application created' });
      }
      onStep(steps[steps.length - 1]);
      provisioned.workerApp = workerAppResult.application;

      // Step 19: Configure Worker Application
      if (!workerAppResult.exists) {
        steps.push({ step: 'worker-config', icon: '⚙️', message: 'Configuring Worker application...' });
        onStep(steps[steps.length - 1]);
        
        await this.updateApplication(workerAppResult.application.id, {
          tokenEndpointAuthMethod: 'client_secret_basic'
        });
        
        steps.push({ step: 'worker-config', icon: '✅', message: 'Worker application configured' });
        onStep(steps[steps.length - 1]);
      }

      // Step 20: Grant scopes to Worker Application
      steps.push({ step: 'worker-grants', icon: '🔑', message: 'Granting scopes to Worker application...' });
      onStep(steps[steps.length - 1]);
      
      // Grant PingOne Management API scopes (Step 6 in documentation)
      const workerAppGrantResult = await this.grantScopesToApplication(
        workerAppResult.application.id,
        resourceResult.resource.id,
        ['p1:read:user', 'p1:update:user']
      );
      
      if (workerAppGrantResult.success) {
        steps.push({ step: 'worker-grants', icon: '✅', message: 'Worker scopes granted' });
      } else {
        steps.push({ step: 'worker-grants', icon: '⚠️', message: 'Failed to grant Worker scopes' });
      }
      onStep(steps[steps.length - 1]);

      // Step 21: Write configuration
      steps.push({ step: 'config', icon: '📝', message: config.isVercel ? 'Setting Vercel environment variables...' : 'Writing .env file...' });
      onStep(steps[steps.length - 1]);
      
      if (config.isVercel) {
        const vercelResults = await this.setVercelEnvVars(config, provisioned);
        const successCount = vercelResults.filter(r => r.success).length;
        steps.push({ 
          step: 'config', 
          icon: successCount === vercelResults.length ? '✅' : '⚠️', 
          message: `Set ${successCount}/${vercelResults.length} Vercel environment variables` 
        });
      } else {
        const envPath = await this.writeEnvFile(config, provisioned);
        steps.push({ step: 'config', icon: '✅', message: `.env file written to ${envPath}` });
      }
      onStep(steps[steps.length - 1]);

      // Step 16: Complete
      steps.push({ 
        step: 'complete', 
        icon: '🎉', 
        message: 'Setup complete! All resources provisioned successfully.',
        result: provisioned 
      });
      onStep(steps[steps.length - 1]);

      return {
        success: true,
        provisioned,
        steps: steps.filter(s => s.step !== 'complete')
      };

    } catch (error) {
      steps.push({ 
        step: 'error', 
        icon: '❌', 
        message: `Setup failed: ${error.message}` 
      });
      onStep(steps[steps.length - 1]);
      
      throw error;
    }
  }

  /**
   * Enable token customization for an application
   */
  async enableTokenCustomization(appId) {
    try {
      const response = await this.makeRequest('PUT', `/applications/${appId}/tokenCustomization`, {
        enabled: true
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to enable token customization: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Add token claim to an application
   */
  async addTokenClaim(appId, claimName, claimType, value) {
    try {
      const response = await this.makeRequest('POST', `/applications/${appId}/tokenClaims`, {
        name: claimName,
        type: claimType,
        value: typeof value === 'string' ? value : JSON.stringify(value)
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to add token claim: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Recreate a specific resource
   */
  async recreateResource(config, resourceKey) {
    const [type, id] = resourceKey.split(':');
    
    try {
      switch (type) {
        case 'resource':
          await this.makeRequest('DELETE', `/resources/${id}`);
          return { success: true, message: 'Resource server deleted' };
          
        case 'application':
          await this.makeRequest('DELETE', `/applications/${id}`);
          return { success: true, message: 'Application deleted' };
          
        case 'user':
          await this.makeRequest('DELETE', `/users/${id}`);
          return { success: true, message: 'User deleted' };
          
        default:
          throw new Error(`Unknown resource type: ${type}`);
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate secure password
   */
  generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}

// Export singleton instance and class
const provisionService = new PingOneProvisionService();

module.exports = {
  PingOneProvisionService,
  provisionService,
  provisionEnvironment: (config, onStep) => provisionService.provisionEnvironment(config, onStep),
  recreateResource: (config, resourceKey) => provisionService.recreateResource(config, resourceKey),
  checkResourceExists: (type, name) => provisionService.findResourceByName(type, name)
};
