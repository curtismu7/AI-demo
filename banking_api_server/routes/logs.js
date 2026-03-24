/**
 * Log Viewer API Routes
 * Provides endpoints to fetch application logs and Vercel deployment logs
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

/**
 * Get application logs from file system
 * Supports filtering by level, time range, and search
 */
router.get('/app', async (req, res) => {
  try {
    const { level, search, limit = 100, since } = req.query;
    
    // In production, logs might be in different locations
    const logPaths = [
      path.join(__dirname, '../../logs/app.log'),
      path.join(__dirname, '../../logs/error.log'),
      '/var/log/app.log',
      process.env.LOG_FILE_PATH
    ].filter(Boolean);

    let allLogs = [];

    // Try to read from available log files
    for (const logPath of logPaths) {
      try {
        if (fs.existsSync(logPath)) {
          const content = fs.readFileSync(logPath, 'utf8');
          const lines = content.split('\n').filter(line => line.trim());
          allLogs = allLogs.concat(lines);
        }
      } catch (err) {
        // Continue to next log file
      }
    }

    // Parse logs (assuming JSON format)
    let parsedLogs = allLogs
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          // Handle plain text logs
          return {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: line,
            raw: true
          };
        }
      })
      .filter(log => {
        // Filter by level
        if (level && log.level !== level) return false;
        
        // Filter by search term
        if (search && !JSON.stringify(log).toLowerCase().includes(search.toLowerCase())) {
          return false;
        }
        
        // Filter by time
        if (since) {
          const logTime = new Date(log.timestamp).getTime();
          const sinceTime = new Date(since).getTime();
          if (logTime < sinceTime) return false;
        }
        
        return true;
      });

    // Sort by timestamp (newest first)
    parsedLogs.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });

    // Limit results
    parsedLogs = parsedLogs.slice(0, parseInt(limit));

    res.json({
      logs: parsedLogs,
      total: parsedLogs.length,
      hasMore: allLogs.length > parseInt(limit)
    });
  } catch (error) {
    console.error('Error fetching app logs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get Vercel deployment logs
 * Uses Vercel CLI or API to fetch logs
 */
router.get('/vercel', async (req, res) => {
  try {
    const { limit = 100 } = req.query;

    // On Vercel serverless the CLI is not available — serve in-process logs directly.
    let logs = [...recentLogs];

    // Limit results
    logs = logs.slice(0, parseInt(limit));

    res.json({
      logs,
      total: logs.length,
      source: 'vercel'
    });
  } catch (error) {
    console.error('Error fetching Vercel logs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get recent console logs from memory
 * This captures logs from the current Node.js process
 */
const recentLogs = [];
const MAX_LOGS = 1000;

// Intercept console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

console.log = function(...args) {
  captureLog('info', args);
  originalConsoleLog.apply(console, args);
};

console.error = function(...args) {
  captureLog('error', args);
  originalConsoleError.apply(console, args);
};

console.warn = function(...args) {
  captureLog('warn', args);
  originalConsoleWarn.apply(console, args);
};

console.info = function(...args) {
  captureLog('info', args);
  originalConsoleInfo.apply(console, args);
};

function captureLog(level, args) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' '),
    args: args.map(arg => 
      typeof arg === 'object' ? arg : String(arg)
    )
  };

  recentLogs.push(logEntry);
  
  // Keep only recent logs
  if (recentLogs.length > MAX_LOGS) {
    recentLogs.shift();
  }
}

router.get('/console', (req, res) => {
  const { level, search, limit = 100, since } = req.query;

  let filteredLogs = [...recentLogs];

  // Filter by level
  if (level) {
    filteredLogs = filteredLogs.filter(log => log.level === level);
  }

  // Filter by search
  if (search) {
    const searchLower = search.toLowerCase();
    filteredLogs = filteredLogs.filter(log => 
      log.message.toLowerCase().includes(searchLower)
    );
  }

  // Filter by time
  if (since) {
    const sinceTime = new Date(since).getTime();
    filteredLogs = filteredLogs.filter(log => 
      new Date(log.timestamp).getTime() >= sinceTime
    );
  }

  // Sort by timestamp (newest first)
  filteredLogs.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Limit results
  filteredLogs = filteredLogs.slice(0, parseInt(limit));

  res.json({
    logs: filteredLogs,
    total: filteredLogs.length,
    totalAvailable: recentLogs.length
  });
});

/**
 * Clear console logs from memory
 */
router.delete('/console', (req, res) => {
  const count = recentLogs.length;
  recentLogs.length = 0;
  res.json({ cleared: count });
});

/**
 * Get log statistics
 */
router.get('/stats', (req, res) => {
  const stats = {
    total: recentLogs.length,
    byLevel: {
      error: recentLogs.filter(l => l.level === 'error').length,
      warn: recentLogs.filter(l => l.level === 'warn').length,
      info: recentLogs.filter(l => l.level === 'info').length,
      debug: recentLogs.filter(l => l.level === 'debug').length
    },
    oldest: recentLogs.length > 0 ? recentLogs[0].timestamp : null,
    newest: recentLogs.length > 0 ? recentLogs[recentLogs.length - 1].timestamp : null
  };

  res.json(stats);
});

module.exports = router;
