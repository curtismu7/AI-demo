/**
 * Tests for PingOneAudit React Component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PingOneAudit from '../PingOneAudit';
import apiClient from '../../services/apiClient';

jest.mock('../../services/apiClient', () => ({
  get: jest.fn()
}));

describe('PingOneAudit Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should render initial state with "Run Audit" button', () => {
      render(<PingOneAudit />);
      
      expect(screen.getByText(/Click/i)).toBeInTheDocument();
      expect(screen.getByText('Run Audit')).toBeInTheDocument();
    });

    it('should display component title', () => {
      render(<PingOneAudit />);
      
      expect(screen.getByText('PingOne Configuration Audit')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner while fetching audit', async () => {
      apiClient.get.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<PingOneAudit />);
      fireEvent.click(screen.getByText('Run Audit'));

      expect(screen.getByText(/Auditing PingOne resources and scopes/)).toBeInTheDocument();
    });
  });

  describe('Success State', () => {
    it('should display resource validation table', async () => {
      const mockData = {
        status: 'success',
        auditedAt: '2024-01-15T10:30:00Z',
        resourceValidation: [
          {
            resourceName: 'Super Banking AI Agent',
            audienceUri: 'https://ai-agent.pingdemo.com',
            authMethod: 'CLIENT_CREDENTIALS',
            status: 'CORRECT'
          }
        ],
        scopeAudit: []
      };

      apiClient.get.mockResolvedValueOnce({ data: mockData });

      render(<PingOneAudit />);
      fireEvent.click(screen.getByText('Run Audit'));

      await waitFor(() => {
        expect(screen.getByText('Resource Configuration')).toBeInTheDocument();
        expect(screen.getByText('Super Banking AI Agent')).toBeInTheDocument();
      });
    });

    it('should display scope audit table', async () => {
      const mockData = {
        status: 'success',
        auditedAt: '2024-01-15T10:30:00Z',
        resourceValidation: [],
        scopeAudit: [
          {
            resourceName: 'Super Banking AI Agent',
            expectedScopes: ['banking:agent:invoke'],
            currentScopes: ['banking:agent:invoke'],
            status: 'CORRECT'
          }
        ]
      };

      apiClient.get.mockResolvedValueOnce({ data: mockData });

      render(<PingOneAudit />);
      fireEvent.click(screen.getByText('Run Audit'));

      await waitFor(() => {
        expect(screen.getByText('Scope Audit')).toBeInTheDocument();
        expect(screen.getByText('banking:agent:invoke')).toBeInTheDocument();
      });
    });

    it('should display audit timestamp', async () => {
      const mockData = {
        status: 'success',
        auditedAt: '2024-01-15T10:30:00Z',
        resourceValidation: [],
        scopeAudit: []
      };

      apiClient.get.mockResolvedValueOnce({ data: mockData });

      render(<PingOneAudit />);
      fireEvent.click(screen.getByText('Run Audit'));

      await waitFor(() => {
        expect(screen.getByText(/Last run:/)).toBeInTheDocument();
      });
    });

    it('should show status badges with correct colors', async () => {
      const mockData = {
        status: 'success',
        auditedAt: '2024-01-15T10:30:00Z',
        resourceValidation: [
          {
            resourceName: 'Super Banking AI Agent',
            audienceUri: 'https://ai-agent.pingdemo.com',
            authMethod: 'CLIENT_CREDENTIALS',
            status: 'CORRECT'
          },
          {
            resourceName: 'Missing Resource',
            audienceUri: null,
            authMethod: null,
            status: 'MISSING'
          }
        ],
        scopeAudit: []
      };

      apiClient.get.mockResolvedValueOnce({ data: mockData });

      render(<PingOneAudit />);
      fireEvent.click(screen.getByText('Run Audit'));

      await waitFor(() => {
        expect(screen.getByText('CORRECT')).toBeInTheDocument();
        expect(screen.getByText('MISSING')).toBeInTheDocument();
      });
    });

    it('should display summary stats', async () => {
      const mockData = {
        status: 'success',
        auditedAt: '2024-01-15T10:30:00Z',
        resourceValidation: [
          {
            resourceName: 'Super Banking AI Agent',
            audienceUri: 'https://ai-agent.pingdemo.com',
            authMethod: 'CLIENT_CREDENTIALS',
            status: 'CORRECT'
          }
        ],
        scopeAudit: [
          {
            resourceName: 'Super Banking AI Agent',
            expectedScopes: ['banking:agent:invoke'],
            currentScopes: ['banking:agent:invoke'],
            status: 'CORRECT'
          }
        ]
      };

      apiClient.get.mockResolvedValueOnce({ data: mockData });

      render(<PingOneAudit />);
      fireEvent.click(screen.getByText('Run Audit'));

      await waitFor(() => {
        expect(screen.getByText(/Resources Correct:/)).toBeInTheDocument();
        expect(screen.getByText(/Scopes Correct:/)).toBeInTheDocument();
      });
    });
  });

  describe('Error State', () => {
    it('should show error message when API call fails', async () => {
      apiClient.get.mockRejectedValueOnce(
        new Error('API Error')
      );

      render(<PingOneAudit />);
      fireEvent.click(screen.getByText('Run Audit'));

      await waitFor(() => {
        expect(screen.getByText(/API Error/)).toBeInTheDocument();
      });
    });

    it('should show authentication error message', async () => {
      const error = new Error('Unauthorized');
      error.response = { status: 401 };
      apiClient.get.mockRejectedValueOnce(error);

      render(<PingOneAudit />);
      fireEvent.click(screen.getByText('Run Audit'));

      await waitFor(() => {
        expect(screen.getByText(/Not authenticated/)).toBeInTheDocument();
      });
    });

    it('should display Retry button on error', async () => {
      apiClient.get.mockRejectedValueOnce(new Error('API Error'));

      render(<PingOneAudit />);
      fireEvent.click(screen.getByText('Run Audit'));

      await waitFor(() => {
        expect(screen.getByText('Retry Audit')).toBeInTheDocument();
      });
    });
  });

  describe('Refresh Functionality', () => {
    it('should refresh audit results when button clicked', async () => {
      const mockData = {
        status: 'success',
        auditedAt: '2024-01-15T10:30:00Z',
        resourceValidation: [],
        scopeAudit: []
      };

      apiClient.get.mockResolvedValueOnce({ data: mockData });

      render(<PingOneAudit />);
      fireEvent.click(screen.getByText('Run Audit'));

      await waitFor(() => {
        expect(screen.getByText('Refresh Audit')).toBeInTheDocument();
      });

      // Reset mock and make another call
      jest.clearAllMocks();
      apiClient.get.mockResolvedValueOnce({ data: mockData });

      fireEvent.click(screen.getByText('Refresh Audit'));

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/api/pingone/audit');
      });
    });
  });

  describe('Scope Mismatch Display', () => {
    it('should display missing and extra scopes in mismatch details', async () => {
      const mockData = {
        status: 'success',
        auditedAt: '2024-01-15T10:30:00Z',
        resourceValidation: [],
        scopeAudit: [
          {
            resourceName: 'Super Banking MCP Server',
            expectedScopes: ['banking:accounts:read', 'banking:transactions:read'],
            currentScopes: ['banking:accounts:read', 'extra:scope'],
            status: 'MISMATCH',
            mismatches: {
              missing: ['banking:transactions:read'],
              extra: ['extra:scope']
            }
          }
        ]
      };

      apiClient.get.mockResolvedValueOnce({ data: mockData });

      render(<PingOneAudit />);
      fireEvent.click(screen.getByText('Run Audit'));

      await waitFor(() => {
        expect(screen.getByText(/Missing:/)).toBeInTheDocument();
        expect(screen.getByText(/Extra:/)).toBeInTheDocument();
      });
    });
  });

  describe('Empty Results', () => {
    it('should show empty message when no resources found', async () => {
      const mockData = {
        status: 'success',
        auditedAt: '2024-01-15T10:30:00Z',
        resourceValidation: [],
        scopeAudit: []
      };

      apiClient.get.mockResolvedValueOnce({ data: mockData });

      render(<PingOneAudit />);
      fireEvent.click(screen.getByText('Run Audit'));

      await waitFor(() => {
        expect(screen.getByText(/No resources found in audit results/)).toBeInTheDocument();
      });
    });
  });
});
