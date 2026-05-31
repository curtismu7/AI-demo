'use strict';

/**
 * Retail tools — the vertical's OWN actions over its OWN data store.
 * No banking action names, no relabeling. Each handler returns
 * { result, render } where `render` is the manifest render-descriptor key
 * (the UI resolves the descriptor from the active manifest's `render` block).
 */
function buildRetailTools(store) {
  const tools = [
    { name: 'list_orders', description: 'List the customer\'s orders.', inputSchema: { type: 'object', properties: {} }, scopes: ['read'], authz: {} },
    { name: 'order_status', description: 'Show the status of a specific order.', inputSchema: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] }, scopes: ['read'], authz: {} },
    { name: 'rewards_balance', description: 'Show the customer\'s reward points and store credit.', inputSchema: { type: 'object', properties: {} }, scopes: ['read'], authz: {} },
    { name: 'checkout', description: 'Place an order (checkout). Requires confirmation.', inputSchema: { type: 'object', properties: { product: { type: 'string' }, amount: { type: 'number' } }, required: ['product', 'amount'] }, scopes: ['write'], authz: { consent: true } },
  ];

  async function execute(name, params, ctx) {
    const userId = ctx && ctx.userId ? ctx.userId : 'anon';
    switch (name) {
      case 'list_orders':
        return { result: { orders: store.get(userId).orders }, render: 'list_orders' };
      case 'order_status': {
        const order = store.get(userId).orders.find((o) => o.id === (params && params.orderId));
        if (!order) return { result: { error: 'order not found' }, render: 'text' };
        return { result: order, render: 'order_status' };
      }
      case 'rewards_balance':
        return { result: store.get(userId).rewards, render: 'rewards_balance' };
      case 'checkout':
        return { result: store.checkout(userId, params || {}), render: 'checkout' };
      default:
        return { result: { error: `unknown tool: ${name}` }, render: 'text' };
    }
  }

  return { tools, execute };
}

module.exports = { buildRetailTools };
