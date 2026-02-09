# PORTABLE_DASHBOARD - RTK Survey Mobile Web App

## Overview

Mobile-first web application for RTK surveying with the Camas rover. Designed for field use with iPhone, connecting to the rover via WiFi hotspot.

## URLs

- **Production**: `http://srv1190594.hstgr.cloud:3000/portable/`
- **Add to Home Screen** for app-like experience on iPhone

## Features

- **Real-time Position**: Live GPS position from rover via WebSocket
- **Battery Level**: Rover LiPo SOC from MAX17048 fuel gauge (green/yellow/red)
- **Position Averaging**: 5-second capture with strict quality filtering
- **Mark Locations**: Save points with auto-incrementing labels (RM_1, RM_2...)
- **Measure Distances**: GPS-based measurement between two points
- **Distance Labels**: Displayed on map at line midpoints
- **Export**: GeoJSON export of all marked points
- **Sync**: Marks synced in real-time to ROVER_DASHBOARD

## Position Averaging

When marking a location, the app captures position samples for 5 seconds:

- **Sample Rate**: Every 200ms (~25 samples)
- **Quality Filter**: Only uses samples with:
  - RTK FIXED status (carr_soln === 2)
  - Horizontal accuracy < 2.5 cm
- **UI Feedback**: Shows sample count and real-time accuracy
- **Quality Warning**: Alerts if < 10 good samples captured

This reduces single-epoch jitter and ensures survey-grade accuracy.

## Measure Workflow

1. Position antenna at start point
2. Tap **Measure** → captures 5 seconds, creates RM_x mark
3. UI shows "Move to end point" with **Finish** button
4. Move antenna to end point
5. Tap **Finish** → captures 5 seconds, creates RM_x+1 mark
6. Orange dashed line drawn with distance label at midpoint

## Files

```
PORTABLE_DASHBOARD/
├── index.html      # Main HTML (mobile viewport, safe areas)
├── styles.css      # Mobile-first responsive styles
├── config.js       # API/WebSocket URLs, Mapbox token
├── app.js          # Main application logic (~800 lines)
└── CLAUDE.md       # This file
```

## Configuration

Edit `config.js`:
```javascript
const CONFIG = {
  MAPBOX_TOKEN: 'pk.eyJ1IjoicnVkeXRoZWNhbmFkaWFuIi...',
  API_URL: window.location.origin,
  WS_URL: window.location.protocol === 'https:'
    ? `wss://${window.location.host}`
    : `ws://${window.location.host}`,
  MAP: {
    DEFAULT_CENTER: [-122.3498, 45.6468],
    DEFAULT_ZOOM: 18,
    STYLE: 'mapbox://styles/mapbox/satellite-streets-v12'
  }
};
```

## UI Components

### Status Bar (top)
- Fix status badge (RTK FIXED/FLOAT/DGPS/NO FIX)
- Horizontal accuracy in cm
- Satellite count
- Rover battery level (SVG icon + percentage, color-coded: green >50%, yellow 20-50%, red <20%)
- Connection status (LIVE/OFFLINE)

### Map
- Mapbox satellite view
- Blue position marker with accuracy circle
- Blue survey mark markers
- Orange measurement lines with distance labels

### Action Bar (bottom)
- **Mark**: Save current position (with averaging)
- **Measure**: Start/finish measurement
- **Center**: Fly to current position
- **List**: Show marks panel

### Marks Panel (slide-up)
- List of all marks with coordinates
- Tap to fly to mark location
- Delete individual marks
- Export as GeoJSON
- Clear all lines
- Clear all marks

## Backend API

Uses ROVER_DASHBOARD backend at same origin:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/marks` | GET | Get all marks |
| `/api/marks` | POST | Create mark |
| `/api/marks/:id` | DELETE | Delete mark |
| `/api/marks` | DELETE | Clear all |

## WebSocket Events

| Type | Direction | Description |
|------|-----------|-------------|
| `position` | Server→Client | Real-time rover position |
| `marks` | Server→Client | Full marks list on connect |
| `mark` | Server→Client | Mark create/delete/update events |

## Data Formats

### Mark Object
```json
{
  "id": 1,
  "label": "RM_1",
  "latitude": 45.64722540,
  "longitude": -122.34976893,
  "h_acc": 0.014,
  "timestamp": "2026-01-29T00:23:31.330Z"
}
```

### GeoJSON Export
```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "geometry": {
      "type": "Point",
      "coordinates": [-122.34976893, 45.64722540]
    },
    "properties": {
      "label": "RM_1",
      "h_acc": 0.014,
      "timestamp": "2026-01-29T00:23:31.330Z"
    }
  }]
}
```

## Field Usage

### Setup
1. Connect ESP32 rover to iPhone via USB-C (power)
2. Enable iPhone Personal Hotspot (`RudyTheCanadian`)
3. Rover auto-connects to hotspot
4. Open Safari: `http://srv1190594.hstgr.cloud:3000/portable/`
5. Add to Home Screen for better experience

### Best Practices
- Wait for **RTK FIXED** (green badge) before marking
- Hold antenna **perfectly still** during 5-second capture
- Watch for green accuracy indicator during capture
- If accuracy > 2.5 cm, wait for better conditions
- Clear sky view is essential for RTK FIXED

### Accuracy Tips
- Position averaging reduces random jitter
- Only RTK FIXED samples with < 2.5 cm accuracy are used
- Spread value shows position consistency during capture
- If spread > 2-3 cm, something may have moved

## Deployment

Served from ROVER_DASHBOARD backend:
```javascript
// In server.js
app.use('/portable', express.static(path.join(__dirname, '../portable')));
```

### Deploy Updates
```bash
scp *.html *.css *.js root@100.114.78.71:/var/www/rover-dashboard/portable/
```

## Related Projects

- **RTK_ROVER_CAMAS**: ESP32 rover firmware with multi-WiFi
- **ROVER_DASHBOARD**: Main web dashboard (shows same marks)
- **RTK_BASE_CAMAS**: Base station firmware
