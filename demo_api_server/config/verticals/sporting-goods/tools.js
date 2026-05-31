'use strict';

/**
 * Sporting-goods tools — the vertical's OWN actions over its OWN data store.
 * No banking action names, no relabeling. Each handler returns
 * { result, render } where `render` is the manifest render-descriptor key
 * (the UI resolves the descriptor from the active manifest's `render` block).
 */
function buildSportingGoodsTools(store) {
  const tools = [
    {
      name: 'list_gear',
      description: 'List the member\'s gear orders.',
      inputSchema: { type: 'object', properties: {} },
      scopes: ['read'],
      authz: {},
    },
    {
      name: 'list_rentals',
      description: 'List the member\'s active equipment rentals.',
      inputSchema: { type: 'object', properties: {} },
      scopes: ['read'],
      authz: {},
    },
    {
      name: 'gear_order_status',
      description: 'Show the status of a specific gear order.',
      inputSchema: {
        type: 'object',
        properties: { orderId: { type: 'string' } },
        required: ['orderId'],
      },
      scopes: ['read'],
      authz: {},
    },
    {
      name: 'loyalty_balance',
      description: 'Show the member\'s loyalty points and tier.',
      inputSchema: { type: 'object', properties: {} },
      scopes: ['read'],
      authz: {},
    },
    {
      name: 'extend_rental',
      description: 'Extend an active rental. Requires confirmation.',
      inputSchema: {
        type: 'object',
        properties: { rentalId: { type: 'string' }, days: { type: 'number' } },
        required: ['rentalId'],
      },
      scopes: ['write'],
      authz: { consent: true },
    },
  ];

  async function execute(name, params, ctx) {
    const userId = ctx && ctx.userId ? ctx.userId : 'anon';
    switch (name) {
      case 'list_gear':
        return { result: { orders: store.get(userId).orders }, render: 'list_gear' };
      case 'list_rentals':
        return { result: { rentals: store.get(userId).rentals }, render: 'list_rentals' };
      case 'gear_order_status': {
        const order = store.get(userId).orders.find((o) => o.id === (params && params.orderId));
        if (!order) return { result: { error: 'order not found' }, render: 'text' };
        return { result: order, render: 'gear_order_status' };
      }
      case 'loyalty_balance':
        return { result: store.get(userId).loyalty, render: 'loyalty_balance' };
      case 'extend_rental': {
        const r = store.extendRental(userId, params || {});
        if (!r) return { result: { error: 'rental not found' }, render: 'text' };
        return { result: r, render: 'extend_rental' };
      }
      default:
        return { result: { error: `unknown tool: ${name}` }, render: 'text' };
    }
  }

  return { tools, execute };
}

module.exports = { buildSportingGoodsTools };
