/**
 * Tests for LogViewer Component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import axios from 'axios';
import LogViewer from '../LogViewer';

jest.mock('axios');
jest.mock('../../services/toastLogStore', () => ({
  toastLogStore: {
    getAll: jest.fn(() => []),
    subscribe: jest.fn(() => () => {}),
    clear: jest.fn(),
    append: jest.fn(),
  },
}));

describe('LogViewer Component', () => {
  const mockLogs = [
    {
      timestamp: '2026-03-23T18:00:00.000Z',
      level: 'info',
      message: 'Test info message'
    },
    {
      timestamp: '2026-03-23T18:01:00.000Z',
      level: 'error',
      message: 'Test error message'
    },
    {
      timestamp: '2026-03-23T18:02:00.000Z',
      level: 'warn',
      message: 'Test warning message',
      correlationId: 'test-123'
    }
  ];

  const mockStats = {
    total: 100,
    byLevel: {
      error: 10,
      warn: 20,
      info: 60,
      debug: 10
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    axios.get.mockResolvedValue({
      data: {
        logs: mockLogs,
        total: mockLogs.length
      }
    });
  });

  describe('Rendering', () => {
    it('should not render when closed', () => {
      const { container } = render(<LogViewer isOpen={false} onClose={jest.fn()} />);
      expect(container.querySelector('.log-viewer-overlay')).not.toBeInTheDocument();
    });

    it('should render when open', async () => {
      render(<LogViewer isOpen={true} onClose={jest.fn()} />);
      
      await waitFor(() => {
        expect(screen.getByText('📊 Log Viewer')).toBeInTheDocument();
      });
    });

    it('should render close button', async () => {
      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('✕')).toBeInTheDocument();
      });
    });
  });

  describe('Log Fetching', () => {
    it('should fetch logs on open', async () => {
      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith(
          '/api/logs/console',
          expect.objectContaining({
            params: expect.any(Object)
          })
        );
      });
    });

    it('should fetch stats on open', async () => {
      axios.get.mockImplementation((url) => {
        if (url === '/api/logs/stats') {
          return Promise.resolve({ data: mockStats });
        }
        return Promise.resolve({ data: { logs: mockLogs, total: mockLogs.length } });
      });

      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith('/api/logs/stats');
      });
    });

    it('should display fetched logs', async () => {
      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getAllByText('Test info message').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Test error message').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Test warning message').length).toBeGreaterThan(0);
      });
    });

    it('should handle fetch errors', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/Error:/)).toBeInTheDocument();
      });
    });
  });

  describe('Filtering', () => {
    it('should filter by log level', async () => {
      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        const [, levelSelect] = screen.getAllByRole('combobox');
        fireEvent.change(levelSelect, { target: { value: 'error' } });
      });

      await waitFor(() => {
        const levelParams = expect.objectContaining({
          params: expect.objectContaining({
            level: 'error'
          })
        });
        expect(axios.get).toHaveBeenCalledWith('/api/logs/console', levelParams);
        expect(axios.get).toHaveBeenCalledWith('/api/logs/app', levelParams);
        expect(axios.get).toHaveBeenCalledWith('/api/logs/vercel', levelParams);
      });
    });

    it('should filter by search term', async () => {
      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Filter logs...');
        fireEvent.change(searchInput, { target: { value: 'test' } });
      });

      await waitFor(() => {
        const searchParams = expect.objectContaining({
          params: expect.objectContaining({
            search: 'test'
          })
        });
        expect(axios.get).toHaveBeenCalledWith('/api/logs/console', searchParams);
        expect(axios.get).toHaveBeenCalledWith('/api/logs/app', searchParams);
        expect(axios.get).toHaveBeenCalledWith('/api/logs/vercel', searchParams);
      });
    });

    it('should change log source', async () => {
      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        const [sourceSelect] = screen.getAllByRole('combobox');
        fireEvent.change(sourceSelect, { target: { value: 'vercel' } });
      });

      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith(
          '/api/logs/vercel',
          expect.any(Object)
        );
      });
    });
  });

  describe('Auto-refresh', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should auto-refresh when enabled', async () => {
      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(axios.get).toHaveBeenCalled();
      });

      const initialCallCount = axios.get.mock.calls.length;

      jest.advanceTimersByTime(2000);

      await waitFor(() => {
        expect(axios.get.mock.calls.length).toBeGreaterThan(initialCallCount);
      });
    });

    it('should stop auto-refresh when disabled', async () => {
      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        const autoRefreshCheckbox = screen.getByLabelText(/Auto-refresh/);
        fireEvent.click(autoRefreshCheckbox);
      });

      const callCountAfterDisable = axios.get.mock.calls.length;

      jest.advanceTimersByTime(2000);

      expect(axios.get.mock.calls.length).toBe(callCountAfterDisable);
    });
  });

  describe('Actions', () => {
    it('should close modal when close button clicked', async () => {
      const onClose = jest.fn();
      render(<LogViewer isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        const closeButton = screen.getByText('✕');
        fireEvent.click(closeButton);
      });

      expect(onClose).toHaveBeenCalled();
    });

    it('should refresh logs manually', async () => {
      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getAllByText('Test info message').length).toBeGreaterThan(0);
      });

      const initialCallCount = axios.get.mock.calls.length;

      const refreshButton = screen.getByRole('button', { name: /Refresh/ });
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(axios.get.mock.calls.length).toBeGreaterThan(initialCallCount);
      });
    });

    it('should download logs', async () => {
      global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
      global.URL.revokeObjectURL = jest.fn();
      
      const mockClick = jest.fn();
      const origCreateElement = document.createElement.bind(document);
      const createElSpy = jest.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'a') {
          return {
            click: mockClick,
            href: '',
            download: ''
          };
        }
        return origCreateElement(tag);
      });

      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        const downloadButton = screen.getByText(/Download/);
        fireEvent.click(downloadButton);
      });

      expect(mockClick).toHaveBeenCalled();
      createElSpy.mockRestore();
    });

    it('should clear console logs', async () => {
      axios.delete.mockResolvedValue({ data: { cleared: 10 } });
      global.confirm = jest.fn(() => true);

      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        const clearButton = screen.getByText(/Clear/);
        fireEvent.click(clearButton);
      });

      await waitFor(() => {
        expect(axios.delete).toHaveBeenCalledWith('/api/logs/console');
      });
    });

    it('should not clear logs if user cancels', async () => {
      global.confirm = jest.fn(() => false);

      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        const clearButton = screen.getByText(/Clear/);
        fireEvent.click(clearButton);
      });

      expect(axios.delete).not.toHaveBeenCalled();
    });
  });

  describe('Display Features', () => {
    it('should display log count', async () => {
      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/logs displayed/)).toBeInTheDocument();
      });
    });

    it('should display live indicator when auto-refresh enabled', async () => {
      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('● Live')).toBeInTheDocument();
      });
    });

    it('should display correlation IDs', async () => {
      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getAllByText(/test-123/).length).toBeGreaterThan(0);
      });
    });

    it('should display loading state', () => {
      axios.get.mockImplementation(() => new Promise(() => {}));

      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      expect(screen.getByText('Loading logs...')).toBeInTheDocument();
    });

    it('should display empty state', async () => {
      axios.get.mockResolvedValue({ data: { logs: [], total: 0 } });

      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('No logs found')).toBeInTheDocument();
      });
    });
  });

  describe('Stats Display', () => {
    it('should display log statistics', async () => {
      axios.get.mockImplementation((url) => {
        if (url === '/api/logs/stats') {
          return Promise.resolve({ data: mockStats });
        }
        return Promise.resolve({ data: { logs: mockLogs, total: mockLogs.length } });
      });

      render(<LogViewer isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/Total: 100/)).toBeInTheDocument();
        expect(screen.getByText(/Errors: 10/)).toBeInTheDocument();
        expect(screen.getByText(/Warnings: 20/)).toBeInTheDocument();
      });
    });
  });
});
