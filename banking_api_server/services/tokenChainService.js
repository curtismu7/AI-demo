'use strict';
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// In-memory storage for token events (in production, this would be persisted)
const tokenEvents = new Map();

// Token event structure
const TokenEvent = {
  id: '',
  timestamp: '',
  eventType: '', // 'auth', 'exchange', 'refresh', 'revoke'
  tokenType: '', // 'user_token', 'agent_token', 'exchanged_token'
  tokenSub: '', // sub claim (user ID)
  tokenAct: null, // act claim (agent info)
  tokenAgent: null, // agent client ID
  scopes: [],
  audience: '',
  issuer: '',
  expiry: null,
  description: '', // Human-readable description
  exchangeSteps: [], // For exchange events
  userId: '' // User who owns this token chain
};

// Token type classification
function classifyTokenType(token, context = {}) {
  if (!token) return 'unknown';
  
  try {
    const claims = jwt.decode(token);
    if (!claims) return 'invalid';
    
    // Check for agent token (has specific scopes or client_id in context)
    if (claims.act?.client_id || claims.scope?.includes('agent:')) {
      return 'agent_token';
    }
    
    // Check for exchanged token (has both sub and act)
    if (claims.sub && claims.act) {
      return 'exchanged_token';
    }
    
    // Default to user token
    return 'user_token';
  } catch (err) {
    return 'invalid';
  }
}

// Description generation
function generateTokenDescription(eventType, tokenType, claims, context = {}) {
  switch (eventType) {
    case 'auth':
      return `User authentication via PingOne OAuth (sub: ${claims.sub || 'unknown'})`;
    case 'exchange':
      if (tokenType === 'exchanged_token') {
        return `Token exchange: user_token + agent_token → exchanged_token (sub: ${claims.sub || 'unknown'}, act: ${claims.act?.client_id || 'unknown'})`;
      }
      return `Token exchange: ${context.fromToken || 'unknown'} → ${context.toToken || 'unknown'}`;
    case 'refresh':
      return `Token refreshed (sub: ${claims.sub || 'unknown'})`;
    case 'revoke':
      return `Token revoked (sub: ${claims.sub || 'unknown'})`;
    default:
      return `${eventType} operation`;
  }
}

// Extract JWT claims safely
function extractJwtClaims(token) {
  try {
    return jwt.decode(token) || {};
  } catch (err) {
    return {};
  }
}

// Core functions

async function trackTokenEvent(eventData) {
  const {
    eventType,
    token,
    description,
    userId,
    additionalData = {}
  } = eventData;
  
  const claims = extractJwtClaims(token);
  const tokenType = classifyTokenType(token, additionalData);
  
  const event = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    eventType,
    tokenType,
    tokenSub: claims.sub || '',
    tokenAct: claims.act || null,
    tokenAgent: claims.act?.client_id || null,
    scopes: claims.scope ? (Array.isArray(claims.scope) ? claims.scope : claims.scope.split(' ')) : [],
    audience: claims.aud || '',
    issuer: claims.iss || '',
    expiry: claims.exp ? new Date(claims.exp * 1000).toISOString() : null,
    description: description || generateTokenDescription(eventType, tokenType, claims, additionalData),
    exchangeSteps: [],
    userId
  };
  
  // Store event (in production, this would be persisted to database)
  if (!tokenEvents.has(userId)) {
    tokenEvents.set(userId, []);
  }
  tokenEvents.get(userId).push(event);
  
  // Keep only last 50 events per user
  const userEvents = tokenEvents.get(userId);
  if (userEvents.length > 50) {
    tokenEvents.set(userId, userEvents.slice(-50));
  }
  
  return event;
}

async function addExchangeStep(exchangeData) {
  const {
    userId,
    step,
    description,
    fromToken,
    toToken,
    timestamp = new Date().toISOString()
  } = exchangeData;
  
  const userEvents = tokenEvents.get(userId) || [];
  const latestEvent = userEvents[userEvents.length - 1];
  
  if (latestEvent && latestEvent.eventType === 'exchange') {
    latestEvent.exchangeSteps.push({
      step,
      description,
      fromToken,
      toToken,
      timestamp
    });
  }
  
  return latestEvent;
}

async function getTokenChain(userId = null) {
  if (!userId) {
    // Return all events (for admin use)
    const allEvents = [];
    for (const [uid, events] of tokenEvents.entries()) {
      allEvents.push(...events.map(e => ({ ...e, userId: uid })));
    }
    return allEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }
  
  return (tokenEvents.get(userId) || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// Helper function to get current active tokens for a user
async function getCurrentTokens(userId) {
  const userEvents = tokenEvents.get(userId) || [];
  return userEvents.filter(event => 
    event.eventType === 'auth' || event.eventType === 'exchange'
  );
}

// Clear token chain (for testing or logout)
async function clearTokenChain(userId) {
  tokenEvents.delete(userId);
}

module.exports = {
  trackTokenEvent,
  addExchangeStep,
  getTokenChain,
  getCurrentTokens,
  clearTokenChain,
  classifyTokenType,
  generateTokenDescription
};
