/**
 * pingOneUserService.js
 *
 * PingOne Management API service for user provisioning and mayAct setup.
 * Uses worker app credentials for administrative operations.
 */

const axios = require('axios');
const configStore = require('./configStore');
const { logger, LOG_CATEGORIES } = require('../utils/logger');

class PingOneUserService {
  constructor() {
    this.baseUrl = null;
    this.environmentId = null;
    this.workerAppClientId = null;
    this.workerAppClientSecret = null;
    this.adminPopulationId = null;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Initialize the service with configuration
   */
  initialize() {
    const region = configStore.getEffective('pingone_region') || 'com';
    const environmentId = configStore.getEffective('pingone_environment_id');
    const workerAppClientId = process.env.PINGONE_WORKER_CLIENT_ID;
    const workerAppClientSecret = process.env.PINGONE_WORKER_CLIENT_SECRET;
    const adminPopulationId = configStore.getEffective('admin_population_id');

    if (!environmentId || !workerAppClientId || !workerAppClientSecret) {
      throw new Error('PingOne user service requires environment ID and worker app credentials');
    }

    this.baseUrl = `https://api.pingone.${region}/v1/environments/${environmentId}`;
    this.environmentId = environmentId;
    this.workerAppClientId = workerAppClientId;
    this.workerAppClientSecret = workerAppClientSecret;
    this.adminPopulationId = adminPopulationId;

    logger.info(LOG_CATEGORIES.USER_MANAGEMENT, 'PingOne user service initialized', {
      region,
      environmentId,
      hasWorkerCredentials: true,
      adminPopulationId: adminPopulationId || 'not_set'
    });
  }

  /**
   * Get or refresh worker app access token
   */
  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const region = configStore.getEffective('pingone_region') || 'com';
      const tokenEndpoint = `https://auth.pingone.${region}/${this.environmentId}/as/token`;
      
      const credentials = Buffer.from(`${this.workerAppClientId}:${this.workerAppClientSecret}`).toString('base64');
      
      const response = await axios.post(tokenEndpoint, 
        new URLSearchParams({
          grant_type: 'client_credentials',
        }),
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      // Set expiry 5 minutes before actual expiry to be safe
      this.tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;

      logger.debug(LOG_CATEGORIES.USER_MANAGEMENT, 'Worker app token obtained', {
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type
      });

      return this.accessToken;
    } catch (error) {
      logger.error(LOG_CATEGORIES.USER_MANAGEMENT, 'Failed to get worker app token', {
        error: error.message,
        status: error.response?.status
      });
      throw new Error('Failed to authenticate with PingOne Management API');
    }
  }

  /**
   * Make authenticated API request to PingOne
   */
  async makeRequest(method, path, data = null, options = {}) {
    const token = await this.getAccessToken();
    
    const config = {
      method,
      url: `${this.baseUrl}${path}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      ...options
    };

    if (data) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error(LOG_CATEGORIES.USER_MANAGEMENT, 'PingOne API request failed', {
        method,
        path,
        status: error.response?.status,
        error: error.response?.data?.error || error.message
      });
      
      if (error.response?.status === 401) {
        // Token might be expired, clear it and retry once
        this.accessToken = null;
        this.tokenExpiry = null;
        
        const token = await this.getAccessToken();
        config.headers.Authorization = `Bearer ${token}`;
        
        try {
          const response = await axios(config);
          return response.data;
        } catch (retryError) {
          throw new Error(`PingOne API request failed: ${retryError.response?.data?.error?.message || retryError.message}`);
        }
      }
      
      throw new Error(`PingOne API request failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Create a new PingOne user
   */
  async createPingOneUser(userData) {
    const {
      email,
      username,
      firstName,
      lastName,
      password,
      phone,
      address,
      role = 'customer'
    } = userData;

    // Validate required fields
    if (!email || !username || !firstName || !lastName || !password) {
      throw new Error('Email, username, firstName, lastName, and password are required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    // Validate password strength
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    const userPayload = {
      username,
      email,
      name: {
        given: firstName,
        family: lastName
      },
      enabled: true,
      population: role === 'admin' && this.adminPopulationId 
        ? { id: this.adminPopulationId }
        : undefined
    };

    // Add optional fields
    if (phone) {
      userPayload.phone = phone;
    }

    if (address) {
      userPayload.address = address;
    }

    logger.info(LOG_CATEGORIES.USER_MANAGEMENT, 'Creating PingOne user', {
      email,
      username,
      role,
      populationId: userPayload.population?.id
    });

    try {
      const user = await this.makeRequest('POST', '/users', userPayload);
      
      // Set password
      await this.setUserPassword(user.id, password);
      
      // Set mayAct attribute for admin users
      if (role === 'admin') {
        await this.setMayActAttribute(user.id, {
          enabled: true,
          clientIds: [configStore.getEffective('pingone_core_client_id')]
        });
      }

      logger.info(LOG_CATEGORIES.USER_MANAGEMENT, 'PingOne user created successfully', {
        userId: user.id,
        email,
        role
      });

      return user;
    } catch (error) {
      logger.error(LOG_CATEGORIES.USER_MANAGEMENT, 'Failed to create PingOne user', {
        email,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update user password
   */
  async setUserPassword(userId, password) {
    try {
      await this.makeRequest('PUT', `/users/${userId}/password`, {
        value: password
      });

      logger.debug(LOG_CATEGORIES.USER_MANAGEMENT, 'User password set successfully', {
        userId
      });
    } catch (error) {
      logger.error(LOG_CATEGORIES.USER_MANAGEMENT, 'Failed to set user password', {
        userId,
        error: error.message
      });
      throw new Error(`Failed to set user password: ${error.message}`);
    }
  }

  /**
   * Set mayAct custom attribute on user
   */
  async setMayActAttribute(userId, mayActConfig) {
    try {
      const patchPayload = [
        {
          op: 'add',
          path: '/custom/mayAct',
          value: mayActConfig
        }
      ];

      await this.makeRequest('PATCH', `/users/${userId}`, patchPayload);

      logger.info(LOG_CATEGORIES.USER_MANAGEMENT, 'mayAct attribute set successfully', {
        userId,
        mayActConfig
      });
    } catch (error) {
      logger.error(LOG_CATEGORIES.USER_MANAGEMENT, 'Failed to set mayAct attribute', {
        userId,
        error: error.message
      });
      throw new Error(`Failed to set mayAct attribute: ${error.message}`);
    }
  }

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId) {
    try {
      const user = await this.makeRequest('GET', `/users/${userId}`);
      
      // Include population information
      const populatedUser = await this.makeRequest('GET', `/users/${userId}?populate=true`);
      
      logger.debug(LOG_CATEGORIES.USER_MANAGEMENT, 'User profile retrieved', {
        userId
      });

      return populatedUser;
    } catch (error) {
      logger.error(LOG_CATEGORIES.USER_MANAGEMENT, 'Failed to get user profile', {
        userId,
        error: error.message
      });
      throw new Error(`Failed to get user profile: ${error.message}`);
    }
  }

  /**
   * Update user
   */
  async updatePingOneUser(userId, updates) {
    try {
      const user = await this.makeRequest('PATCH', `/users/${userId}`, updates);

      logger.info(LOG_CATEGORIES.USER_MANAGEMENT, 'User updated successfully', {
        userId
      });

      return user;
    } catch (error) {
      logger.error(LOG_CATEGORIES.USER_MANAGEMENT, 'Failed to update user', {
        userId,
        error: error.message
      });
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }

  /**
   * Delete user
   */
  async deletePingOneUser(userId) {
    try {
      await this.makeRequest('DELETE', `/users/${userId}`);

      logger.info(LOG_CATEGORIES.USER_MANAGEMENT, 'User deleted successfully', {
        userId
      });

      return true;
    } catch (error) {
      logger.error(LOG_CATEGORIES.USER_MANAGEMENT, 'Failed to delete user', {
        userId,
        error: error.message
      });
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }

  /**
   * List users (with optional filtering)
   */
  async listUsers(options = {}) {
    const { limit = 100, filter } = options;
    
    try {
      let path = '/users';
      const params = [];
      
      if (limit) {
        params.push(`limit=${limit}`);
      }
      
      if (filter) {
        params.push(`filter=${encodeURIComponent(filter)}`);
      }
      
      if (params.length > 0) {
        path += '?' + params.join('&');
      }

      const response = await this.makeRequest('GET', path);
      
      logger.debug(LOG_CATEGORIES.USER_MANAGEMENT, 'Users listed', {
        count: response._embedded?.users?.length || 0
      });

      return response;
    } catch (error) {
      logger.error(LOG_CATEGORIES.USER_MANAGEMENT, 'Failed to list users', {
        error: error.message
      });
      throw new Error(`Failed to list users: ${error.message}`);
    }
  }

  /**
   * Search users by email or username
   */
  async searchUsers(query) {
    if (!query || query.length < 2) {
      throw new Error('Search query must be at least 2 characters');
    }

    const filter = `email sw "${query}" or username sw "${query}"`;
    return this.listUsers({ filter, limit: 50 });
  }

  /**
   * Get user's current mayAct configuration
   */
  async getMayActStatus(userId) {
    try {
      const user = await this.makeRequest('GET', `/users/${userId}`);
      const mayAct = user.custom?.mayAct;
      
      logger.debug(LOG_CATEGORIES.USER_MANAGEMENT, 'mayAct status retrieved', {
        userId,
        hasMayAct: !!mayAct
      });

      return mayAct || null;
    } catch (error) {
      logger.error(LOG_CATEGORIES.USER_MANAGEMENT, 'Failed to get mayAct status', {
        userId,
        error: error.message
      });
      throw new Error(`Failed to get mayAct status: ${error.message}`);
    }
  }
}

// Export singleton instance
module.exports = new PingOneUserService();
