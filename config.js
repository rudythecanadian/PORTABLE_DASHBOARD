/**
 * RTK Survey Configuration
 */

const CONFIG = {
  // Mapbox access token
  MAPBOX_TOKEN: 'pk.eyJ1IjoicnVkeXRoZWNhbmFkaWFuIiwiYSI6ImNtazdpNzdjYzE1N2gzZnB3YnlwZzd2OTAifQ.Fz2xdWGKuJXD_vdU8nKKmQ',

  // Backend server (same as ROVER_DASHBOARD)
  // Auto-detect based on current page URL
  API_URL: window.location.origin,

  WS_URL: window.location.protocol === 'https:'
    ? `wss://${window.location.host}`
    : `ws://${window.location.host}`,

  // Map settings
  MAP: {
    DEFAULT_CENTER: [-122.3498, 45.6468],  // Camas, WA
    DEFAULT_ZOOM: 18,
    STYLE: 'mapbox://styles/mapbox/satellite-streets-v12'
  },

  // Reconnection settings
  RECONNECT_INTERVAL: 3000,
  STALE_TIMEOUT: 10000
};
