'use strict';

/** Workforce tools — own HR actions (incl. novel submit_expense/request_time_off). */
function buildWorkforceTools(store) {
  const tools = [
    {
      name: 'view_benefits',
      description: 'List the employee\'s benefits enrollments.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      scopes: ['read'],
      authz: {},
    },
    {
      name: 'pto_balance',
      description: 'Show the employee\'s PTO and sick leave balance.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      scopes: ['read'],
      authz: {},
    },
    {
      name: 'list_expenses',
      description: 'List the employee\'s expense reports.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      scopes: ['read'],
      authz: {},
    },
    {
      name: 'submit_expense',
      description: 'Submit an expense report. Requires step-up + confirmation.',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          amount: { type: 'number' },
        },
        required: ['category', 'amount'],
      },
      scopes: ['write'],
      authz: { stepUp: true, consent: true },
    },
    {
      name: 'request_time_off',
      description: 'Request time off. Requires confirmation.',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number' },
        },
        required: ['days'],
      },
      scopes: ['write'],
      authz: { consent: true },
    },
  ];

  async function execute(name, params, ctx) {
    const userId = ctx && ctx.userId ? ctx.userId : 'anon';

    switch (name) {
      case 'view_benefits':
        return {
          result: { benefits: store.get(userId).benefits },
          render: 'view_benefits',
        };

      case 'pto_balance':
        return {
          result: store.get(userId).pto,
          render: 'pto_balance',
        };

      case 'list_expenses':
        return {
          result: { expenses: store.get(userId).expenses },
          render: 'list_expenses',
        };

      case 'submit_expense':
        return {
          result: store.submitExpense(userId, params || {}),
          render: 'submit_expense',
        };

      case 'request_time_off': {
        const out = store.requestTimeOff(userId, params || {});
        if (out && out.error) {
          return { result: { error: out.error }, render: 'text' };
        }
        return { result: out, render: 'request_time_off' };
      }

      default:
        return { result: { error: `unknown tool: ${name}` }, render: 'text' };
    }
  }

  return { tools, execute };
}

module.exports = { buildWorkforceTools };
