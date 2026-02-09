/**
 * RTK Survey Mobile App
 *
 * Features:
 * - Real-time position display from rover
 * - Mark locations (saved to backend, synced to all dashboards)
 * - Measure straight-line distance between two points
 */

class RTKSurvey {
  constructor() {
    // State
    this.position = null;
    this.marks = [];
    this.markMarkers = {};
    this.ws = null;
    this.connected = false;

    // Measure mode state
    this.measureMode = false;
    this.measureStartMark = null;  // The mark object for start point

    // Stored measurement lines (persisted until cleared)
    this.measurementLines = [];  // Array of { startMark, endMark, distance, lineId, labelMarker }

    // Pending mark (waiting for label input)
    this.pendingMark = null;

    // Position averaging
    this.positionSamples = [];
    this.isCapturing = false;
    this.captureCallback = null;

    // Init
    this.initMap();
    this.initWebSocket();
    this.initEventListeners();
  }

  // ============================================================================
  // Map Initialization
  // ============================================================================

  initMap() {
    mapboxgl.accessToken = CONFIG.MAPBOX_TOKEN;

    this.map = new mapboxgl.Map({
      container: 'map',
      style: CONFIG.MAP.STYLE,
      center: CONFIG.MAP.DEFAULT_CENTER,
      zoom: CONFIG.MAP.DEFAULT_ZOOM,
      attributionControl: false
    });

    // Add zoom controls
    this.map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    // Position marker (current rover location)
    this.positionMarker = this.createPositionMarker();

    // Accuracy circle
    this.map.on('load', () => {
      // Accuracy circle source
      this.map.addSource('accuracy-circle', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      this.map.addLayer({
        id: 'accuracy-circle',
        type: 'fill',
        source: 'accuracy-circle',
        paint: {
          'fill-color': '#2563eb',
          'fill-opacity': 0.15
        }
      });

    });
  }

  createPositionMarker() {
    const el = document.createElement('div');
    el.className = 'position-marker';
    el.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="12" fill="#2563eb" stroke="white" stroke-width="3"/>
        <circle cx="16" cy="16" r="4" fill="white"/>
      </svg>
    `;
    el.style.cssText = 'cursor: pointer;';

    return new mapboxgl.Marker({ element: el })
      .setLngLat(CONFIG.MAP.DEFAULT_CENTER)
      .addTo(this.map);
  }

  // ============================================================================
  // WebSocket Connection
  // ============================================================================

  initWebSocket() {
    this.connect();
  }

  connect() {
    console.log('Connecting to', CONFIG.WS_URL);

    this.ws = new WebSocket(CONFIG.WS_URL);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.connected = true;
      this.updateConnectionStatus();
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.connected = false;
      this.updateConnectionStatus();

      // Reconnect after delay
      setTimeout(() => this.connect(), CONFIG.RECONNECT_INTERVAL);
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'position':
        this.updatePosition(msg.data);
        break;

      case 'marks':
        // Full marks list (on connect)
        this.marks = msg.data;
        this.renderAllMarks();
        break;

      case 'mark':
        this.handleMarkEvent(msg);
        break;
    }
  }

  handleMarkEvent(msg) {
    switch (msg.action) {
      case 'create':
        this.marks.push(msg.data);
        this.addMarkToMap(msg.data);
        break;

      case 'delete':
        this.marks = this.marks.filter(m => m.id !== msg.data.id);
        this.removeMarkFromMap(msg.data.id);
        break;

      case 'update':
        const idx = this.marks.findIndex(m => m.id === msg.data.id);
        if (idx >= 0) this.marks[idx] = msg.data;
        break;

      case 'clear':
        this.marks = [];
        this.clearAllMarksFromMap();
        break;
    }

    this.renderMarksList();
  }

  updateConnectionStatus() {
    const el = document.getElementById('connection');
    if (this.connected) {
      el.textContent = 'LIVE';
      el.className = 'connected';
    } else {
      el.textContent = 'OFFLINE';
      el.className = 'disconnected';
    }
  }

  // ============================================================================
  // Position Updates
  // ============================================================================

  updatePosition(data) {
    this.position = data;

    // Update fix status badge
    const fixEl = document.getElementById('fix-status');
    if (data.carr_soln === 2) {
      fixEl.textContent = 'RTK FIXED';
      fixEl.className = 'fix-badge rtk-fixed';
    } else if (data.carr_soln === 1) {
      fixEl.textContent = 'RTK FLOAT';
      fixEl.className = 'fix-badge rtk-float';
    } else if (data.fix_type >= 3) {
      fixEl.textContent = 'DGPS';
      fixEl.className = 'fix-badge dgps';
    } else {
      fixEl.textContent = 'NO FIX';
      fixEl.className = 'fix-badge no-fix';
    }

    // Update accuracy
    const accEl = document.getElementById('accuracy');
    if (data.h_acc) {
      const cm = (data.h_acc * 100).toFixed(1);
      accEl.textContent = `${cm} cm`;
    } else {
      accEl.textContent = '--';
    }

    // Update satellites
    document.getElementById('satellites').textContent = `${data.num_sv || '--'} SV`;

    // Update battery from rover
    if (data.battery_pct != null && data.battery_pct >= 0) {
      const container = document.getElementById('battery');
      const fill = document.getElementById('battery-fill');
      const pct = document.getElementById('battery-pct');
      const level = data.battery_pct;

      container.classList.remove('hidden');
      pct.textContent = `${level}%`;
      fill.setAttribute('width', (level / 100) * 20);

      let color;
      if (level > 50) color = 'var(--success)';
      else if (level > 20) color = 'var(--warning)';
      else color = 'var(--danger)';
      fill.setAttribute('fill', color);
    }

    // Update coordinates display
    if (data.latitude && data.longitude) {
      document.getElementById('latitude').textContent = data.latitude.toFixed(9);
      document.getElementById('longitude').textContent = data.longitude.toFixed(9);

      // Update marker position
      const lngLat = [data.longitude, data.latitude];
      this.positionMarker.setLngLat(lngLat);

      // Update accuracy circle
      if (data.h_acc && this.map.getSource('accuracy-circle')) {
        const circle = this.createCircle(lngLat, data.h_acc);
        this.map.getSource('accuracy-circle').setData(circle);
      }
    }
  }

  createCircle(center, radiusMeters) {
    const points = 64;
    const coords = [];

    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      const dx = radiusMeters * Math.cos(angle);
      const dy = radiusMeters * Math.sin(angle);

      // Convert meters to degrees (approximate)
      const lat = center[1] + (dy / 111320);
      const lng = center[0] + (dx / (111320 * Math.cos(center[1] * Math.PI / 180)));

      coords.push([lng, lat]);
    }

    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [coords]
      }
    };
  }

  // ============================================================================
  // Position Averaging
  // ============================================================================

  /**
   * Start capturing position samples for averaging
   * @param {number} durationMs - How long to capture (default 3000ms)
   * @param {function} callback - Called with averaged position { latitude, longitude, h_acc, samples }
   */
  startPositionCapture(durationMs = 3000, callback) {
    if (this.isCapturing) {
      console.warn('Already capturing');
      return;
    }

    if (!this.position || !this.position.latitude) {
      alert('No GPS position available');
      return;
    }

    this.isCapturing = true;
    this.positionSamples = [];
    this.captureCallback = callback;

    // Show capture UI
    this.showCaptureOverlay(durationMs);

    // Capture initial position
    this.capturePositionSample();

    // Set up interval to capture more samples
    const sampleInterval = 200; // Capture every 200ms
    this.captureIntervalId = setInterval(() => {
      this.capturePositionSample();
    }, sampleInterval);

    // Stop after duration
    this.captureTimeoutId = setTimeout(() => {
      this.finishPositionCapture();
    }, durationMs);
  }

  capturePositionSample() {
    if (!this.position || !this.position.latitude) return;

    // Only capture if in RTK FIXED mode (carr_soln === 2) AND good accuracy
    const isFixed = this.position.carr_soln === 2;
    const isGoodAccuracy = this.position.h_acc && this.position.h_acc < 0.025; // < 2.5 cm

    this.positionSamples.push({
      latitude: this.position.latitude,
      longitude: this.position.longitude,
      h_acc: this.position.h_acc,
      isFixed,
      isGoodAccuracy,
      isUsable: isFixed && isGoodAccuracy
    });

    // Update capture UI with sample count
    const countEl = document.getElementById('capture-count');
    const hintEl = document.querySelector('.capture-hint');
    if (countEl) {
      const usableCount = this.positionSamples.filter(s => s.isUsable).length;
      const total = this.positionSamples.length;
      countEl.textContent = `${usableCount}/${total} good samples`;

      // Update hint based on quality
      if (hintEl) {
        if (!isFixed) {
          hintEl.textContent = 'Waiting for RTK FIXED...';
          hintEl.style.color = '#f59e0b';
        } else if (!isGoodAccuracy) {
          hintEl.textContent = `Accuracy: ${(this.position.h_acc * 100).toFixed(1)} cm (need < 2.5 cm)`;
          hintEl.style.color = '#f59e0b';
        } else {
          hintEl.textContent = `RTK FIXED - ${(this.position.h_acc * 100).toFixed(1)} cm`;
          hintEl.style.color = '#22c55e';
        }
      }
    }
  }

  finishPositionCapture() {
    clearInterval(this.captureIntervalId);
    clearTimeout(this.captureTimeoutId);
    this.isCapturing = false;
    this.hideCaptureOverlay();

    if (this.positionSamples.length === 0) {
      alert('No position samples captured');
      return;
    }

    // Filter to only usable samples (RTK FIXED + good accuracy)
    let samples = this.positionSamples.filter(s => s.isUsable);
    const usableCount = samples.length;
    const totalCount = this.positionSamples.length;

    // Fall back to FIXED-only if no usable samples
    if (samples.length === 0) {
      samples = this.positionSamples.filter(s => s.isFixed);
      console.warn('No samples with good accuracy, using all FIXED samples');
    }

    // Fall back to all samples if still none
    if (samples.length === 0) {
      samples = this.positionSamples;
      console.warn('No RTK FIXED samples, using all samples');
    }

    // Calculate average position
    const avgLat = samples.reduce((sum, s) => sum + s.latitude, 0) / samples.length;
    const avgLon = samples.reduce((sum, s) => sum + s.longitude, 0) / samples.length;
    const avgAcc = samples.reduce((sum, s) => sum + (s.h_acc || 0), 0) / samples.length;

    // Calculate position spread (max distance from average)
    let maxSpread = 0;
    samples.forEach(s => {
      const dist = this.haversineDistance(avgLat, avgLon, s.latitude, s.longitude);
      if (dist > maxSpread) maxSpread = dist;
    });

    const result = {
      latitude: avgLat,
      longitude: avgLon,
      h_acc: avgAcc,
      samples: samples.length,
      totalSamples: totalCount,
      spread: maxSpread,
      quality: usableCount >= 10 ? 'good' : usableCount >= 5 ? 'fair' : 'poor'
    };

    console.log(`Position averaged: ${samples.length}/${totalCount} samples, spread: ${(maxSpread * 100).toFixed(1)} cm, quality: ${result.quality}`);

    // Warn if quality is poor
    if (result.quality === 'poor') {
      const proceed = confirm(`Only ${usableCount} good samples captured (need 10+).\nSpread: ${(maxSpread * 100).toFixed(1)} cm\n\nProceed anyway?`);
      if (!proceed) {
        this.captureCallback = null;
        return;
      }
    }

    if (this.captureCallback) {
      this.captureCallback(result);
    }
  }

  cancelPositionCapture() {
    clearInterval(this.captureIntervalId);
    clearTimeout(this.captureTimeoutId);
    this.isCapturing = false;
    this.positionSamples = [];
    this.captureCallback = null;
    this.hideCaptureOverlay();
  }

  showCaptureOverlay(durationMs) {
    // Create overlay if it doesn't exist
    let overlay = document.getElementById('capture-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'capture-overlay';
      overlay.innerHTML = `
        <div class="capture-content">
          <div class="capture-spinner"></div>
          <div class="capture-text">Capturing position...</div>
          <div id="capture-count">0 samples</div>
          <div class="capture-hint">Hold antenna steady</div>
          <button id="capture-cancel-btn" class="btn-cancel">Cancel</button>
        </div>
      `;
      document.body.appendChild(overlay);

      document.getElementById('capture-cancel-btn').addEventListener('click', () => {
        this.cancelPositionCapture();
      });
    }

    overlay.classList.remove('hidden');

    // Animate progress
    const progressBar = overlay.querySelector('.capture-spinner');
    if (progressBar) {
      progressBar.style.animationDuration = `${durationMs}ms`;
    }
  }

  hideCaptureOverlay() {
    const overlay = document.getElementById('capture-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }

  // ============================================================================
  // Mark Functions
  // ============================================================================

  markCurrentLocation() {
    if (!this.position || !this.position.latitude) {
      alert('No GPS position available');
      return;
    }

    // Start position capture with averaging (5 seconds for better accuracy)
    this.startPositionCapture(5000, (avgPosition) => {
      // Store pending mark data with averaged position
      this.pendingMark = {
        latitude: avgPosition.latitude,
        longitude: avgPosition.longitude,
        h_acc: avgPosition.h_acc
      };

      // Show label dialog with default name
      const nextNum = this.marks.length + 1;
      document.getElementById('label-input').value = `RM_${nextNum}`;
      document.getElementById('label-dialog').classList.remove('hidden');
      document.getElementById('label-input').select();
    });
  }

  async saveMark(label) {
    if (!this.pendingMark) return;

    const markData = {
      ...this.pendingMark,
      label
    };

    try {
      const response = await fetch(`${CONFIG.API_URL}/api/marks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(markData)
      });

      if (!response.ok) {
        throw new Error('Failed to save mark');
      }

      // Mark will be added via WebSocket broadcast
      console.log('Mark saved:', label);
    } catch (e) {
      console.error('Error saving mark:', e);
      alert('Failed to save mark');
    }

    this.pendingMark = null;
    document.getElementById('label-dialog').classList.add('hidden');
  }

  addMarkToMap(mark) {
    const el = document.createElement('div');
    el.className = 'mark-marker';
    el.title = mark.label;

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([mark.longitude, mark.latitude])
      .addTo(this.map);

    this.markMarkers[mark.id] = marker;
  }

  removeMarkFromMap(id) {
    if (this.markMarkers[id]) {
      this.markMarkers[id].remove();
      delete this.markMarkers[id];
    }
  }

  clearAllMarksFromMap() {
    Object.values(this.markMarkers).forEach(marker => marker.remove());
    this.markMarkers = {};
  }

  renderAllMarks() {
    this.clearAllMarksFromMap();
    this.marks.forEach(mark => this.addMarkToMap(mark));
    this.renderMarksList();
  }

  renderMarksList() {
    const list = document.getElementById('marks-list');

    if (this.marks.length === 0) {
      list.innerHTML = '<div style="padding: 24px; text-align: center; color: #9ca3af;">No marks saved</div>';
      return;
    }

    list.innerHTML = this.marks.map(mark => `
      <div class="mark-item" data-id="${mark.id}">
        <div class="mark-icon">
          <svg viewBox="0 0 24 24">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          </svg>
        </div>
        <div class="mark-info">
          <div class="mark-label">${mark.label}</div>
          <div class="mark-coords">${mark.latitude.toFixed(9)}, ${mark.longitude.toFixed(9)}</div>
          <div class="mark-meta">${mark.h_acc ? (mark.h_acc * 100).toFixed(1) + ' cm' : '--'} | ${new Date(mark.timestamp).toLocaleString()}</div>
        </div>
        <button class="mark-delete" data-id="${mark.id}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </button>
      </div>
    `).join('');

    // Attach click handlers
    list.querySelectorAll('.mark-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.mark-delete')) return;

        const id = parseInt(item.dataset.id);
        const mark = this.marks.find(m => m.id === id);
        if (mark) {
          this.map.flyTo({ center: [mark.longitude, mark.latitude], zoom: 19 });
          this.closeMarksList();
        }
      });
    });

    list.querySelectorAll('.mark-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (confirm('Delete this mark?')) {
          await this.deleteMark(id);
        }
      });
    });
  }

  async deleteMark(id) {
    try {
      await fetch(`${CONFIG.API_URL}/api/marks/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Error deleting mark:', e);
    }
  }

  async clearAllMarks() {
    if (!confirm('Delete all marks?')) return;

    try {
      await fetch(`${CONFIG.API_URL}/api/marks`, { method: 'DELETE' });
    } catch (e) {
      console.error('Error clearing marks:', e);
    }
  }

  exportMarks() {
    const geojson = {
      type: 'FeatureCollection',
      features: this.marks.map(mark => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [mark.longitude, mark.latitude]
        },
        properties: {
          label: mark.label,
          h_acc: mark.h_acc,
          timestamp: mark.timestamp
        }
      }))
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rtk-marks-${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============================================================================
  // Measure Functions (GPS-based workflow)
  // ============================================================================

  /**
   * Start a measurement - captures averaged position and creates mark
   */
  startMeasure() {
    if (!this.position || !this.position.latitude) {
      alert('No GPS position available');
      return;
    }

    // Start position capture with averaging
    this.startPositionCapture(5000, async (avgPosition) => {
      const label = `RM_${this.marks.length + 1}`;
      const markData = {
        latitude: avgPosition.latitude,
        longitude: avgPosition.longitude,
        h_acc: avgPosition.h_acc,
        label
      };

      try {
        const response = await fetch(`${CONFIG.API_URL}/api/marks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(markData)
        });

        if (!response.ok) throw new Error('Failed to save mark');

        const savedMark = await response.json();
        this.measureStartMark = savedMark;

        // Update UI
        this.measureMode = true;
        document.getElementById('btn-measure').classList.add('active');
        document.getElementById('measure-display').classList.remove('hidden');
        document.getElementById('measure-status').textContent = 'Move to end point';
        document.getElementById('measure-start-label').textContent = `Start: ${label} (${avgPosition.samples} samples)`;
        document.getElementById('measure-finish').classList.remove('hidden');

        console.log(`Measure started at: ${label} (${avgPosition.samples} samples, spread: ${(avgPosition.spread * 100).toFixed(1)} cm)`);
      } catch (e) {
        console.error('Error starting measure:', e);
        alert('Failed to create start mark');
      }
    });
  }

  /**
   * Finish a measurement - captures averaged position, creates mark, draws line
   */
  finishMeasure() {
    if (!this.measureStartMark) {
      alert('No start point set');
      return;
    }

    if (!this.position || !this.position.latitude) {
      alert('No GPS position available');
      return;
    }

    // Start position capture with averaging
    this.startPositionCapture(5000, async (avgPosition) => {
      const label = `RM_${this.marks.length + 1}`;
      const markData = {
        latitude: avgPosition.latitude,
        longitude: avgPosition.longitude,
        h_acc: avgPosition.h_acc,
        label
      };

      try {
        const response = await fetch(`${CONFIG.API_URL}/api/marks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(markData)
        });

        if (!response.ok) throw new Error('Failed to save mark');

        const endMark = await response.json();

        // Calculate distance
        const distance = this.haversineDistance(
          this.measureStartMark.latitude, this.measureStartMark.longitude,
          endMark.latitude, endMark.longitude
        );

        // Create measurement line
        const lineId = `measure-line-${Date.now()}`;
        this.addMeasurementLine(this.measureStartMark, endMark, distance, lineId);

        console.log(`Measure complete: ${this.measureStartMark.label} → ${label} = ${distance.toFixed(3)}m (${avgPosition.samples} samples)`);

        // Reset measure mode
        this.measureStartMark = null;
        this.measureMode = false;
        document.getElementById('btn-measure').classList.remove('active');
        document.getElementById('measure-display').classList.add('hidden');
        document.getElementById('measure-finish').classList.add('hidden');

      } catch (e) {
        console.error('Error finishing measure:', e);
        alert('Failed to create end mark');
      }
    });
  }

  /**
   * Add a measurement line with distance label to the map
   */
  addMeasurementLine(startMark, endMark, distance, lineId) {
    const startCoord = [startMark.longitude, startMark.latitude];
    const endCoord = [endMark.longitude, endMark.latitude];

    // Add line source and layer
    this.map.addSource(lineId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [startCoord, endCoord]
        }
      }
    });

    this.map.addLayer({
      id: lineId,
      type: 'line',
      source: lineId,
      paint: {
        'line-color': '#f59e0b',
        'line-width': 3,
        'line-dasharray': [2, 1]
      }
    });

    // Create distance label at midpoint
    const midLng = (startCoord[0] + endCoord[0]) / 2;
    const midLat = (startCoord[1] + endCoord[1]) / 2;

    const labelEl = document.createElement('div');
    labelEl.className = 'distance-label';
    labelEl.textContent = this.formatDistance(distance);

    const labelMarker = new mapboxgl.Marker({ element: labelEl })
      .setLngLat([midLng, midLat])
      .addTo(this.map);

    // Store measurement
    this.measurementLines.push({
      startMark,
      endMark,
      distance,
      lineId,
      labelMarker
    });
  }

  /**
   * Format distance for display
   */
  formatDistance(meters) {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(3)} km`;
    } else if (meters >= 1) {
      return `${meters.toFixed(3)} m`;
    } else {
      return `${(meters * 100).toFixed(1)} cm`;
    }
  }

  /**
   * Haversine distance calculation
   */
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Clear all measurement lines
   */
  clearMeasurementLines() {
    this.measurementLines.forEach(m => {
      // Remove line layer and source
      if (this.map.getLayer(m.lineId)) {
        this.map.removeLayer(m.lineId);
      }
      if (this.map.getSource(m.lineId)) {
        this.map.removeSource(m.lineId);
      }
      // Remove label marker
      if (m.labelMarker) {
        m.labelMarker.remove();
      }
    });
    this.measurementLines = [];
    console.log('All measurement lines cleared');
  }

  /**
   * Cancel current measurement (doesn't delete the start mark)
   */
  cancelMeasure() {
    this.measureStartMark = null;
    this.measureMode = false;
    document.getElementById('btn-measure').classList.remove('active');
    document.getElementById('measure-display').classList.add('hidden');
    document.getElementById('measure-finish').classList.add('hidden');
  }

  // ============================================================================
  // UI Helpers
  // ============================================================================

  centerOnPosition() {
    if (this.position && this.position.latitude) {
      this.map.flyTo({
        center: [this.position.longitude, this.position.latitude],
        zoom: 19
      });
    }
  }

  showMarksList() {
    this.renderMarksList();
    document.getElementById('marks-panel').classList.remove('hidden');
    // Trigger animation
    requestAnimationFrame(() => {
      document.getElementById('marks-panel').classList.add('visible');
    });
  }

  closeMarksList() {
    const panel = document.getElementById('marks-panel');
    panel.classList.remove('visible');
    setTimeout(() => panel.classList.add('hidden'), 300);
  }

  // ============================================================================
  // Event Listeners
  // ============================================================================

  initEventListeners() {
    // Action buttons
    document.getElementById('btn-mark').addEventListener('click', () => this.markCurrentLocation());
    document.getElementById('btn-measure').addEventListener('click', () => this.startMeasure());
    document.getElementById('btn-center').addEventListener('click', () => this.centerOnPosition());
    document.getElementById('btn-marks-list').addEventListener('click', () => this.showMarksList());

    // Measure buttons
    document.getElementById('measure-finish').addEventListener('click', () => this.finishMeasure());
    document.getElementById('measure-cancel').addEventListener('click', () => this.cancelMeasure());

    // Marks panel
    document.getElementById('panel-close').addEventListener('click', () => this.closeMarksList());
    document.getElementById('btn-export').addEventListener('click', () => this.exportMarks());
    document.getElementById('btn-clear-lines').addEventListener('click', () => this.clearMeasurementLines());
    document.getElementById('btn-clear-marks').addEventListener('click', () => this.clearAllMarks());

    // Label dialog
    document.getElementById('label-cancel').addEventListener('click', () => {
      this.pendingMark = null;
      document.getElementById('label-dialog').classList.add('hidden');
    });

    document.getElementById('label-save').addEventListener('click', () => {
      const label = document.getElementById('label-input').value.trim();
      if (label) {
        this.saveMark(label);
      }
    });

    document.getElementById('label-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const label = e.target.value.trim();
        if (label) {
          this.saveMark(label);
        }
      }
    });
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  window.app = new RTKSurvey();
});
