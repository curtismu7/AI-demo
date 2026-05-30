'use strict';

const path = require('path');
const fs = require('fs');

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));

/**
 * Per-vertical healthcare data store. Genuine healthcare objects (patient
 * records, appointments, coverage, claims) keyed by userId — NOT relabeled
 * banking accounts. Each user gets a deep clone of the seed on first access.
 */
function createHealthcareStore() {
  const byUser = new Map(); // userId -> cloned seed object

  function get(userId) {
    if (!byUser.has(userId)) {
      byUser.set(userId, structuredClone(SEED));
    }
    return byUser.get(userId);
  }

  let seq = 0;
  function bookAppointment(userId, { provider, clinic, when, reason }) {
    const data = get(userId);
    seq += 1;
    const appt = { id: `appt-new-${seq}`, provider, clinic, when, reason, status: 'Confirmed' };
    data.appointments.push(appt);
    return appt;
  }

  function markRecordReleased(userId, recordId) {
    const data = get(userId);
    const rec = data.patientRecords.find((r) => r.id === recordId);
    if (!rec) return null;
    rec.status = 'Released';
    return rec;
  }

  return { get, bookAppointment, markRecordReleased };
}

module.exports = { createHealthcareStore };
