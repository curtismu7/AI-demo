'use strict';

/**
 * Healthcare tools — the vertical's OWN actions over its OWN data store.
 * No banking action names, no relabeling. Each handler returns
 * { result, render } where `render` is the manifest render-descriptor key
 * (the UI resolves the descriptor from the active manifest's `render` block).
 */
function buildHealthcareTools(store) {
  const tools = [
    { name: 'view_records', description: 'List the patient\'s medical records.', inputSchema: { type: 'object', properties: {} }, scopes: ['read'], authz: {} },
    { name: 'view_coverage', description: 'Show the patient\'s insurance coverage summary.', inputSchema: { type: 'object', properties: {} }, scopes: ['read'], authz: {} },
    { name: 'list_appointments', description: 'List the patient\'s appointments.', inputSchema: { type: 'object', properties: {} }, scopes: ['read'], authz: {} },
    { name: 'book_appointment', description: 'Book a new appointment with a provider.', inputSchema: { type: 'object', properties: { provider: { type: 'string' }, clinic: { type: 'string' }, when: { type: 'string' }, reason: { type: 'string' } }, required: ['provider', 'when'] }, scopes: ['write'], authz: {} },
    { name: 'release_records', description: 'Release medical records to a third party (requires step-up + consent).', inputSchema: { type: 'object', properties: { recordId: { type: 'string' } }, required: ['recordId'] }, scopes: ['write'], authz: { stepUp: true, consent: true } },
  ];

  async function execute(name, params, ctx) {
    const userId = ctx && ctx.userId ? ctx.userId : 'anon';
    switch (name) {
      case 'view_records':
        return { result: { records: store.get(userId).patientRecords }, render: 'view_records' };
      case 'view_coverage':
        return { result: store.get(userId).coverage, render: 'view_coverage' };
      case 'list_appointments':
        return { result: { appointments: store.get(userId).appointments }, render: 'list_appointments' };
      case 'book_appointment':
        return { result: store.bookAppointment(userId, params || {}), render: 'book_appointment' };
      case 'release_records': {
        const rec = store.markRecordReleased(userId, params && params.recordId);
        if (!rec) return { result: { error: 'record not found' }, render: 'text' };
        return { result: rec, render: 'release_records' };
      }
      default:
        return { result: { error: `unknown tool: ${name}` }, render: 'text' };
    }
  }

  return { tools, execute };
}

module.exports = { buildHealthcareTools };
