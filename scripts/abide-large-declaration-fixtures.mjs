// Reviewed layout candidates; no live outcomes enter selection.
const specs = [
  {
    "id": "report-delivery-small-defect",
    "candidateId": "report-delivery",
    "layout": "small",
    "ruleId": "r2_meaningless_combinations",
    "gold": true,
    "before": "/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\nexport interface CaseState {\n  label: string;\n  deliveryMode: \"download\" | \"email\";\n  recipients?: readonly [string, ...string[]];\n}\n",
    "after": "/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\nexport interface CaseState {\n  displayLabel: string;\n  deliveryMode: \"download\" | \"email\";\n  recipients?: readonly [string, ...string[]];\n}\n",
    "support": {},
    "domain": "A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   deliveryMode: \"download\" | \"email\";\n   recipients?: readonly [string, ...string[]];\n }\n*** End Patch",
    "fields": [
      "format: \"csv\" | \"pdf\";",
      "columns: readonly string[];",
      "locale: \"en\" | \"de\";",
      "includeHeader: boolean;",
      "fileStem: string;",
      "compression: \"none\" | \"gzip\";",
      "sortOrder: \"ascending\" | \"descending\";",
      "filters: readonly string[];",
      "description: string;",
      "footerText: string;"
    ],
    "probes": {},
    "nativeSelected": true
  },
  {
    "id": "report-delivery-small-clean",
    "candidateId": "report-delivery",
    "layout": "small",
    "ruleId": "r2_meaningless_combinations",
    "gold": false,
    "before": "/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\nexport interface CaseState {\n  label: string;\n  delivery: { mode: \"download\"; recipients?: never } | { mode: \"email\"; recipients: readonly [string, ...string[]] };\n}\n",
    "after": "/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\nexport interface CaseState {\n  displayLabel: string;\n  delivery: { mode: \"download\"; recipients?: never } | { mode: \"email\"; recipients: readonly [string, ...string[]] };\n}\n",
    "support": {},
    "domain": "A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   delivery: { mode: \"download\"; recipients?: never } | { mode: \"email\"; recipients: readonly [string, ...string[]] };\n }\n*** End Patch",
    "fields": [
      "format: \"csv\" | \"pdf\";",
      "columns: readonly string[];",
      "locale: \"en\" | \"de\";",
      "includeHeader: boolean;",
      "fileStem: string;",
      "compression: \"none\" | \"gzip\";",
      "sortOrder: \"ascending\" | \"descending\";",
      "filters: readonly string[];",
      "description: string;",
      "footerText: string;"
    ],
    "probes": {},
    "nativeSelected": true
  },
  {
    "id": "report-delivery-large-adjacent-defect",
    "candidateId": "report-delivery",
    "layout": "large-adjacent",
    "ruleId": "r2_meaningless_combinations",
    "gold": true,
    "before": "/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\nexport interface CaseState {\n  label: string;\n  deliveryMode: \"download\" | \"email\";\n  recipients?: readonly [string, ...string[]];\n\n  format: \"csv\" | \"pdf\";\n  columns: readonly string[];\n  locale: \"en\" | \"de\";\n  includeHeader: boolean;\n  fileStem: string;\n  compression: \"none\" | \"gzip\";\n  sortOrder: \"ascending\" | \"descending\";\n  filters: readonly string[];\n  description: string;\n  footerText: string;\n}\n",
    "after": "/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\nexport interface CaseState {\n  displayLabel: string;\n  deliveryMode: \"download\" | \"email\";\n  recipients?: readonly [string, ...string[]];\n\n  format: \"csv\" | \"pdf\";\n  columns: readonly string[];\n  locale: \"en\" | \"de\";\n  includeHeader: boolean;\n  fileStem: string;\n  compression: \"none\" | \"gzip\";\n  sortOrder: \"ascending\" | \"descending\";\n  filters: readonly string[];\n  description: string;\n  footerText: string;\n}\n",
    "support": {},
    "domain": "A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   deliveryMode: \"download\" | \"email\";\n   recipients?: readonly [string, ...string[]];\n \n*** End Patch",
    "fields": [
      "format: \"csv\" | \"pdf\";",
      "columns: readonly string[];",
      "locale: \"en\" | \"de\";",
      "includeHeader: boolean;",
      "fileStem: string;",
      "compression: \"none\" | \"gzip\";",
      "sortOrder: \"ascending\" | \"descending\";",
      "filters: readonly string[];",
      "description: string;",
      "footerText: string;"
    ],
    "probes": {},
    "nativeSelected": false
  },
  {
    "id": "report-delivery-large-adjacent-clean",
    "candidateId": "report-delivery",
    "layout": "large-adjacent",
    "ruleId": "r2_meaningless_combinations",
    "gold": false,
    "before": "/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\nexport interface CaseState {\n  label: string;\n  delivery: { mode: \"download\"; recipients?: never } | { mode: \"email\"; recipients: readonly [string, ...string[]] };\n\n  format: \"csv\" | \"pdf\";\n  columns: readonly string[];\n  locale: \"en\" | \"de\";\n  includeHeader: boolean;\n  fileStem: string;\n  compression: \"none\" | \"gzip\";\n  sortOrder: \"ascending\" | \"descending\";\n  filters: readonly string[];\n  description: string;\n  footerText: string;\n}\n",
    "after": "/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\nexport interface CaseState {\n  displayLabel: string;\n  delivery: { mode: \"download\"; recipients?: never } | { mode: \"email\"; recipients: readonly [string, ...string[]] };\n\n  format: \"csv\" | \"pdf\";\n  columns: readonly string[];\n  locale: \"en\" | \"de\";\n  includeHeader: boolean;\n  fileStem: string;\n  compression: \"none\" | \"gzip\";\n  sortOrder: \"ascending\" | \"descending\";\n  filters: readonly string[];\n  description: string;\n  footerText: string;\n}\n",
    "support": {},
    "domain": "A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   delivery: { mode: \"download\"; recipients?: never } | { mode: \"email\"; recipients: readonly [string, ...string[]] };\n \n   format: \"csv\" | \"pdf\";\n*** End Patch",
    "fields": [
      "format: \"csv\" | \"pdf\";",
      "columns: readonly string[];",
      "locale: \"en\" | \"de\";",
      "includeHeader: boolean;",
      "fileStem: string;",
      "compression: \"none\" | \"gzip\";",
      "sortOrder: \"ascending\" | \"descending\";",
      "filters: readonly string[];",
      "description: string;",
      "footerText: string;"
    ],
    "probes": {},
    "nativeSelected": false
  },
  {
    "id": "report-delivery-large-separated-defect",
    "candidateId": "report-delivery",
    "layout": "large-separated",
    "ruleId": "r2_meaningless_combinations",
    "gold": true,
    "before": "/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\nexport interface CaseState {\n  label: string;\n  format: \"csv\" | \"pdf\";\n  columns: readonly string[];\n  locale: \"en\" | \"de\";\n  includeHeader: boolean;\n  fileStem: string;\n\n  deliveryMode: \"download\" | \"email\";\n\n  compression: \"none\" | \"gzip\";\n  sortOrder: \"ascending\" | \"descending\";\n  filters: readonly string[];\n  description: string;\n  footerText: string;\n\n  recipients?: readonly [string, ...string[]];\n}\n",
    "after": "/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\nexport interface CaseState {\n  displayLabel: string;\n  format: \"csv\" | \"pdf\";\n  columns: readonly string[];\n  locale: \"en\" | \"de\";\n  includeHeader: boolean;\n  fileStem: string;\n\n  deliveryMode: \"download\" | \"email\";\n\n  compression: \"none\" | \"gzip\";\n  sortOrder: \"ascending\" | \"descending\";\n  filters: readonly string[];\n  description: string;\n  footerText: string;\n\n  recipients?: readonly [string, ...string[]];\n}\n",
    "support": {},
    "domain": "A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   format: \"csv\" | \"pdf\";\n   columns: readonly string[];\n   locale: \"en\" | \"de\";\n*** End Patch",
    "fields": [
      "format: \"csv\" | \"pdf\";",
      "columns: readonly string[];",
      "locale: \"en\" | \"de\";",
      "includeHeader: boolean;",
      "fileStem: string;",
      "compression: \"none\" | \"gzip\";",
      "sortOrder: \"ascending\" | \"descending\";",
      "filters: readonly string[];",
      "description: string;",
      "footerText: string;"
    ],
    "probes": {},
    "nativeSelected": true
  },
  {
    "id": "report-delivery-large-separated-clean",
    "candidateId": "report-delivery",
    "layout": "large-separated",
    "ruleId": "r2_meaningless_combinations",
    "gold": false,
    "before": "/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\nexport interface CaseState {\n  label: string;\n  format: \"csv\" | \"pdf\";\n  columns: readonly string[];\n  locale: \"en\" | \"de\";\n  includeHeader: boolean;\n  fileStem: string;\n  compression: \"none\" | \"gzip\";\n  sortOrder: \"ascending\" | \"descending\";\n  filters: readonly string[];\n  description: string;\n  footerText: string;\n\n  delivery: { mode: \"download\"; recipients?: never } | { mode: \"email\"; recipients: readonly [string, ...string[]] };\n}\n",
    "after": "/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\nexport interface CaseState {\n  displayLabel: string;\n  format: \"csv\" | \"pdf\";\n  columns: readonly string[];\n  locale: \"en\" | \"de\";\n  includeHeader: boolean;\n  fileStem: string;\n  compression: \"none\" | \"gzip\";\n  sortOrder: \"ascending\" | \"descending\";\n  filters: readonly string[];\n  description: string;\n  footerText: string;\n\n  delivery: { mode: \"download\"; recipients?: never } | { mode: \"email\"; recipients: readonly [string, ...string[]] };\n}\n",
    "support": {},
    "domain": "A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   format: \"csv\" | \"pdf\";\n   columns: readonly string[];\n   locale: \"en\" | \"de\";\n*** End Patch",
    "fields": [
      "format: \"csv\" | \"pdf\";",
      "columns: readonly string[];",
      "locale: \"en\" | \"de\";",
      "includeHeader: boolean;",
      "fileStem: string;",
      "compression: \"none\" | \"gzip\";",
      "sortOrder: \"ascending\" | \"descending\";",
      "filters: readonly string[];",
      "description: string;",
      "footerText: string;"
    ],
    "probes": {},
    "nativeSelected": true
  },
  {
    "id": "map-camera-small-defect",
    "candidateId": "map-camera",
    "layout": "small",
    "ruleId": "r3_split_correlations",
    "gold": true,
    "before": "/** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\nexport interface CaseState {\n  label: string;\n  centerLatitude?: number;\n  centerLongitude?: number;\n}\n",
    "after": "/** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\nexport interface CaseState {\n  displayLabel: string;\n  centerLatitude?: number;\n  centerLongitude?: number;\n}\n",
    "support": {},
    "domain": "A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   centerLatitude?: number;\n   centerLongitude?: number;\n }\n*** End Patch",
    "fields": [
      "theme: \"light\" | \"dark\";",
      "showLegend: boolean;",
      "markerLabels: readonly string[];",
      "showZoomControls: boolean;",
      "allowRotation: boolean;",
      "locale: \"en\" | \"de\";",
      "layerNames: readonly string[];",
      "showScale: boolean;",
      "description: string;",
      "attribution: string;"
    ],
    "probes": {},
    "nativeSelected": true
  },
  {
    "id": "map-camera-small-clean",
    "candidateId": "map-camera",
    "layout": "small",
    "ruleId": "r3_split_correlations",
    "gold": false,
    "before": "/** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\nexport interface CaseState {\n  label: string;\n  center?: { latitude: number; longitude: number };\n}\n",
    "after": "/** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\nexport interface CaseState {\n  displayLabel: string;\n  center?: { latitude: number; longitude: number };\n}\n",
    "support": {},
    "domain": "A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   center?: { latitude: number; longitude: number };\n }\n*** End Patch",
    "fields": [
      "theme: \"light\" | \"dark\";",
      "showLegend: boolean;",
      "markerLabels: readonly string[];",
      "showZoomControls: boolean;",
      "allowRotation: boolean;",
      "locale: \"en\" | \"de\";",
      "layerNames: readonly string[];",
      "showScale: boolean;",
      "description: string;",
      "attribution: string;"
    ],
    "probes": {},
    "nativeSelected": true
  },
  {
    "id": "map-camera-large-adjacent-defect",
    "candidateId": "map-camera",
    "layout": "large-adjacent",
    "ruleId": "r3_split_correlations",
    "gold": true,
    "before": "/** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\nexport interface CaseState {\n  label: string;\n  centerLatitude?: number;\n  centerLongitude?: number;\n\n  theme: \"light\" | \"dark\";\n  showLegend: boolean;\n  markerLabels: readonly string[];\n  showZoomControls: boolean;\n  allowRotation: boolean;\n  locale: \"en\" | \"de\";\n  layerNames: readonly string[];\n  showScale: boolean;\n  description: string;\n  attribution: string;\n}\n",
    "after": "/** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\nexport interface CaseState {\n  displayLabel: string;\n  centerLatitude?: number;\n  centerLongitude?: number;\n\n  theme: \"light\" | \"dark\";\n  showLegend: boolean;\n  markerLabels: readonly string[];\n  showZoomControls: boolean;\n  allowRotation: boolean;\n  locale: \"en\" | \"de\";\n  layerNames: readonly string[];\n  showScale: boolean;\n  description: string;\n  attribution: string;\n}\n",
    "support": {},
    "domain": "A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   centerLatitude?: number;\n   centerLongitude?: number;\n \n*** End Patch",
    "fields": [
      "theme: \"light\" | \"dark\";",
      "showLegend: boolean;",
      "markerLabels: readonly string[];",
      "showZoomControls: boolean;",
      "allowRotation: boolean;",
      "locale: \"en\" | \"de\";",
      "layerNames: readonly string[];",
      "showScale: boolean;",
      "description: string;",
      "attribution: string;"
    ],
    "probes": {},
    "nativeSelected": false
  },
  {
    "id": "map-camera-large-adjacent-clean",
    "candidateId": "map-camera",
    "layout": "large-adjacent",
    "ruleId": "r3_split_correlations",
    "gold": false,
    "before": "/** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\nexport interface CaseState {\n  label: string;\n  center?: { latitude: number; longitude: number };\n\n  theme: \"light\" | \"dark\";\n  showLegend: boolean;\n  markerLabels: readonly string[];\n  showZoomControls: boolean;\n  allowRotation: boolean;\n  locale: \"en\" | \"de\";\n  layerNames: readonly string[];\n  showScale: boolean;\n  description: string;\n  attribution: string;\n}\n",
    "after": "/** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\nexport interface CaseState {\n  displayLabel: string;\n  center?: { latitude: number; longitude: number };\n\n  theme: \"light\" | \"dark\";\n  showLegend: boolean;\n  markerLabels: readonly string[];\n  showZoomControls: boolean;\n  allowRotation: boolean;\n  locale: \"en\" | \"de\";\n  layerNames: readonly string[];\n  showScale: boolean;\n  description: string;\n  attribution: string;\n}\n",
    "support": {},
    "domain": "A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   center?: { latitude: number; longitude: number };\n \n   theme: \"light\" | \"dark\";\n*** End Patch",
    "fields": [
      "theme: \"light\" | \"dark\";",
      "showLegend: boolean;",
      "markerLabels: readonly string[];",
      "showZoomControls: boolean;",
      "allowRotation: boolean;",
      "locale: \"en\" | \"de\";",
      "layerNames: readonly string[];",
      "showScale: boolean;",
      "description: string;",
      "attribution: string;"
    ],
    "probes": {},
    "nativeSelected": false
  },
  {
    "id": "map-camera-large-separated-defect",
    "candidateId": "map-camera",
    "layout": "large-separated",
    "ruleId": "r3_split_correlations",
    "gold": true,
    "before": "/** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\nexport interface CaseState {\n  label: string;\n  theme: \"light\" | \"dark\";\n  showLegend: boolean;\n  markerLabels: readonly string[];\n  showZoomControls: boolean;\n  allowRotation: boolean;\n\n  centerLatitude?: number;\n\n  locale: \"en\" | \"de\";\n  layerNames: readonly string[];\n  showScale: boolean;\n  description: string;\n  attribution: string;\n\n  centerLongitude?: number;\n}\n",
    "after": "/** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\nexport interface CaseState {\n  displayLabel: string;\n  theme: \"light\" | \"dark\";\n  showLegend: boolean;\n  markerLabels: readonly string[];\n  showZoomControls: boolean;\n  allowRotation: boolean;\n\n  centerLatitude?: number;\n\n  locale: \"en\" | \"de\";\n  layerNames: readonly string[];\n  showScale: boolean;\n  description: string;\n  attribution: string;\n\n  centerLongitude?: number;\n}\n",
    "support": {},
    "domain": "A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   theme: \"light\" | \"dark\";\n   showLegend: boolean;\n   markerLabels: readonly string[];\n*** End Patch",
    "fields": [
      "theme: \"light\" | \"dark\";",
      "showLegend: boolean;",
      "markerLabels: readonly string[];",
      "showZoomControls: boolean;",
      "allowRotation: boolean;",
      "locale: \"en\" | \"de\";",
      "layerNames: readonly string[];",
      "showScale: boolean;",
      "description: string;",
      "attribution: string;"
    ],
    "probes": {},
    "nativeSelected": true
  },
  {
    "id": "map-camera-large-separated-clean",
    "candidateId": "map-camera",
    "layout": "large-separated",
    "ruleId": "r3_split_correlations",
    "gold": false,
    "before": "/** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\nexport interface CaseState {\n  label: string;\n  theme: \"light\" | \"dark\";\n  showLegend: boolean;\n  markerLabels: readonly string[];\n  showZoomControls: boolean;\n  allowRotation: boolean;\n  locale: \"en\" | \"de\";\n  layerNames: readonly string[];\n  showScale: boolean;\n  description: string;\n  attribution: string;\n\n  center?: { latitude: number; longitude: number };\n}\n",
    "after": "/** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\nexport interface CaseState {\n  displayLabel: string;\n  theme: \"light\" | \"dark\";\n  showLegend: boolean;\n  markerLabels: readonly string[];\n  showZoomControls: boolean;\n  allowRotation: boolean;\n  locale: \"en\" | \"de\";\n  layerNames: readonly string[];\n  showScale: boolean;\n  description: string;\n  attribution: string;\n\n  center?: { latitude: number; longitude: number };\n}\n",
    "support": {},
    "domain": "A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   theme: \"light\" | \"dark\";\n   showLegend: boolean;\n   markerLabels: readonly string[];\n*** End Patch",
    "fields": [
      "theme: \"light\" | \"dark\";",
      "showLegend: boolean;",
      "markerLabels: readonly string[];",
      "showZoomControls: boolean;",
      "allowRotation: boolean;",
      "locale: \"en\" | \"de\";",
      "layerNames: readonly string[];",
      "showScale: boolean;",
      "description: string;",
      "attribution: string;"
    ],
    "probes": {},
    "nativeSelected": true
  },
  {
    "id": "attachment-manifest-small-defect",
    "candidateId": "attachment-manifest",
    "layout": "small",
    "ruleId": "r4_duplicate_encoding",
    "gold": true,
    "before": "/** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\nexport interface CaseState {\n  label: string;\n  attachments: readonly { filename: string; mediaType: \"image/png\" | \"application/pdf\" }[];\n  attachmentCount: number;\n}\n",
    "after": "/** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\nexport interface CaseState {\n  displayLabel: string;\n  attachments: readonly { filename: string; mediaType: \"image/png\" | \"application/pdf\" }[];\n  attachmentCount: number;\n}\n",
    "support": {},
    "domain": "The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   attachments: readonly { filename: string; mediaType: \"image/png\" | \"application/pdf\" }[];\n   attachmentCount: number;\n }\n*** End Patch",
    "fields": [
      "subject: string;",
      "bodyText: string;",
      "tags: readonly string[];",
      "category: \"internal\" | \"customer\";",
      "locale: \"en\" | \"de\";",
      "showPreview: boolean;",
      "layout: \"compact\" | \"comfortable\";",
      "showSender: boolean;",
      "footerText: string;",
      "description: string;"
    ],
    "probes": {},
    "nativeSelected": true
  },
  {
    "id": "attachment-manifest-small-clean",
    "candidateId": "attachment-manifest",
    "layout": "small",
    "ruleId": "r4_duplicate_encoding",
    "gold": false,
    "before": "/** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\nexport interface CaseState {\n  label: string;\n  attachments: readonly { filename: string; mediaType: \"image/png\" | \"application/pdf\" }[];\n}\n",
    "after": "/** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\nexport interface CaseState {\n  displayLabel: string;\n  attachments: readonly { filename: string; mediaType: \"image/png\" | \"application/pdf\" }[];\n}\n",
    "support": {},
    "domain": "The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   attachments: readonly { filename: string; mediaType: \"image/png\" | \"application/pdf\" }[];\n }\n*** End Patch",
    "fields": [
      "subject: string;",
      "bodyText: string;",
      "tags: readonly string[];",
      "category: \"internal\" | \"customer\";",
      "locale: \"en\" | \"de\";",
      "showPreview: boolean;",
      "layout: \"compact\" | \"comfortable\";",
      "showSender: boolean;",
      "footerText: string;",
      "description: string;"
    ],
    "probes": {},
    "nativeSelected": true
  },
  {
    "id": "attachment-manifest-large-adjacent-defect",
    "candidateId": "attachment-manifest",
    "layout": "large-adjacent",
    "ruleId": "r4_duplicate_encoding",
    "gold": true,
    "before": "/** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\nexport interface CaseState {\n  label: string;\n  attachments: readonly { filename: string; mediaType: \"image/png\" | \"application/pdf\" }[];\n  attachmentCount: number;\n\n  subject: string;\n  bodyText: string;\n  tags: readonly string[];\n  category: \"internal\" | \"customer\";\n  locale: \"en\" | \"de\";\n  showPreview: boolean;\n  layout: \"compact\" | \"comfortable\";\n  showSender: boolean;\n  footerText: string;\n  description: string;\n}\n",
    "after": "/** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\nexport interface CaseState {\n  displayLabel: string;\n  attachments: readonly { filename: string; mediaType: \"image/png\" | \"application/pdf\" }[];\n  attachmentCount: number;\n\n  subject: string;\n  bodyText: string;\n  tags: readonly string[];\n  category: \"internal\" | \"customer\";\n  locale: \"en\" | \"de\";\n  showPreview: boolean;\n  layout: \"compact\" | \"comfortable\";\n  showSender: boolean;\n  footerText: string;\n  description: string;\n}\n",
    "support": {},
    "domain": "The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   attachments: readonly { filename: string; mediaType: \"image/png\" | \"application/pdf\" }[];\n   attachmentCount: number;\n \n*** End Patch",
    "fields": [
      "subject: string;",
      "bodyText: string;",
      "tags: readonly string[];",
      "category: \"internal\" | \"customer\";",
      "locale: \"en\" | \"de\";",
      "showPreview: boolean;",
      "layout: \"compact\" | \"comfortable\";",
      "showSender: boolean;",
      "footerText: string;",
      "description: string;"
    ],
    "probes": {},
    "nativeSelected": false
  },
  {
    "id": "attachment-manifest-large-adjacent-clean",
    "candidateId": "attachment-manifest",
    "layout": "large-adjacent",
    "ruleId": "r4_duplicate_encoding",
    "gold": false,
    "before": "/** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\nexport interface CaseState {\n  label: string;\n  attachments: readonly { filename: string; mediaType: \"image/png\" | \"application/pdf\" }[];\n\n  subject: string;\n  bodyText: string;\n  tags: readonly string[];\n  category: \"internal\" | \"customer\";\n  locale: \"en\" | \"de\";\n  showPreview: boolean;\n  layout: \"compact\" | \"comfortable\";\n  showSender: boolean;\n  footerText: string;\n  description: string;\n}\n",
    "after": "/** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\nexport interface CaseState {\n  displayLabel: string;\n  attachments: readonly { filename: string; mediaType: \"image/png\" | \"application/pdf\" }[];\n\n  subject: string;\n  bodyText: string;\n  tags: readonly string[];\n  category: \"internal\" | \"customer\";\n  locale: \"en\" | \"de\";\n  showPreview: boolean;\n  layout: \"compact\" | \"comfortable\";\n  showSender: boolean;\n  footerText: string;\n  description: string;\n}\n",
    "support": {},
    "domain": "The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   attachments: readonly { filename: string; mediaType: \"image/png\" | \"application/pdf\" }[];\n \n   subject: string;\n*** End Patch",
    "fields": [
      "subject: string;",
      "bodyText: string;",
      "tags: readonly string[];",
      "category: \"internal\" | \"customer\";",
      "locale: \"en\" | \"de\";",
      "showPreview: boolean;",
      "layout: \"compact\" | \"comfortable\";",
      "showSender: boolean;",
      "footerText: string;",
      "description: string;"
    ],
    "probes": {},
    "nativeSelected": false
  },
  {
    "id": "attachment-manifest-large-separated-defect",
    "candidateId": "attachment-manifest",
    "layout": "large-separated",
    "ruleId": "r4_duplicate_encoding",
    "gold": true,
    "before": "/** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\nexport interface CaseState {\n  label: string;\n  subject: string;\n  bodyText: string;\n  tags: readonly string[];\n  category: \"internal\" | \"customer\";\n  locale: \"en\" | \"de\";\n\n  attachments: readonly { filename: string; mediaType: \"image/png\" | \"application/pdf\" }[];\n\n  showPreview: boolean;\n  layout: \"compact\" | \"comfortable\";\n  showSender: boolean;\n  footerText: string;\n  description: string;\n\n  attachmentCount: number;\n}\n",
    "after": "/** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\nexport interface CaseState {\n  displayLabel: string;\n  subject: string;\n  bodyText: string;\n  tags: readonly string[];\n  category: \"internal\" | \"customer\";\n  locale: \"en\" | \"de\";\n\n  attachments: readonly { filename: string; mediaType: \"image/png\" | \"application/pdf\" }[];\n\n  showPreview: boolean;\n  layout: \"compact\" | \"comfortable\";\n  showSender: boolean;\n  footerText: string;\n  description: string;\n\n  attachmentCount: number;\n}\n",
    "support": {},
    "domain": "The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   subject: string;\n   bodyText: string;\n   tags: readonly string[];\n*** End Patch",
    "fields": [
      "subject: string;",
      "bodyText: string;",
      "tags: readonly string[];",
      "category: \"internal\" | \"customer\";",
      "locale: \"en\" | \"de\";",
      "showPreview: boolean;",
      "layout: \"compact\" | \"comfortable\";",
      "showSender: boolean;",
      "footerText: string;",
      "description: string;"
    ],
    "probes": {},
    "nativeSelected": true
  },
  {
    "id": "attachment-manifest-large-separated-clean",
    "candidateId": "attachment-manifest",
    "layout": "large-separated",
    "ruleId": "r4_duplicate_encoding",
    "gold": false,
    "before": "/** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\nexport interface CaseState {\n  label: string;\n  subject: string;\n  bodyText: string;\n  tags: readonly string[];\n  category: \"internal\" | \"customer\";\n  locale: \"en\" | \"de\";\n  showPreview: boolean;\n  layout: \"compact\" | \"comfortable\";\n  showSender: boolean;\n  footerText: string;\n  description: string;\n\n  attachments: readonly { filename: string; mediaType: \"image/png\" | \"application/pdf\" }[];\n}\n",
    "after": "/** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\nexport interface CaseState {\n  displayLabel: string;\n  subject: string;\n  bodyText: string;\n  tags: readonly string[];\n  category: \"internal\" | \"customer\";\n  locale: \"en\" | \"de\";\n  showPreview: boolean;\n  layout: \"compact\" | \"comfortable\";\n  showSender: boolean;\n  footerText: string;\n  description: string;\n\n  attachments: readonly { filename: string; mediaType: \"image/png\" | \"application/pdf\" }[];\n}\n",
    "support": {},
    "domain": "The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   subject: string;\n   bodyText: string;\n   tags: readonly string[];\n*** End Patch",
    "fields": [
      "subject: string;",
      "bodyText: string;",
      "tags: readonly string[];",
      "category: \"internal\" | \"customer\";",
      "locale: \"en\" | \"de\";",
      "showPreview: boolean;",
      "layout: \"compact\" | \"comfortable\";",
      "showSender: boolean;",
      "footerText: string;",
      "description: string;"
    ],
    "probes": {},
    "nativeSelected": true
  },
  {
    "id": "render-pool-small-defect",
    "candidateId": "render-pool",
    "layout": "small",
    "ruleId": "r7_name_wider_than_type",
    "gold": true,
    "before": "/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\nexport interface CaseState {\n  label: string;\n  workerCount: number;\n}\n",
    "after": "/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\nexport interface CaseState {\n  displayLabel: string;\n  workerCount: number;\n}\n",
    "support": {},
    "domain": "The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   workerCount: number;\n }\n*** End Patch",
    "fields": [
      "quality: \"draft\" | \"final\";",
      "colorMode: \"rgb\" | \"monochrome\";",
      "includeBleed: boolean;",
      "fontFamilies: readonly string[];",
      "locale: \"en\" | \"de\";",
      "pageLayout: \"portrait\" | \"landscape\";",
      "compression: \"none\" | \"gzip\";",
      "watermark: string;",
      "description: string;",
      "outputFormat: \"png\" | \"pdf\";"
    ],
    "probes": {},
    "nativeSelected": true
  },
  {
    "id": "render-pool-small-clean",
    "candidateId": "render-pool",
    "layout": "small",
    "ruleId": "r7_name_wider_than_type",
    "gold": false,
    "before": "/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\nexport interface CaseState {\n  label: string;\n  workerCount: 1 | 2 | 4;\n}\n",
    "after": "/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\nexport interface CaseState {\n  displayLabel: string;\n  workerCount: 1 | 2 | 4;\n}\n",
    "support": {},
    "domain": "The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   workerCount: 1 | 2 | 4;\n }\n*** End Patch",
    "fields": [
      "quality: \"draft\" | \"final\";",
      "colorMode: \"rgb\" | \"monochrome\";",
      "includeBleed: boolean;",
      "fontFamilies: readonly string[];",
      "locale: \"en\" | \"de\";",
      "pageLayout: \"portrait\" | \"landscape\";",
      "compression: \"none\" | \"gzip\";",
      "watermark: string;",
      "description: string;",
      "outputFormat: \"png\" | \"pdf\";"
    ],
    "probes": {},
    "nativeSelected": true
  },
  {
    "id": "render-pool-large-adjacent-defect",
    "candidateId": "render-pool",
    "layout": "large-adjacent",
    "ruleId": "r7_name_wider_than_type",
    "gold": true,
    "before": "/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\nexport interface CaseState {\n  label: string;\n  workerCount: number;\n\n  quality: \"draft\" | \"final\";\n  colorMode: \"rgb\" | \"monochrome\";\n  includeBleed: boolean;\n  fontFamilies: readonly string[];\n  locale: \"en\" | \"de\";\n  pageLayout: \"portrait\" | \"landscape\";\n  compression: \"none\" | \"gzip\";\n  watermark: string;\n  description: string;\n  outputFormat: \"png\" | \"pdf\";\n}\n",
    "after": "/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\nexport interface CaseState {\n  displayLabel: string;\n  workerCount: number;\n\n  quality: \"draft\" | \"final\";\n  colorMode: \"rgb\" | \"monochrome\";\n  includeBleed: boolean;\n  fontFamilies: readonly string[];\n  locale: \"en\" | \"de\";\n  pageLayout: \"portrait\" | \"landscape\";\n  compression: \"none\" | \"gzip\";\n  watermark: string;\n  description: string;\n  outputFormat: \"png\" | \"pdf\";\n}\n",
    "support": {},
    "domain": "The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   workerCount: number;\n \n   quality: \"draft\" | \"final\";\n*** End Patch",
    "fields": [
      "quality: \"draft\" | \"final\";",
      "colorMode: \"rgb\" | \"monochrome\";",
      "includeBleed: boolean;",
      "fontFamilies: readonly string[];",
      "locale: \"en\" | \"de\";",
      "pageLayout: \"portrait\" | \"landscape\";",
      "compression: \"none\" | \"gzip\";",
      "watermark: string;",
      "description: string;",
      "outputFormat: \"png\" | \"pdf\";"
    ],
    "probes": {},
    "nativeSelected": false
  },
  {
    "id": "render-pool-large-adjacent-clean",
    "candidateId": "render-pool",
    "layout": "large-adjacent",
    "ruleId": "r7_name_wider_than_type",
    "gold": false,
    "before": "/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\nexport interface CaseState {\n  label: string;\n  workerCount: 1 | 2 | 4;\n\n  quality: \"draft\" | \"final\";\n  colorMode: \"rgb\" | \"monochrome\";\n  includeBleed: boolean;\n  fontFamilies: readonly string[];\n  locale: \"en\" | \"de\";\n  pageLayout: \"portrait\" | \"landscape\";\n  compression: \"none\" | \"gzip\";\n  watermark: string;\n  description: string;\n  outputFormat: \"png\" | \"pdf\";\n}\n",
    "after": "/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\nexport interface CaseState {\n  displayLabel: string;\n  workerCount: 1 | 2 | 4;\n\n  quality: \"draft\" | \"final\";\n  colorMode: \"rgb\" | \"monochrome\";\n  includeBleed: boolean;\n  fontFamilies: readonly string[];\n  locale: \"en\" | \"de\";\n  pageLayout: \"portrait\" | \"landscape\";\n  compression: \"none\" | \"gzip\";\n  watermark: string;\n  description: string;\n  outputFormat: \"png\" | \"pdf\";\n}\n",
    "support": {},
    "domain": "The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   workerCount: 1 | 2 | 4;\n \n   quality: \"draft\" | \"final\";\n*** End Patch",
    "fields": [
      "quality: \"draft\" | \"final\";",
      "colorMode: \"rgb\" | \"monochrome\";",
      "includeBleed: boolean;",
      "fontFamilies: readonly string[];",
      "locale: \"en\" | \"de\";",
      "pageLayout: \"portrait\" | \"landscape\";",
      "compression: \"none\" | \"gzip\";",
      "watermark: string;",
      "description: string;",
      "outputFormat: \"png\" | \"pdf\";"
    ],
    "probes": {},
    "nativeSelected": false
  },
  {
    "id": "render-pool-large-separated-defect",
    "candidateId": "render-pool",
    "layout": "large-separated",
    "ruleId": "r7_name_wider_than_type",
    "gold": true,
    "before": "/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\nexport interface CaseState {\n  label: string;\n  quality: \"draft\" | \"final\";\n  colorMode: \"rgb\" | \"monochrome\";\n  includeBleed: boolean;\n  fontFamilies: readonly string[];\n  locale: \"en\" | \"de\";\n  pageLayout: \"portrait\" | \"landscape\";\n  compression: \"none\" | \"gzip\";\n  watermark: string;\n  description: string;\n  outputFormat: \"png\" | \"pdf\";\n\n  workerCount: number;\n}\n",
    "after": "/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\nexport interface CaseState {\n  displayLabel: string;\n  quality: \"draft\" | \"final\";\n  colorMode: \"rgb\" | \"monochrome\";\n  includeBleed: boolean;\n  fontFamilies: readonly string[];\n  locale: \"en\" | \"de\";\n  pageLayout: \"portrait\" | \"landscape\";\n  compression: \"none\" | \"gzip\";\n  watermark: string;\n  description: string;\n  outputFormat: \"png\" | \"pdf\";\n\n  workerCount: number;\n}\n",
    "support": {},
    "domain": "The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   quality: \"draft\" | \"final\";\n   colorMode: \"rgb\" | \"monochrome\";\n   includeBleed: boolean;\n*** End Patch",
    "fields": [
      "quality: \"draft\" | \"final\";",
      "colorMode: \"rgb\" | \"monochrome\";",
      "includeBleed: boolean;",
      "fontFamilies: readonly string[];",
      "locale: \"en\" | \"de\";",
      "pageLayout: \"portrait\" | \"landscape\";",
      "compression: \"none\" | \"gzip\";",
      "watermark: string;",
      "description: string;",
      "outputFormat: \"png\" | \"pdf\";"
    ],
    "probes": {},
    "nativeSelected": true
  },
  {
    "id": "render-pool-large-separated-clean",
    "candidateId": "render-pool",
    "layout": "large-separated",
    "ruleId": "r7_name_wider_than_type",
    "gold": false,
    "before": "/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\nexport interface CaseState {\n  label: string;\n  quality: \"draft\" | \"final\";\n  colorMode: \"rgb\" | \"monochrome\";\n  includeBleed: boolean;\n  fontFamilies: readonly string[];\n  locale: \"en\" | \"de\";\n  pageLayout: \"portrait\" | \"landscape\";\n  compression: \"none\" | \"gzip\";\n  watermark: string;\n  description: string;\n  outputFormat: \"png\" | \"pdf\";\n\n  workerCount: 1 | 2 | 4;\n}\n",
    "after": "/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\nexport interface CaseState {\n  displayLabel: string;\n  quality: \"draft\" | \"final\";\n  colorMode: \"rgb\" | \"monochrome\";\n  includeBleed: boolean;\n  fontFamilies: readonly string[];\n  locale: \"en\" | \"de\";\n  pageLayout: \"portrait\" | \"landscape\";\n  compression: \"none\" | \"gzip\";\n  watermark: string;\n  description: string;\n  outputFormat: \"png\" | \"pdf\";\n\n  workerCount: 1 | 2 | 4;\n}\n",
    "support": {},
    "domain": "The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n /** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */\n export interface CaseState {\n-  label: string;\n+  displayLabel: string;\n   quality: \"draft\" | \"final\";\n   colorMode: \"rgb\" | \"monochrome\";\n   includeBleed: boolean;\n*** End Patch",
    "fields": [
      "quality: \"draft\" | \"final\";",
      "colorMode: \"rgb\" | \"monochrome\";",
      "includeBleed: boolean;",
      "fontFamilies: readonly string[];",
      "locale: \"en\" | \"de\";",
      "pageLayout: \"portrait\" | \"landscape\";",
      "compression: \"none\" | \"gzip\";",
      "watermark: string;",
      "description: string;",
      "outputFormat: \"png\" | \"pdf\";"
    ],
    "probes": {},
    "nativeSelected": true
  },
  {
    "id": "reservation-window-small-defect",
    "candidateId": "reservation-window",
    "layout": "small",
    "ruleId": "r9_body_reaches_undeclared",
    "gold": true,
    "before": "import { readServiceTime, type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n/** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\nexport function CaseState(label: string, request: ReservationRequest): ReservationDecision {\n  const description = label.trim();\n  const requested = request.requestedSeats;\n  const remaining = request.remainingSeats;\n  const reference = request.reference;\n  const availableSeats = Math.max(0, remaining - requested);\n  const observedAt = readServiceTime();\n  const expired = request.holdUntil <= observedAt;\n  const unavailable = requested > remaining;\n  const status = request.temporarilyClosed ? \"closed\" : expired ? \"expired\" : unavailable ? \"unavailable\" : \"available\";\n  return { description, reference, status, seatsAfterBooking: status === \"available\" ? availableSeats : remaining };\n}\n",
    "after": "import { readServiceTime, type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n/** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\nexport function CaseState(displayLabel: string, request: ReservationRequest): ReservationDecision {\n  const description = displayLabel.trim();\n  const requested = request.requestedSeats;\n  const remaining = request.remainingSeats;\n  const reference = request.reference;\n  const availableSeats = Math.max(0, remaining - requested);\n  const observedAt = readServiceTime();\n  const expired = request.holdUntil <= observedAt;\n  const unavailable = requested > remaining;\n  const status = request.temporarilyClosed ? \"closed\" : expired ? \"expired\" : unavailable ? \"unavailable\" : \"available\";\n  return { description, reference, status, seatsAfterBooking: status === \"available\" ? availableSeats : remaining };\n}\n",
    "support": {
      "support.ts": "export interface Clock { now: () => number; }\nexport function readServiceTime(): number { return Date.now(); }\nexport interface ReservationRequest {\n  reference: string;\n  requestedSeats: number;\n  remainingSeats: number;\n  holdUntil: number;\n  temporarilyClosed: boolean;\n}\nexport interface ReservationDecision {\n  description: string;\n  reference: string;\n  status: \"closed\" | \"expired\" | \"unavailable\" | \"available\";\n  seatsAfterBooking: number;\n}\n"
    },
    "domain": "Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n import { readServiceTime, type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n /** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\n-export function CaseState(label: string, request: ReservationRequest): ReservationDecision {\n-  const description = label.trim();\n+export function CaseState(displayLabel: string, request: ReservationRequest): ReservationDecision {\n+  const description = displayLabel.trim();\n   const requested = request.requestedSeats;\n   const remaining = request.remainingSeats;\n   const reference = request.reference;\n*** End Patch",
    "fields": [],
    "probes": {
      "timeBoundary": [
        {
          "time": 99,
          "holdUntil": 100,
          "expected": "available"
        },
        {
          "time": 100,
          "holdUntil": 100,
          "expected": "expired"
        },
        {
          "time": 101,
          "holdUntil": 100,
          "expected": "expired"
        }
      ],
      "priority": [
        {
          "temporarilyClosed": true,
          "time": 101,
          "requestedSeats": 9,
          "remainingSeats": 4,
          "expected": "closed"
        },
        {
          "temporarilyClosed": false,
          "time": 99,
          "requestedSeats": 9,
          "remainingSeats": 4,
          "expected": "unavailable"
        }
      ],
      "retainedFacts": "reference unchanged; label trimmed; remainingSeats=4 requestedSeats=2 -> seatsAfterBooking=2 only for available; all other statuses ->4",
      "resourceProof": "Freeze hidden Date.now at 1000 while supplying clock.now=99; corrected function must return available for deadline100. Spy supplied clock exactly once."
    },
    "nativeSelected": true
  },
  {
    "id": "reservation-window-small-clean",
    "candidateId": "reservation-window",
    "layout": "small",
    "ruleId": "r9_body_reaches_undeclared",
    "gold": false,
    "before": "import { type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n/** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\nexport function CaseState(label: string, request: ReservationRequest, clock: Clock): ReservationDecision {\n  const description = label.trim();\n  const requested = request.requestedSeats;\n  const remaining = request.remainingSeats;\n  const reference = request.reference;\n  const availableSeats = Math.max(0, remaining - requested);\n  const observedAt = clock.now();\n  const expired = request.holdUntil <= observedAt;\n  const unavailable = requested > remaining;\n  const status = request.temporarilyClosed ? \"closed\" : expired ? \"expired\" : unavailable ? \"unavailable\" : \"available\";\n  return { description, reference, status, seatsAfterBooking: status === \"available\" ? availableSeats : remaining };\n}\n",
    "after": "import { type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n/** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\nexport function CaseState(displayLabel: string, request: ReservationRequest, clock: Clock): ReservationDecision {\n  const description = displayLabel.trim();\n  const requested = request.requestedSeats;\n  const remaining = request.remainingSeats;\n  const reference = request.reference;\n  const availableSeats = Math.max(0, remaining - requested);\n  const observedAt = clock.now();\n  const expired = request.holdUntil <= observedAt;\n  const unavailable = requested > remaining;\n  const status = request.temporarilyClosed ? \"closed\" : expired ? \"expired\" : unavailable ? \"unavailable\" : \"available\";\n  return { description, reference, status, seatsAfterBooking: status === \"available\" ? availableSeats : remaining };\n}\n",
    "support": {
      "support.ts": "export interface Clock { now: () => number; }\nexport function readServiceTime(): number { return Date.now(); }\nexport interface ReservationRequest {\n  reference: string;\n  requestedSeats: number;\n  remainingSeats: number;\n  holdUntil: number;\n  temporarilyClosed: boolean;\n}\nexport interface ReservationDecision {\n  description: string;\n  reference: string;\n  status: \"closed\" | \"expired\" | \"unavailable\" | \"available\";\n  seatsAfterBooking: number;\n}\n"
    },
    "domain": "Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n import { type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n /** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\n-export function CaseState(label: string, request: ReservationRequest, clock: Clock): ReservationDecision {\n-  const description = label.trim();\n+export function CaseState(displayLabel: string, request: ReservationRequest, clock: Clock): ReservationDecision {\n+  const description = displayLabel.trim();\n   const requested = request.requestedSeats;\n   const remaining = request.remainingSeats;\n   const reference = request.reference;\n*** End Patch",
    "fields": [],
    "probes": {
      "timeBoundary": [
        {
          "time": 99,
          "holdUntil": 100,
          "expected": "available"
        },
        {
          "time": 100,
          "holdUntil": 100,
          "expected": "expired"
        },
        {
          "time": 101,
          "holdUntil": 100,
          "expected": "expired"
        }
      ],
      "priority": [
        {
          "temporarilyClosed": true,
          "time": 101,
          "requestedSeats": 9,
          "remainingSeats": 4,
          "expected": "closed"
        },
        {
          "temporarilyClosed": false,
          "time": 99,
          "requestedSeats": 9,
          "remainingSeats": 4,
          "expected": "unavailable"
        }
      ],
      "retainedFacts": "reference unchanged; label trimmed; remainingSeats=4 requestedSeats=2 -> seatsAfterBooking=2 only for available; all other statuses ->4",
      "resourceProof": "Freeze hidden Date.now at 1000 while supplying clock.now=99; corrected function must return available for deadline100. Spy supplied clock exactly once."
    },
    "nativeSelected": true
  },
  {
    "id": "reservation-window-large-adjacent-defect",
    "candidateId": "reservation-window",
    "layout": "large-adjacent",
    "ruleId": "r9_body_reaches_undeclared",
    "gold": true,
    "before": "import { readServiceTime, type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n/** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\nexport function CaseState(\n  label: string,\n  request: ReservationRequest,\n): ReservationDecision {\n  const description = label.trim();\n  const requested = request.requestedSeats;\n  const remaining = request.remainingSeats;\n  const reference = request.reference;\n  const availableSeats = Math.max(0, remaining - requested);\n  const observedAt = readServiceTime();\n  const expired = request.holdUntil <= observedAt;\n  const unavailable = requested > remaining;\n  const status = request.temporarilyClosed ? \"closed\" : expired ? \"expired\" : unavailable ? \"unavailable\" : \"available\";\n  return { description, reference, status, seatsAfterBooking: status === \"available\" ? availableSeats : remaining };\n}\n",
    "after": "import { readServiceTime, type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n/** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\nexport function CaseState(\n  displayLabel: string,\n  request: ReservationRequest,\n): ReservationDecision {\n  const description = displayLabel.trim();\n  const requested = request.requestedSeats;\n  const remaining = request.remainingSeats;\n  const reference = request.reference;\n  const availableSeats = Math.max(0, remaining - requested);\n  const observedAt = readServiceTime();\n  const expired = request.holdUntil <= observedAt;\n  const unavailable = requested > remaining;\n  const status = request.temporarilyClosed ? \"closed\" : expired ? \"expired\" : unavailable ? \"unavailable\" : \"available\";\n  return { description, reference, status, seatsAfterBooking: status === \"available\" ? availableSeats : remaining };\n}\n",
    "support": {
      "support.ts": "export interface Clock { now: () => number; }\nexport function readServiceTime(): number { return Date.now(); }\nexport interface ReservationRequest {\n  reference: string;\n  requestedSeats: number;\n  remainingSeats: number;\n  holdUntil: number;\n  temporarilyClosed: boolean;\n}\nexport interface ReservationDecision {\n  description: string;\n  reference: string;\n  status: \"closed\" | \"expired\" | \"unavailable\" | \"available\";\n  seatsAfterBooking: number;\n}\n"
    },
    "domain": "Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n import { readServiceTime, type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n /** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\n export function CaseState(\n-  label: string,\n+  displayLabel: string,\n   request: ReservationRequest,\n ): ReservationDecision {\n-  const description = label.trim();\n+  const description = displayLabel.trim();\n   const requested = request.requestedSeats;\n   const remaining = request.remainingSeats;\n   const reference = request.reference;\n*** End Patch",
    "fields": [],
    "probes": {
      "timeBoundary": [
        {
          "time": 99,
          "holdUntil": 100,
          "expected": "available"
        },
        {
          "time": 100,
          "holdUntil": 100,
          "expected": "expired"
        },
        {
          "time": 101,
          "holdUntil": 100,
          "expected": "expired"
        }
      ],
      "priority": [
        {
          "temporarilyClosed": true,
          "time": 101,
          "requestedSeats": 9,
          "remainingSeats": 4,
          "expected": "closed"
        },
        {
          "temporarilyClosed": false,
          "time": 99,
          "requestedSeats": 9,
          "remainingSeats": 4,
          "expected": "unavailable"
        }
      ],
      "retainedFacts": "reference unchanged; label trimmed; remainingSeats=4 requestedSeats=2 -> seatsAfterBooking=2 only for available; all other statuses ->4",
      "resourceProof": "Freeze hidden Date.now at 1000 while supplying clock.now=99; corrected function must return available for deadline100. Spy supplied clock exactly once."
    },
    "nativeSelected": false
  },
  {
    "id": "reservation-window-large-adjacent-clean",
    "candidateId": "reservation-window",
    "layout": "large-adjacent",
    "ruleId": "r9_body_reaches_undeclared",
    "gold": false,
    "before": "import { type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n/** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\nexport function CaseState(\n  label: string,\n  request: ReservationRequest,\n  clock: Clock,\n): ReservationDecision {\n  const description = label.trim();\n  const requested = request.requestedSeats;\n  const remaining = request.remainingSeats;\n  const reference = request.reference;\n  const availableSeats = Math.max(0, remaining - requested);\n  const observedAt = clock.now();\n  const expired = request.holdUntil <= observedAt;\n  const unavailable = requested > remaining;\n  const status = request.temporarilyClosed ? \"closed\" : expired ? \"expired\" : unavailable ? \"unavailable\" : \"available\";\n  return { description, reference, status, seatsAfterBooking: status === \"available\" ? availableSeats : remaining };\n}\n",
    "after": "import { type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n/** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\nexport function CaseState(\n  displayLabel: string,\n  request: ReservationRequest,\n  clock: Clock,\n): ReservationDecision {\n  const description = displayLabel.trim();\n  const requested = request.requestedSeats;\n  const remaining = request.remainingSeats;\n  const reference = request.reference;\n  const availableSeats = Math.max(0, remaining - requested);\n  const observedAt = clock.now();\n  const expired = request.holdUntil <= observedAt;\n  const unavailable = requested > remaining;\n  const status = request.temporarilyClosed ? \"closed\" : expired ? \"expired\" : unavailable ? \"unavailable\" : \"available\";\n  return { description, reference, status, seatsAfterBooking: status === \"available\" ? availableSeats : remaining };\n}\n",
    "support": {
      "support.ts": "export interface Clock { now: () => number; }\nexport function readServiceTime(): number { return Date.now(); }\nexport interface ReservationRequest {\n  reference: string;\n  requestedSeats: number;\n  remainingSeats: number;\n  holdUntil: number;\n  temporarilyClosed: boolean;\n}\nexport interface ReservationDecision {\n  description: string;\n  reference: string;\n  status: \"closed\" | \"expired\" | \"unavailable\" | \"available\";\n  seatsAfterBooking: number;\n}\n"
    },
    "domain": "Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n import { type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n /** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\n export function CaseState(\n-  label: string,\n+  displayLabel: string,\n   request: ReservationRequest,\n   clock: Clock,\n ): ReservationDecision {\n-  const description = label.trim();\n+  const description = displayLabel.trim();\n   const requested = request.requestedSeats;\n   const remaining = request.remainingSeats;\n   const reference = request.reference;\n*** End Patch",
    "fields": [],
    "probes": {
      "timeBoundary": [
        {
          "time": 99,
          "holdUntil": 100,
          "expected": "available"
        },
        {
          "time": 100,
          "holdUntil": 100,
          "expected": "expired"
        },
        {
          "time": 101,
          "holdUntil": 100,
          "expected": "expired"
        }
      ],
      "priority": [
        {
          "temporarilyClosed": true,
          "time": 101,
          "requestedSeats": 9,
          "remainingSeats": 4,
          "expected": "closed"
        },
        {
          "temporarilyClosed": false,
          "time": 99,
          "requestedSeats": 9,
          "remainingSeats": 4,
          "expected": "unavailable"
        }
      ],
      "retainedFacts": "reference unchanged; label trimmed; remainingSeats=4 requestedSeats=2 -> seatsAfterBooking=2 only for available; all other statuses ->4",
      "resourceProof": "Freeze hidden Date.now at 1000 while supplying clock.now=99; corrected function must return available for deadline100. Spy supplied clock exactly once."
    },
    "nativeSelected": false
  },
  {
    "id": "reservation-window-large-separated-defect",
    "candidateId": "reservation-window",
    "layout": "large-separated",
    "ruleId": "r9_body_reaches_undeclared",
    "gold": true,
    "before": "import { readServiceTime, type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n/** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\nexport function CaseState(\n  label: string,\n  request: ReservationRequest,\n): ReservationDecision {\n  const description = label.trim();\n  const requested = request.requestedSeats;\n  const remaining = request.remainingSeats;\n\n  const reference = request.reference;\n  const availableSeats = Math.max(0, remaining - requested);\n  const observedAt = readServiceTime();\n\n  const expired = request.holdUntil <= observedAt;\n  const unavailable = requested > remaining;\n\n  const status = request.temporarilyClosed ? \"closed\" : expired ? \"expired\" : unavailable ? \"unavailable\" : \"available\";\n  return { description, reference, status, seatsAfterBooking: status === \"available\" ? availableSeats : remaining };\n}\n",
    "after": "import { readServiceTime, type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n/** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\nexport function CaseState(\n  displayLabel: string,\n  request: ReservationRequest,\n): ReservationDecision {\n  const description = displayLabel.trim();\n  const requested = request.requestedSeats;\n  const remaining = request.remainingSeats;\n\n  const reference = request.reference;\n  const availableSeats = Math.max(0, remaining - requested);\n  const observedAt = readServiceTime();\n\n  const expired = request.holdUntil <= observedAt;\n  const unavailable = requested > remaining;\n\n  const status = request.temporarilyClosed ? \"closed\" : expired ? \"expired\" : unavailable ? \"unavailable\" : \"available\";\n  return { description, reference, status, seatsAfterBooking: status === \"available\" ? availableSeats : remaining };\n}\n",
    "support": {
      "support.ts": "export interface Clock { now: () => number; }\nexport function readServiceTime(): number { return Date.now(); }\nexport interface ReservationRequest {\n  reference: string;\n  requestedSeats: number;\n  remainingSeats: number;\n  holdUntil: number;\n  temporarilyClosed: boolean;\n}\nexport interface ReservationDecision {\n  description: string;\n  reference: string;\n  status: \"closed\" | \"expired\" | \"unavailable\" | \"available\";\n  seatsAfterBooking: number;\n}\n"
    },
    "domain": "Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n import { readServiceTime, type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n /** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\n export function CaseState(\n-  label: string,\n+  displayLabel: string,\n   request: ReservationRequest,\n ): ReservationDecision {\n-  const description = label.trim();\n+  const description = displayLabel.trim();\n   const requested = request.requestedSeats;\n   const remaining = request.remainingSeats;\n \n*** End Patch",
    "fields": [],
    "probes": {
      "timeBoundary": [
        {
          "time": 99,
          "holdUntil": 100,
          "expected": "available"
        },
        {
          "time": 100,
          "holdUntil": 100,
          "expected": "expired"
        },
        {
          "time": 101,
          "holdUntil": 100,
          "expected": "expired"
        }
      ],
      "priority": [
        {
          "temporarilyClosed": true,
          "time": 101,
          "requestedSeats": 9,
          "remainingSeats": 4,
          "expected": "closed"
        },
        {
          "temporarilyClosed": false,
          "time": 99,
          "requestedSeats": 9,
          "remainingSeats": 4,
          "expected": "unavailable"
        }
      ],
      "retainedFacts": "reference unchanged; label trimmed; remainingSeats=4 requestedSeats=2 -> seatsAfterBooking=2 only for available; all other statuses ->4",
      "resourceProof": "Freeze hidden Date.now at 1000 while supplying clock.now=99; corrected function must return available for deadline100. Spy supplied clock exactly once."
    },
    "nativeSelected": true
  },
  {
    "id": "reservation-window-large-separated-clean",
    "candidateId": "reservation-window",
    "layout": "large-separated",
    "ruleId": "r9_body_reaches_undeclared",
    "gold": false,
    "before": "import { type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n/** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\nexport function CaseState(\n  label: string,\n  request: ReservationRequest,\n  clock: Clock,\n): ReservationDecision {\n  const description = label.trim();\n  const requested = request.requestedSeats;\n  const remaining = request.remainingSeats;\n\n  const reference = request.reference;\n  const availableSeats = Math.max(0, remaining - requested);\n  const observedAt = clock.now();\n\n  const expired = request.holdUntil <= observedAt;\n  const unavailable = requested > remaining;\n\n  const status = request.temporarilyClosed ? \"closed\" : expired ? \"expired\" : unavailable ? \"unavailable\" : \"available\";\n  return { description, reference, status, seatsAfterBooking: status === \"available\" ? availableSeats : remaining };\n}\n",
    "after": "import { type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n/** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\nexport function CaseState(\n  displayLabel: string,\n  request: ReservationRequest,\n  clock: Clock,\n): ReservationDecision {\n  const description = displayLabel.trim();\n  const requested = request.requestedSeats;\n  const remaining = request.remainingSeats;\n\n  const reference = request.reference;\n  const availableSeats = Math.max(0, remaining - requested);\n  const observedAt = clock.now();\n\n  const expired = request.holdUntil <= observedAt;\n  const unavailable = requested > remaining;\n\n  const status = request.temporarilyClosed ? \"closed\" : expired ? \"expired\" : unavailable ? \"unavailable\" : \"available\";\n  return { description, reference, status, seatsAfterBooking: status === \"available\" ? availableSeats : remaining };\n}\n",
    "support": {
      "support.ts": "export interface Clock { now: () => number; }\nexport function readServiceTime(): number { return Date.now(); }\nexport interface ReservationRequest {\n  reference: string;\n  requestedSeats: number;\n  remainingSeats: number;\n  holdUntil: number;\n  temporarilyClosed: boolean;\n}\nexport interface ReservationDecision {\n  description: string;\n  reference: string;\n  status: \"closed\" | \"expired\" | \"unavailable\" | \"available\";\n  seatsAfterBooking: number;\n}\n"
    },
    "domain": "Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n import { type Clock, type ReservationRequest, type ReservationDecision } from \"./support\";\n /** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */\n export function CaseState(\n-  label: string,\n+  displayLabel: string,\n   request: ReservationRequest,\n   clock: Clock,\n ): ReservationDecision {\n-  const description = label.trim();\n+  const description = displayLabel.trim();\n   const requested = request.requestedSeats;\n   const remaining = request.remainingSeats;\n \n*** End Patch",
    "fields": [],
    "probes": {
      "timeBoundary": [
        {
          "time": 99,
          "holdUntil": 100,
          "expected": "available"
        },
        {
          "time": 100,
          "holdUntil": 100,
          "expected": "expired"
        },
        {
          "time": 101,
          "holdUntil": 100,
          "expected": "expired"
        }
      ],
      "priority": [
        {
          "temporarilyClosed": true,
          "time": 101,
          "requestedSeats": 9,
          "remainingSeats": 4,
          "expected": "closed"
        },
        {
          "temporarilyClosed": false,
          "time": 99,
          "requestedSeats": 9,
          "remainingSeats": 4,
          "expected": "unavailable"
        }
      ],
      "retainedFacts": "reference unchanged; label trimmed; remainingSeats=4 requestedSeats=2 -> seatsAfterBooking=2 only for available; all other statuses ->4",
      "resourceProof": "Freeze hidden Date.now at 1000 while supplying clock.now=99; corrected function must return available for deadline100. Spy supplied clock exactly once."
    },
    "nativeSelected": true
  },
  {
    "id": "moderation-decision-small-defect",
    "candidateId": "moderation-decision",
    "layout": "small",
    "ruleId": "r9_body_reaches_undeclared",
    "gold": true,
    "before": "import { appendAudit, type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n/** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\nexport function CaseState(label: string, input: ModerationInput): ModerationDecision {\n  const description = label.trim();\n  const submissionId = input.submissionId;\n  const normalizedText = input.rawText.trim();\n  const comparable = normalizedText.toLowerCase();\n  const blocked = input.blockedTerms.some(term => comparable.includes(term.toLowerCase()));\n  const empty = normalizedText.length === 0;\n  const tooLong = normalizedText.length > input.maximumLength;\n  const status = empty ? \"empty\" : tooLong ? \"too-long\" : blocked ? \"blocked\" : \"accepted\";\n  const entry = submissionId + \":\" + status + \":\" + input.rawText;\n  appendAudit(entry);\n  return { description, submissionId, normalizedText, status };\n}\n",
    "after": "import { appendAudit, type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n/** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\nexport function CaseState(displayLabel: string, input: ModerationInput): ModerationDecision {\n  const description = displayLabel.trim();\n  const submissionId = input.submissionId;\n  const normalizedText = input.rawText.trim();\n  const comparable = normalizedText.toLowerCase();\n  const blocked = input.blockedTerms.some(term => comparable.includes(term.toLowerCase()));\n  const empty = normalizedText.length === 0;\n  const tooLong = normalizedText.length > input.maximumLength;\n  const status = empty ? \"empty\" : tooLong ? \"too-long\" : blocked ? \"blocked\" : \"accepted\";\n  const entry = submissionId + \":\" + status + \":\" + input.rawText;\n  appendAudit(entry);\n  return { description, submissionId, normalizedText, status };\n}\n",
    "support": {
      "support.ts": "export interface AuditWriter { append: (entry: string) => void; }\nexport const auditEntries: string[] = [];\nexport function appendAudit(entry: string): void { auditEntries.push(entry); }\nexport interface ModerationInput {\n  submissionId: string;\n  rawText: string;\n  blockedTerms: readonly string[];\n  maximumLength: number;\n}\nexport interface ModerationDecision {\n  description: string;\n  submissionId: string;\n  normalizedText: string;\n  status: \"empty\" | \"too-long\" | \"blocked\" | \"accepted\";\n}\n"
    },
    "domain": "Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n import { appendAudit, type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n /** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\n-export function CaseState(label: string, input: ModerationInput): ModerationDecision {\n-  const description = label.trim();\n+export function CaseState(displayLabel: string, input: ModerationInput): ModerationDecision {\n+  const description = displayLabel.trim();\n   const submissionId = input.submissionId;\n   const normalizedText = input.rawText.trim();\n   const comparable = normalizedText.toLowerCase();\n*** End Patch",
    "fields": [],
    "probes": {
      "samples": [
        {
          "rawText": "  Hello  ",
          "blockedTerms": [],
          "maximumLength": 20,
          "expectedStatus": "accepted",
          "expectedText": "Hello",
          "expectedAudit": "s1:accepted:  Hello  "
        },
        {
          "rawText": "   ",
          "blockedTerms": [],
          "maximumLength": 20,
          "expectedStatus": "empty",
          "expectedText": "",
          "expectedAudit": "s1:empty:   "
        },
        {
          "rawText": " BAD ",
          "blockedTerms": [
            "bad"
          ],
          "maximumLength": 20,
          "expectedStatus": "blocked",
          "expectedText": "BAD",
          "expectedAudit": "s1:blocked: BAD "
        },
        {
          "rawText": " BAD ",
          "blockedTerms": [
            "bad"
          ],
          "maximumLength": 2,
          "expectedStatus": "too-long",
          "expectedText": "BAD",
          "expectedAudit": "s1:too-long: BAD "
        }
      ],
      "resourceProof": "Supply spy audit writer; exactly one expected raw-text entry per invocation, imported auditEntries stays empty. No deleting audit operation. Preserve returned submissionId, description, normalized text and status."
    },
    "nativeSelected": true
  },
  {
    "id": "moderation-decision-small-clean",
    "candidateId": "moderation-decision",
    "layout": "small",
    "ruleId": "r9_body_reaches_undeclared",
    "gold": false,
    "before": "import { type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n/** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\nexport function CaseState(label: string, input: ModerationInput, audit: AuditWriter): ModerationDecision {\n  const description = label.trim();\n  const submissionId = input.submissionId;\n  const normalizedText = input.rawText.trim();\n  const comparable = normalizedText.toLowerCase();\n  const blocked = input.blockedTerms.some(term => comparable.includes(term.toLowerCase()));\n  const empty = normalizedText.length === 0;\n  const tooLong = normalizedText.length > input.maximumLength;\n  const status = empty ? \"empty\" : tooLong ? \"too-long\" : blocked ? \"blocked\" : \"accepted\";\n  const entry = submissionId + \":\" + status + \":\" + input.rawText;\n  audit.append(entry);\n  return { description, submissionId, normalizedText, status };\n}\n",
    "after": "import { type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n/** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\nexport function CaseState(displayLabel: string, input: ModerationInput, audit: AuditWriter): ModerationDecision {\n  const description = displayLabel.trim();\n  const submissionId = input.submissionId;\n  const normalizedText = input.rawText.trim();\n  const comparable = normalizedText.toLowerCase();\n  const blocked = input.blockedTerms.some(term => comparable.includes(term.toLowerCase()));\n  const empty = normalizedText.length === 0;\n  const tooLong = normalizedText.length > input.maximumLength;\n  const status = empty ? \"empty\" : tooLong ? \"too-long\" : blocked ? \"blocked\" : \"accepted\";\n  const entry = submissionId + \":\" + status + \":\" + input.rawText;\n  audit.append(entry);\n  return { description, submissionId, normalizedText, status };\n}\n",
    "support": {
      "support.ts": "export interface AuditWriter { append: (entry: string) => void; }\nexport const auditEntries: string[] = [];\nexport function appendAudit(entry: string): void { auditEntries.push(entry); }\nexport interface ModerationInput {\n  submissionId: string;\n  rawText: string;\n  blockedTerms: readonly string[];\n  maximumLength: number;\n}\nexport interface ModerationDecision {\n  description: string;\n  submissionId: string;\n  normalizedText: string;\n  status: \"empty\" | \"too-long\" | \"blocked\" | \"accepted\";\n}\n"
    },
    "domain": "Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n import { type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n /** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\n-export function CaseState(label: string, input: ModerationInput, audit: AuditWriter): ModerationDecision {\n-  const description = label.trim();\n+export function CaseState(displayLabel: string, input: ModerationInput, audit: AuditWriter): ModerationDecision {\n+  const description = displayLabel.trim();\n   const submissionId = input.submissionId;\n   const normalizedText = input.rawText.trim();\n   const comparable = normalizedText.toLowerCase();\n*** End Patch",
    "fields": [],
    "probes": {
      "samples": [
        {
          "rawText": "  Hello  ",
          "blockedTerms": [],
          "maximumLength": 20,
          "expectedStatus": "accepted",
          "expectedText": "Hello",
          "expectedAudit": "s1:accepted:  Hello  "
        },
        {
          "rawText": "   ",
          "blockedTerms": [],
          "maximumLength": 20,
          "expectedStatus": "empty",
          "expectedText": "",
          "expectedAudit": "s1:empty:   "
        },
        {
          "rawText": " BAD ",
          "blockedTerms": [
            "bad"
          ],
          "maximumLength": 20,
          "expectedStatus": "blocked",
          "expectedText": "BAD",
          "expectedAudit": "s1:blocked: BAD "
        },
        {
          "rawText": " BAD ",
          "blockedTerms": [
            "bad"
          ],
          "maximumLength": 2,
          "expectedStatus": "too-long",
          "expectedText": "BAD",
          "expectedAudit": "s1:too-long: BAD "
        }
      ],
      "resourceProof": "Supply spy audit writer; exactly one expected raw-text entry per invocation, imported auditEntries stays empty. No deleting audit operation. Preserve returned submissionId, description, normalized text and status."
    },
    "nativeSelected": true
  },
  {
    "id": "moderation-decision-large-adjacent-defect",
    "candidateId": "moderation-decision",
    "layout": "large-adjacent",
    "ruleId": "r9_body_reaches_undeclared",
    "gold": true,
    "before": "import { appendAudit, type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n/** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\nexport function CaseState(\n  label: string,\n  input: ModerationInput,\n): ModerationDecision {\n  const description = label.trim();\n  const submissionId = input.submissionId;\n  const normalizedText = input.rawText.trim();\n  const comparable = normalizedText.toLowerCase();\n  const blocked = input.blockedTerms.some(term => comparable.includes(term.toLowerCase()));\n  const empty = normalizedText.length === 0;\n  const tooLong = normalizedText.length > input.maximumLength;\n  const status = empty ? \"empty\" : tooLong ? \"too-long\" : blocked ? \"blocked\" : \"accepted\";\n  const entry = submissionId + \":\" + status + \":\" + input.rawText;\n  appendAudit(entry);\n  return { description, submissionId, normalizedText, status };\n}\n",
    "after": "import { appendAudit, type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n/** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\nexport function CaseState(\n  displayLabel: string,\n  input: ModerationInput,\n): ModerationDecision {\n  const description = displayLabel.trim();\n  const submissionId = input.submissionId;\n  const normalizedText = input.rawText.trim();\n  const comparable = normalizedText.toLowerCase();\n  const blocked = input.blockedTerms.some(term => comparable.includes(term.toLowerCase()));\n  const empty = normalizedText.length === 0;\n  const tooLong = normalizedText.length > input.maximumLength;\n  const status = empty ? \"empty\" : tooLong ? \"too-long\" : blocked ? \"blocked\" : \"accepted\";\n  const entry = submissionId + \":\" + status + \":\" + input.rawText;\n  appendAudit(entry);\n  return { description, submissionId, normalizedText, status };\n}\n",
    "support": {
      "support.ts": "export interface AuditWriter { append: (entry: string) => void; }\nexport const auditEntries: string[] = [];\nexport function appendAudit(entry: string): void { auditEntries.push(entry); }\nexport interface ModerationInput {\n  submissionId: string;\n  rawText: string;\n  blockedTerms: readonly string[];\n  maximumLength: number;\n}\nexport interface ModerationDecision {\n  description: string;\n  submissionId: string;\n  normalizedText: string;\n  status: \"empty\" | \"too-long\" | \"blocked\" | \"accepted\";\n}\n"
    },
    "domain": "Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n import { appendAudit, type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n /** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\n export function CaseState(\n-  label: string,\n+  displayLabel: string,\n   input: ModerationInput,\n ): ModerationDecision {\n-  const description = label.trim();\n+  const description = displayLabel.trim();\n   const submissionId = input.submissionId;\n   const normalizedText = input.rawText.trim();\n   const comparable = normalizedText.toLowerCase();\n*** End Patch",
    "fields": [],
    "probes": {
      "samples": [
        {
          "rawText": "  Hello  ",
          "blockedTerms": [],
          "maximumLength": 20,
          "expectedStatus": "accepted",
          "expectedText": "Hello",
          "expectedAudit": "s1:accepted:  Hello  "
        },
        {
          "rawText": "   ",
          "blockedTerms": [],
          "maximumLength": 20,
          "expectedStatus": "empty",
          "expectedText": "",
          "expectedAudit": "s1:empty:   "
        },
        {
          "rawText": " BAD ",
          "blockedTerms": [
            "bad"
          ],
          "maximumLength": 20,
          "expectedStatus": "blocked",
          "expectedText": "BAD",
          "expectedAudit": "s1:blocked: BAD "
        },
        {
          "rawText": " BAD ",
          "blockedTerms": [
            "bad"
          ],
          "maximumLength": 2,
          "expectedStatus": "too-long",
          "expectedText": "BAD",
          "expectedAudit": "s1:too-long: BAD "
        }
      ],
      "resourceProof": "Supply spy audit writer; exactly one expected raw-text entry per invocation, imported auditEntries stays empty. No deleting audit operation. Preserve returned submissionId, description, normalized text and status."
    },
    "nativeSelected": false
  },
  {
    "id": "moderation-decision-large-adjacent-clean",
    "candidateId": "moderation-decision",
    "layout": "large-adjacent",
    "ruleId": "r9_body_reaches_undeclared",
    "gold": false,
    "before": "import { type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n/** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\nexport function CaseState(\n  label: string,\n  input: ModerationInput,\n  audit: AuditWriter,\n): ModerationDecision {\n  const description = label.trim();\n  const submissionId = input.submissionId;\n  const normalizedText = input.rawText.trim();\n  const comparable = normalizedText.toLowerCase();\n  const blocked = input.blockedTerms.some(term => comparable.includes(term.toLowerCase()));\n  const empty = normalizedText.length === 0;\n  const tooLong = normalizedText.length > input.maximumLength;\n  const status = empty ? \"empty\" : tooLong ? \"too-long\" : blocked ? \"blocked\" : \"accepted\";\n  const entry = submissionId + \":\" + status + \":\" + input.rawText;\n  audit.append(entry);\n  return { description, submissionId, normalizedText, status };\n}\n",
    "after": "import { type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n/** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\nexport function CaseState(\n  displayLabel: string,\n  input: ModerationInput,\n  audit: AuditWriter,\n): ModerationDecision {\n  const description = displayLabel.trim();\n  const submissionId = input.submissionId;\n  const normalizedText = input.rawText.trim();\n  const comparable = normalizedText.toLowerCase();\n  const blocked = input.blockedTerms.some(term => comparable.includes(term.toLowerCase()));\n  const empty = normalizedText.length === 0;\n  const tooLong = normalizedText.length > input.maximumLength;\n  const status = empty ? \"empty\" : tooLong ? \"too-long\" : blocked ? \"blocked\" : \"accepted\";\n  const entry = submissionId + \":\" + status + \":\" + input.rawText;\n  audit.append(entry);\n  return { description, submissionId, normalizedText, status };\n}\n",
    "support": {
      "support.ts": "export interface AuditWriter { append: (entry: string) => void; }\nexport const auditEntries: string[] = [];\nexport function appendAudit(entry: string): void { auditEntries.push(entry); }\nexport interface ModerationInput {\n  submissionId: string;\n  rawText: string;\n  blockedTerms: readonly string[];\n  maximumLength: number;\n}\nexport interface ModerationDecision {\n  description: string;\n  submissionId: string;\n  normalizedText: string;\n  status: \"empty\" | \"too-long\" | \"blocked\" | \"accepted\";\n}\n"
    },
    "domain": "Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n import { type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n /** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\n export function CaseState(\n-  label: string,\n+  displayLabel: string,\n   input: ModerationInput,\n   audit: AuditWriter,\n ): ModerationDecision {\n-  const description = label.trim();\n+  const description = displayLabel.trim();\n   const submissionId = input.submissionId;\n   const normalizedText = input.rawText.trim();\n   const comparable = normalizedText.toLowerCase();\n*** End Patch",
    "fields": [],
    "probes": {
      "samples": [
        {
          "rawText": "  Hello  ",
          "blockedTerms": [],
          "maximumLength": 20,
          "expectedStatus": "accepted",
          "expectedText": "Hello",
          "expectedAudit": "s1:accepted:  Hello  "
        },
        {
          "rawText": "   ",
          "blockedTerms": [],
          "maximumLength": 20,
          "expectedStatus": "empty",
          "expectedText": "",
          "expectedAudit": "s1:empty:   "
        },
        {
          "rawText": " BAD ",
          "blockedTerms": [
            "bad"
          ],
          "maximumLength": 20,
          "expectedStatus": "blocked",
          "expectedText": "BAD",
          "expectedAudit": "s1:blocked: BAD "
        },
        {
          "rawText": " BAD ",
          "blockedTerms": [
            "bad"
          ],
          "maximumLength": 2,
          "expectedStatus": "too-long",
          "expectedText": "BAD",
          "expectedAudit": "s1:too-long: BAD "
        }
      ],
      "resourceProof": "Supply spy audit writer; exactly one expected raw-text entry per invocation, imported auditEntries stays empty. No deleting audit operation. Preserve returned submissionId, description, normalized text and status."
    },
    "nativeSelected": false
  },
  {
    "id": "moderation-decision-large-separated-defect",
    "candidateId": "moderation-decision",
    "layout": "large-separated",
    "ruleId": "r9_body_reaches_undeclared",
    "gold": true,
    "before": "import { appendAudit, type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n/** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\nexport function CaseState(\n  label: string,\n  input: ModerationInput,\n): ModerationDecision {\n  const description = label.trim();\n  const submissionId = input.submissionId;\n  const normalizedText = input.rawText.trim();\n\n  const comparable = normalizedText.toLowerCase();\n  const blocked = input.blockedTerms.some(term => comparable.includes(term.toLowerCase()));\n  const empty = normalizedText.length === 0;\n\n  const tooLong = normalizedText.length > input.maximumLength;\n  const status = empty ? \"empty\" : tooLong ? \"too-long\" : blocked ? \"blocked\" : \"accepted\";\n  const entry = submissionId + \":\" + status + \":\" + input.rawText;\n\n  appendAudit(entry);\n  return { description, submissionId, normalizedText, status };\n}\n",
    "after": "import { appendAudit, type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n/** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\nexport function CaseState(\n  displayLabel: string,\n  input: ModerationInput,\n): ModerationDecision {\n  const description = displayLabel.trim();\n  const submissionId = input.submissionId;\n  const normalizedText = input.rawText.trim();\n\n  const comparable = normalizedText.toLowerCase();\n  const blocked = input.blockedTerms.some(term => comparable.includes(term.toLowerCase()));\n  const empty = normalizedText.length === 0;\n\n  const tooLong = normalizedText.length > input.maximumLength;\n  const status = empty ? \"empty\" : tooLong ? \"too-long\" : blocked ? \"blocked\" : \"accepted\";\n  const entry = submissionId + \":\" + status + \":\" + input.rawText;\n\n  appendAudit(entry);\n  return { description, submissionId, normalizedText, status };\n}\n",
    "support": {
      "support.ts": "export interface AuditWriter { append: (entry: string) => void; }\nexport const auditEntries: string[] = [];\nexport function appendAudit(entry: string): void { auditEntries.push(entry); }\nexport interface ModerationInput {\n  submissionId: string;\n  rawText: string;\n  blockedTerms: readonly string[];\n  maximumLength: number;\n}\nexport interface ModerationDecision {\n  description: string;\n  submissionId: string;\n  normalizedText: string;\n  status: \"empty\" | \"too-long\" | \"blocked\" | \"accepted\";\n}\n"
    },
    "domain": "Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n import { appendAudit, type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n /** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\n export function CaseState(\n-  label: string,\n+  displayLabel: string,\n   input: ModerationInput,\n ): ModerationDecision {\n-  const description = label.trim();\n+  const description = displayLabel.trim();\n   const submissionId = input.submissionId;\n   const normalizedText = input.rawText.trim();\n \n*** End Patch",
    "fields": [],
    "probes": {
      "samples": [
        {
          "rawText": "  Hello  ",
          "blockedTerms": [],
          "maximumLength": 20,
          "expectedStatus": "accepted",
          "expectedText": "Hello",
          "expectedAudit": "s1:accepted:  Hello  "
        },
        {
          "rawText": "   ",
          "blockedTerms": [],
          "maximumLength": 20,
          "expectedStatus": "empty",
          "expectedText": "",
          "expectedAudit": "s1:empty:   "
        },
        {
          "rawText": " BAD ",
          "blockedTerms": [
            "bad"
          ],
          "maximumLength": 20,
          "expectedStatus": "blocked",
          "expectedText": "BAD",
          "expectedAudit": "s1:blocked: BAD "
        },
        {
          "rawText": " BAD ",
          "blockedTerms": [
            "bad"
          ],
          "maximumLength": 2,
          "expectedStatus": "too-long",
          "expectedText": "BAD",
          "expectedAudit": "s1:too-long: BAD "
        }
      ],
      "resourceProof": "Supply spy audit writer; exactly one expected raw-text entry per invocation, imported auditEntries stays empty. No deleting audit operation. Preserve returned submissionId, description, normalized text and status."
    },
    "nativeSelected": true
  },
  {
    "id": "moderation-decision-large-separated-clean",
    "candidateId": "moderation-decision",
    "layout": "large-separated",
    "ruleId": "r9_body_reaches_undeclared",
    "gold": false,
    "before": "import { type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n/** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\nexport function CaseState(\n  label: string,\n  input: ModerationInput,\n  audit: AuditWriter,\n): ModerationDecision {\n  const description = label.trim();\n  const submissionId = input.submissionId;\n  const normalizedText = input.rawText.trim();\n\n  const comparable = normalizedText.toLowerCase();\n  const blocked = input.blockedTerms.some(term => comparable.includes(term.toLowerCase()));\n  const empty = normalizedText.length === 0;\n\n  const tooLong = normalizedText.length > input.maximumLength;\n  const status = empty ? \"empty\" : tooLong ? \"too-long\" : blocked ? \"blocked\" : \"accepted\";\n  const entry = submissionId + \":\" + status + \":\" + input.rawText;\n\n  audit.append(entry);\n  return { description, submissionId, normalizedText, status };\n}\n",
    "after": "import { type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n/** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\nexport function CaseState(\n  displayLabel: string,\n  input: ModerationInput,\n  audit: AuditWriter,\n): ModerationDecision {\n  const description = displayLabel.trim();\n  const submissionId = input.submissionId;\n  const normalizedText = input.rawText.trim();\n\n  const comparable = normalizedText.toLowerCase();\n  const blocked = input.blockedTerms.some(term => comparable.includes(term.toLowerCase()));\n  const empty = normalizedText.length === 0;\n\n  const tooLong = normalizedText.length > input.maximumLength;\n  const status = empty ? \"empty\" : tooLong ? \"too-long\" : blocked ? \"blocked\" : \"accepted\";\n  const entry = submissionId + \":\" + status + \":\" + input.rawText;\n\n  audit.append(entry);\n  return { description, submissionId, normalizedText, status };\n}\n",
    "support": {
      "support.ts": "export interface AuditWriter { append: (entry: string) => void; }\nexport const auditEntries: string[] = [];\nexport function appendAudit(entry: string): void { auditEntries.push(entry); }\nexport interface ModerationInput {\n  submissionId: string;\n  rawText: string;\n  blockedTerms: readonly string[];\n  maximumLength: number;\n}\nexport interface ModerationDecision {\n  description: string;\n  submissionId: string;\n  normalizedText: string;\n  status: \"empty\" | \"too-long\" | \"blocked\" | \"accepted\";\n}\n"
    },
    "domain": "Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive.",
    "captureCommand": "*** Begin Patch\n*** Update File: subject.ts\n@@\n import { type AuditWriter, type ModerationInput, type ModerationDecision } from \"./support\";\n /** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */\n export function CaseState(\n-  label: string,\n+  displayLabel: string,\n   input: ModerationInput,\n   audit: AuditWriter,\n ): ModerationDecision {\n-  const description = label.trim();\n+  const description = displayLabel.trim();\n   const submissionId = input.submissionId;\n   const normalizedText = input.rawText.trim();\n \n*** End Patch",
    "fields": [],
    "probes": {
      "samples": [
        {
          "rawText": "  Hello  ",
          "blockedTerms": [],
          "maximumLength": 20,
          "expectedStatus": "accepted",
          "expectedText": "Hello",
          "expectedAudit": "s1:accepted:  Hello  "
        },
        {
          "rawText": "   ",
          "blockedTerms": [],
          "maximumLength": 20,
          "expectedStatus": "empty",
          "expectedText": "",
          "expectedAudit": "s1:empty:   "
        },
        {
          "rawText": " BAD ",
          "blockedTerms": [
            "bad"
          ],
          "maximumLength": 20,
          "expectedStatus": "blocked",
          "expectedText": "BAD",
          "expectedAudit": "s1:blocked: BAD "
        },
        {
          "rawText": " BAD ",
          "blockedTerms": [
            "bad"
          ],
          "maximumLength": 2,
          "expectedStatus": "too-long",
          "expectedText": "BAD",
          "expectedAudit": "s1:too-long: BAD "
        }
      ],
      "resourceProof": "Supply spy audit writer; exactly one expected raw-text entry per invocation, imported auditEntries stays empty. No deleting audit operation. Preserve returned submissionId, description, normalized text and status."
    },
    "nativeSelected": true
  }
];
export const cases = specs.map(spec => ({ ...spec, filename: 'subject.ts', declarationName: 'CaseState',
 inputContract: spec.ruleId === 'r9_body_reaches_undeclared' ? 'direct-event/function/v1' : 'direct-event/type-shape/v1',
 category: spec.gold ? 'rule-violation' : 'clean-control', excludedPaths: [], rationale: spec.domain,
 readme: `# Domain\n\n${spec.domain}\n\nlabel is presentation text. Preserve the public domain and every independent fact.\n`,
 probe: { strategy: spec.ruleId === 'r9_body_reaches_undeclared' ? 'declaration-and-runtime-observation' : 'typescript-witness', domain: spec.domain, validWitnesses: [] },
}));
export const tasks = cases.filter(f => f.nativeSelected).map(f => ({ ...f, id: `large-${f.id}`, caseId: f.id,
 initial: f.before, prompt: 'Rename label to displayLabel in subject.ts using apply_patch. Make the initial rename as a minimal patch; preserve the documented domain and all independent facts. Run typecheck and tests.',
 probe: { ...f.probe, requireExport: 'CaseState', requireRenamedField: 'displayLabel' },
}));
