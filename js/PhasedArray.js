/**
 * PhasedArray.js - Physics Model for Phased Array Systems
 * - Element position calculations (linear and curved geometries)
 * - Phase delay calculations for beam steering
 * - Wave propagation parameters
 */

export class PhasedArray {
    /**
     * @param {Object} config - Configuration object
     * @param {string} config.name - Display name for the array
     * @param {number} config.numElements - Number of transducer elements
     * @param {number} config.pitch - Element spacing in meters
     * @param {number} config.frequency - Operating frequency in Hz
     * @param {number} config.steeringAngle - Beam steering angle in degrees
     * @param {Object} config.position - Array center position {x, y} in meters
     * @param {string} config.geometry - 'linear' or 'curved'
     * @param {number} config.curvatureRadius - Radius for curved arrays in meters
     * @param {number} config.orientation - Array orientation angle in degrees
     * @param {number} config.focalDistance - Focus distance for near-field focusing
     */
    constructor(config = {}) {
        // Unique identifier
        this.id = PhasedArray._generateId();

        // Display name
        this.name = config.name || `Array ${this.id}`;

        // Array parameters
        this._numElements = config.numElements || 16;
        this._pitch = config.pitch || 0.005; // 5mm default
        this._frequency = config.frequency || 40000; // 40kHz default
        this._steeringAngle = config.steeringAngle || 0; // degrees
        this._position = config.position || { x: 0, y: -0.1 };
        this._geometry = config.geometry || 'linear';
        this._curvatureRadius = config.curvatureRadius || 0.1; // meters
        this._orientation = config.orientation || 0; // degrees
        this._focalDistance = config.focalDistance || Infinity;
        this._amplitude = config.amplitude || 1.0;
        this._enabled = true;

        // Physical constants
        this._speedOfSound = config.speedOfSound || 343; // m/s in air

        // Calculated properties cache
        this._elementPositions = [];
        this._elementPhases = [];
        this._wavelength = 0;
        this._dirty = true;

        // Initial calculation
        this._recalculate();
    }

    // Static ID generator
    static _idCounter = 0;
    static _generateId() {
        return ++PhasedArray._idCounter;
    }

    // ==================== GETTERS AND SETTERS ====================

    get numElements() { return this._numElements; }
    set numElements(value) {
        this._numElements = Math.max(1, Math.min(64, Math.round(value)));
        this._dirty = true;
    }

    get pitch() { return this._pitch; }
    set pitch(value) {
        this._pitch = Math.max(0.001, value);
        this._dirty = true;
    }

    get frequency() { return this._frequency; }
    set frequency(value) {
        this._frequency = Math.max(0.1, value);
        this._dirty = true;
    }

    get steeringAngle() { return this._steeringAngle; }
    set steeringAngle(value) {
        this._steeringAngle = Math.max(-90, Math.min(90, value));
        this._dirty = true;
    }

    get position() { return { ...this._position }; }
    set position(value) {
        this._position = { x: value.x || 0, y: value.y || 0 };
        this._dirty = true;
    }

    get geometry() { return this._geometry; }
    set geometry(value) {
        this._geometry = value === 'curved' ? 'curved' : 'linear';
        this._dirty = true;
    }

    get curvatureRadius() { return this._curvatureRadius; }
    set curvatureRadius(value) {
        this._curvatureRadius = Math.max(0.01, value);
        this._dirty = true;
    }

    get orientation() { return this._orientation; }
    set orientation(value) {
        this._orientation = value % 360;
        this._dirty = true;
    }

    get focalDistance() { return this._focalDistance; }
    set focalDistance(value) {
        this._focalDistance = value <= 0 ? Infinity : value;
        this._dirty = true;
    }

    get amplitude() { return this._amplitude; }
    set amplitude(value) {
        this._amplitude = Math.max(0, Math.min(2, value));
    }

    get enabled() { return this._enabled; }
    set enabled(value) {
        this._enabled = Boolean(value);
    }

    get speedOfSound() { return this._speedOfSound; }
    set speedOfSound(value) {
        this._speedOfSound = Math.max(0.1, value);
        this._dirty = true;
    }

    get wavelength() {
        this._ensureCalculated();
        return this._wavelength;
    }

    // ==================== GEOMETRY CALCULATIONS ====================

    /**
     * Calculate element positions based on geometry type
     * @private
     */
    _calculateElementPositions() {
        this._elementPositions = [];
        const n = this._numElements;
        const orientationRad = this._orientation * Math.PI / 180;

        if (this._geometry === 'linear') {
            // Linear array: elements arranged in a straight line
            const totalWidth = (n - 1) * this._pitch;
            const startOffset = -totalWidth / 2;

            for (let i = 0; i < n; i++) {
                // Local coordinates (along array axis)
                const localX = startOffset + i * this._pitch;
                const localY = 0;

                // Rotate by orientation and translate to position
                const cos = Math.cos(orientationRad);
                const sin = Math.sin(orientationRad);

                const worldX = this._position.x + localX * cos - localY * sin;
                const worldY = this._position.y + localX * sin + localY * cos;

                this._elementPositions.push({ x: worldX, y: worldY, localIndex: i });
            }
        } else {
            // Curved (convex) array: elements arranged on an arc
            const radius = this._curvatureRadius;
            const arcLength = (n - 1) * this._pitch;
            const totalAngle = arcLength / radius; // Arc angle in radians
            const startAngle = -totalAngle / 2;

            for (let i = 0; i < n; i++) {
                const elementAngle = startAngle + (i / (n - 1 || 1)) * totalAngle;

                // Local coordinates on the arc
                // Arc center is at (0, -radius) relative to array position
                // Elements point outward (positive Y direction)
                const localX = radius * Math.sin(elementAngle);
                const localY = radius * (1 - Math.cos(elementAngle));

                // Rotate by orientation and translate to position
                const cos = Math.cos(orientationRad);
                const sin = Math.sin(orientationRad);

                const worldX = this._position.x + localX * cos - localY * sin;
                const worldY = this._position.y + localX * sin + localY * cos;

                this._elementPositions.push({
                    x: worldX,
                    y: worldY,
                    localIndex: i,
                    normalAngle: orientationRad + elementAngle + Math.PI / 2
                });
            }
        }
    }

    // ==================== PHASE DELAY CALCULATIONS ====================

    /**
     * Calculate phase delays for beam steering and focusing
     * @private
     */
    _calculatePhaseDelays() {
        this._elementPhases = [];
        const n = this._numElements;
        const steeringRad = this._steeringAngle * Math.PI / 180;
        const orientationRad = this._orientation * Math.PI / 180;
        const k = 2 * Math.PI / this._wavelength; // Wave number

        // Calculate steering direction components (global coordinates)
        const sinDir = Math.sin(steeringRad + orientationRad);
        const cosDir = Math.cos(steeringRad + orientationRad);

        // Pre-calculate focal point if needed
        let focalPoint = null;
        if (isFinite(this._focalDistance)) {
            focalPoint = {
                x: this._position.x + this._focalDistance * sinDir,
                y: this._position.y + this._focalDistance * cosDir
            };
        }

        for (let i = 0; i < n; i++) {
            const elemPos = this._elementPositions[i];
            let phase = 0;

            if (focalPoint) {
                // Near-field focusing: align phases to arrive at focal point simultaneously
                const distToFocus = Math.sqrt(
                    Math.pow(focalPoint.x - elemPos.x, 2) +
                    Math.pow(focalPoint.y - elemPos.y, 2)
                );

                // Phase correction relative to array center
                phase -= k * (distToFocus - this._focalDistance);
            } else {
                // Far-field steering: align phases for plane wave in steering direction
                const offsetX = elemPos.x - this._position.x;
                const offsetY = elemPos.y - this._position.y;

                // Projection of element position onto steering direction
                const projection = offsetX * sinDir + offsetY * cosDir;

                phase -= k * projection;
            }

            this._elementPhases.push(phase);
        }
    }

    /**
     * Recalculate all derived properties
     * @private
     */
    _recalculate() {
        this._wavelength = this._speedOfSound / this._frequency;
        this._calculateElementPositions();
        this._calculatePhaseDelays();
        this._dirty = false;
    }

    /**
     * Ensure calculations are up to date
     * @private
     */
    _ensureCalculated() {
        if (this._dirty) {
            this._recalculate();
        }
    }

    // ==================== PUBLIC API ====================

    /**
     * Get all element data for rendering
     * @returns {Array<{x: number, y: number, phase: number, amplitude: number}>}
     */
    getElementData() {
        this._ensureCalculated();

        if (!this._enabled) {
            return [];
        }

        return this._elementPositions.map((pos, i) => ({
            x: pos.x,
            y: pos.y,
            phase: this._elementPhases[i],
            amplitude: this._amplitude
        }));
    }

    /**
     * Get array aperture (total physical width)
     * @returns {number} Aperture in meters
     */
    getAperture() {
        if (this._geometry === 'linear') {
            return (this._numElements - 1) * this._pitch;
        } else {
            // Arc length for curved array
            return (this._numElements - 1) * this._pitch;
        }
    }

    /**
     * Calculate the beam pattern at a given angle (for far-field)
     * @param {number} angle - Angle in degrees
     * @returns {number} Normalized intensity (0-1)
     */
    calculateBeamPattern(angle) {
        this._ensureCalculated();

        const angleRad = angle * Math.PI / 180;
        const k = 2 * Math.PI / this._wavelength;

        let realSum = 0;
        let imagSum = 0;

        this._elementPositions.forEach((pos, i) => {
            const phase = this._elementPhases[i];
            const amplitude = this._amplitude;

            // Calculate phase contribution at this angle
            const pathLength = pos.x * Math.sin(angleRad) + pos.y * Math.cos(angleRad);
            const totalPhase = k * pathLength + phase;

            realSum += amplitude * Math.cos(totalPhase);
            imagSum += amplitude * Math.sin(totalPhase);
        });

        // Return normalized intensity
        const maxIntensity = this._numElements * this._numElements * this._amplitude * this._amplitude;
        return (realSum * realSum + imagSum * imagSum) / maxIntensity;
    }

    /**
     * Calculate intensity at a specific point
     * @param {number} x - X coordinate in meters
     * @param {number} y - Y coordinate in meters
     * @param {number} time - Time in seconds
     * @returns {number} Wave amplitude at the point
     */
    calculateFieldAt(x, y, time = 0) {
        this._ensureCalculated();

        if (!this._enabled) {
            return 0;
        }

        const k = 2 * Math.PI / this._wavelength;
        const omega = 2 * Math.PI * this._frequency;

        let realSum = 0;

        this._elementPositions.forEach((pos, i) => {
            const phase = this._elementPhases[i];
            const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);

            if (dist < 0.0001) return;

            // Wave amplitude with cylindrical spreading
            const amp = this._amplitude / Math.sqrt(dist + 0.01);
            const totalPhase = k * dist - omega * time + phase;

            realSum += amp * Math.cos(totalPhase);
        });

        return realSum;
    }

    /**
     * Serialize array configuration
     * @returns {Object}
     */
    toJSON() {
        return {
            name: this.name,
            numElements: this._numElements,
            pitch: this._pitch,
            frequency: this._frequency,
            steeringAngle: this._steeringAngle,
            position: { ...this._position },
            geometry: this._geometry,
            curvatureRadius: this._curvatureRadius,
            orientation: this._orientation,
            focalDistance: this._focalDistance,
            amplitude: this._amplitude,
            speedOfSound: this._speedOfSound,
            enabled: this._enabled
        };
    }

    /**
     * Create a PhasedArray from serialized data
     * @param {Object} json
     * @returns {PhasedArray}
     */
    static fromJSON(json) {
        return new PhasedArray(json);
    }
}


/**
 * SimulationContext - Data model holding all active phased arrays
 * Acts as the central state container for the simulation
 */
export class SimulationContext {
    constructor() {
        this.arrays = new Map();
        this.globalSettings = {
            speedOfSound: 343,
            fieldWidth: 0.5,      // meters
            fieldHeight: 0.5,    // meters
            fieldCenterX: 0,
            fieldCenterY: 0.15,
            displayMode: 0,      // 0 = instantaneous (propagating waves), 1 = intensity
            dynamicRange: 40,    // dB
            profileDepth: 0.2,   // meters (for beam profile view)
            timeScale: 1.0,
            paused: false
        };
        this._listeners = new Set();
    }

    /**
     * Add a phased array to the simulation
     * @param {PhasedArray} array
     */
    addArray(array) {
        if (array instanceof PhasedArray) {
            // Update speed of sound to match global setting
            array.speedOfSound = this.globalSettings.speedOfSound;
            this.arrays.set(array.id, array);
            this._notifyListeners('arrayAdded', array);
        }
    }

    /**
     * Remove a phased array from the simulation
     * @param {number} id
     */
    removeArray(id) {
        const array = this.arrays.get(id);
        if (array) {
            this.arrays.delete(id);
            this._notifyListeners('arrayRemoved', array);
        }
    }

    /**
     * Get a phased array by ID
     * @param {number} id
     * @returns {PhasedArray|undefined}
     */
    getArray(id) {
        return this.arrays.get(id);
    }

    /**
     * Get all phased arrays
     * @returns {Array<PhasedArray>}
     */
    getAllArrays() {
        return Array.from(this.arrays.values());
    }

    /**
     * Clear all arrays
     */
    clearArrays() {
        this.arrays.clear();
        PhasedArray._idCounter = 0;
        this._notifyListeners('cleared', null);
    }

    /**
     * Get total element count across all arrays
     * @returns {number}
     */
    getTotalElementCount() {
        let count = 0;
        for (const array of this.arrays.values()) {
            if (array.enabled) {
                count += array.numElements;
            }
        }
        return count;
    }

    /**
     * Get all element data for rendering (flattened)
     * @returns {Array<{x: number, y: number, phase: number, amplitude: number}>}
     */
    getAllElementData() {
        const elements = [];
        for (const array of this.arrays.values()) {
            elements.push(...array.getElementData());
        }
        return elements;
    }

    /**
     * Update global speed of sound
     * @param {number} value
     */
    setSpeedOfSound(value) {
        this.globalSettings.speedOfSound = value;
        for (const array of this.arrays.values()) {
            array.speedOfSound = value;
        }
        this._notifyListeners('settingsChanged', 'speedOfSound');
    }

    /**
     * Register a listener for context changes
     * @param {Function} callback
     */
    addListener(callback) {
        this._listeners.add(callback);
    }

    /**
     * Remove a listener
     * @param {Function} callback
     */
    removeListener(callback) {
        this._listeners.delete(callback);
    }

    /**
     * Notify all listeners of a change
     * @private
     */
    _notifyListeners(event, data) {
        for (const listener of this._listeners) {
            try {
                listener(event, data);
            } catch (e) {
                console.error('Listener error:', e);
            }
        }
    }
}