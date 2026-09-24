const ipcStatuses = new Set([
  'ready', 'accepted', 'rejected-capacity', 'obsolete-lifetime', 'empty', 'acknowledged', 'finalized',
  'unsupported', 'busy', 'cleaned', 'pending', 'clear', 'delivered', 'no-work', 'unavailable', 'advice', 'stats',
]);

const ipcStatusLabel = value => typeof value === 'string' && ipcStatuses.has(value) ? value : 'other';

module.exports = { ipcStatusLabel };
