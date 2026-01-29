# PORTABLE_DASHBOARD - RTK Survey Mobile Web App

## Overview

Mobile-first web application for RTK surveying with the Camas rover. Connects to the same backend as ROVER_DASHBOARD.

## Features

- **Real-time Position**: Live GPS position from rover via WebSocket
- **Mark Locations**: Save points with auto-incrementing labels (RM_1, RM_2...)
- **Measure Distance**: Straight-line distance between two tapped points
- **Export**: GeoJSON export of all marked points
- **Sync**: Marks synced across all connected dashboards

## Files

```
PORTABLE_DASHBOARD/
├── index.html      # Main HTML (mobile viewport)
├── styles.css      # Mobile-first responsive styles
├── config.js       # API/WebSocket URLs, Mapbox token
└── app.js          # Main application logic
```

## Configuration

Edit `config.js` to update:
- `MAPBOX_TOKEN`: Mapbox access token
- `API_URL`: Backend server URL
- `WS_URL`: WebSocket server URL

## Deployment

This is a static site - deploy to any web server. Files need to be served alongside the ROVER_DASHBOARD backend, or configure CORS.

### Deploy to Hostinger

1. Upload files to `/home/u123456789/domains/yourdomain.com/public_html/portable/`
2. Or serve from the same Express server as ROVER_DASHBOARD

### Serve from ROVER_DASHBOARD backend

Add to `server.js`:
```javascript
app.use('/portable', express.static(path.join(__dirname, '../../PORTABLE_DASHBOARD')));
```

Then access at: `https://srv1190594.hstgr.cloud:3000/portable/`

## Backend API

Uses the same backend as ROVER_DASHBOARD:
- `GET /api/marks` - Get all marks
- `POST /api/marks` - Create a mark
- `DELETE /api/marks/:id` - Delete a mark
- `DELETE /api/marks` - Clear all marks
- WebSocket `marks` message - Full marks list on connect
- WebSocket `mark` message - Real-time mark events (create/delete/update/clear)

## Data Format

### Mark Object
```json
{
  "id": 1,
  "label": "RM_1",
  "latitude": 45.646800000,
  "longitude": -122.349800000,
  "h_acc": 0.015,
  "timestamp": "2026-01-28T18:30:00.000Z"
}
```

### GeoJSON Export
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-122.349800000, 45.646800000]
      },
      "properties": {
        "label": "RM_1",
        "h_acc": 0.015,
        "timestamp": "2026-01-28T18:30:00.000Z"
      }
    }
  ]
}
```
