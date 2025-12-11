/**
 * AppController.js - Main Application Controller
 * 
 * Orchestrates the simulation by connecting:
 * - Custom UI controls
 * - SimulationContext (data model)
 * - Renderers (visualization)
 * 
 * Handles the render loop and UI event binding
 */

import { PhasedArray, SimulationContext } from './PhasedArray.js';
import { HeatmapRenderer, BeamPatternRenderer, ArrayVisualizationRenderer } from './Renderers.js';
import { getScenarioNames, getScenario } from './Scenarios.js';

export class AppController {
    constructor() {
        // Core components
        this.context = new SimulationContext();
        this.heatmapRenderer = null;
        this.beamPatternRenderer = null;
        this.arrayVisRenderer = null;

        // Animation state
        this.isRunning = true;
        this.time = 0;
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.fps = 0;
        this.fpsUpdateInterval = 500;
        this.lastFpsUpdate = 0;

        // Current selection
        this.selectedArrayId = null;
        this.receivers = new Map();
        this.selectedReceiverId = 'receiver1';
        this.receiverCounter = 1;

        // Display options
        this.showElements = true;
        this.animateWaves = true;
        this.timeScale = 1.0;

        // Bind methods
        this._animate = this._animate.bind(this);
        this._onResize = this._onResize.bind(this);
    }

    /**
     * Initialize the application
     */
    init() {
        // Get canvas elements
        const heatmapCanvas = document.getElementById('heatmap-canvas');
        const overlayCanvas = document.getElementById('overlay-canvas');
        const beamPatternCanvas = document.getElementById('beam-pattern-canvas');
        const arrayVisCanvas = document.getElementById('array-vis-canvas');

        if (!heatmapCanvas) {
            console.error('Canvas elements not found');
            return;
        }

        // Initialize renderers
        this.heatmapRenderer = new HeatmapRenderer(heatmapCanvas);
        this.beamPatternRenderer = new BeamPatternRenderer(beamPatternCanvas);
        this.arrayVisRenderer = new ArrayVisualizationRenderer(arrayVisCanvas);
        this.overlayCanvas = overlayCanvas;
        this.overlayCtx = overlayCanvas?.getContext('2d');

        // Initialize default receiver
        this.receivers.set('receiver1', {
            id: 'receiver1',
            name: 'receiver1',
            x: 0,
            y: 5
        });

        // Setup resize handler
        window.addEventListener('resize', this._onResize);
        this._onResize();

        // Bind UI events
        this._bindUIEvents();

        // Load default scenario
        this._loadScenario('5G_MIMO');

        // Start animation loop
        this.lastFrameTime = performance.now();
        requestAnimationFrame(this._animate);
    }

    /**
     * Handle window resize
     * @private
     */
    _onResize() {
        if (this.heatmapRenderer) this.heatmapRenderer.resize();
        if (this.beamPatternRenderer) this.beamPatternRenderer.resize();
        if (this.arrayVisRenderer) this.arrayVisRenderer.resize();

        // Resize overlay canvas
        if (this.overlayCanvas) {
            const parent = this.overlayCanvas.parentElement;
            const dpr = window.devicePixelRatio || 1;
            this.overlayCanvas.width = parent.clientWidth * dpr;
            this.overlayCanvas.height = parent.clientHeight * dpr;
        }
    }

    /**
     * Bind all UI event handlers
     * @private
     */
    _bindUIEvents() {
        // Scenario controls
        document.getElementById('apply-scenario')?.addEventListener('click', () => {
            const scenario = document.getElementById('scenario-select').value;
            this._loadScenario(scenario);
        });

        // Array controls
        document.getElementById('add-array')?.addEventListener('click', () => this._addNewArray());
        document.getElementById('save-array')?.addEventListener('click', () => this._saveCurrentArray());
        document.getElementById('remove-array')?.addEventListener('click', () => this._removeCurrentArray());

        document.getElementById('array-select')?.addEventListener('change', (e) => {
            this._selectArray(parseInt(e.target.value));
        });

        // Geometry radio buttons
        document.querySelectorAll('input[name="geometry"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const curvatureGroup = document.getElementById('curvature-group');
                if (e.target.value === 'curved') {
                    curvatureGroup.style.display = 'block';
                } else {
                    curvatureGroup.style.display = 'none';
                }
            });
        });

        // Sliders with live update
        this._bindSlider('transmitters-slider', 'transmitters-value', (v) => v);
        this._bindSlider('spacing-slider', 'spacing-value', (v) => v + 'λ');
        this._bindSlider('curvature-slider', 'curvature-value', (v) => v + 'm');
        this._bindSlider('frequency-slider', 'frequency-value', (v) => v);
        this._bindSlider('steering-slider', 'steering-value', (v) => v + '°');
        this._bindSlider('timescale-slider', 'timescale-value', (v) => v, (v) => {
            this.timeScale = parseFloat(v);
        });

        // Receiver controls
        document.getElementById('add-receiver')?.addEventListener('click', () => this._addNewReceiver());
        document.getElementById('save-receiver')?.addEventListener('click', () => this._saveCurrentReceiver());
        document.getElementById('remove-receiver')?.addEventListener('click', () => this._removeCurrentReceiver());

        document.getElementById('receiver-select')?.addEventListener('change', (e) => {
            this._selectReceiver(e.target.value);
        });

        // Display options
        document.getElementById('show-elements')?.addEventListener('change', (e) => {
            this.showElements = e.target.checked;
        });

        document.getElementById('animate-waves')?.addEventListener('change', (e) => {
            this.animateWaves = e.target.checked;
        });
    }

    /**
     * Bind a slider to its value display
     * @private
     */
    _bindSlider(sliderId, valueId, formatter, callback = null) {
        const slider = document.getElementById(sliderId);
        const valueDisplay = document.getElementById(valueId);

        if (slider && valueDisplay) {
            slider.addEventListener('input', (e) => {
                valueDisplay.textContent = formatter(e.target.value);
                if (callback) callback(e.target.value);
            });
        }
    }

    /**
     * Load a scenario configuration
     * @param {string} scenarioKey
     * @private
     */
    _loadScenario(scenarioKey) {
        const scenario = getScenario(scenarioKey);
        if (!scenario) {
            console.error('Scenario not found:', scenarioKey);
            return;
        }

        // Clear existing arrays
        this.context.clearArrays();

        // Apply global settings
        Object.assign(this.context.globalSettings, scenario.globalSettings);

        // Create arrays
        for (const arrayConfig of scenario.arrays) {
            const array = new PhasedArray(arrayConfig);
            this.context.addArray(array);
        }

        // Update array dropdown
        this._updateArrayDropdown();

        // Select first array
        const arrays = this.context.getAllArrays();
        if (arrays.length > 0) {
            this._selectArray(arrays[0].id);
        }

        console.log(`Loaded scenario: ${scenario.name}`);
    }

    /**
     * Update the array selection dropdown
     * @private
     */
    _updateArrayDropdown() {
        const select = document.getElementById('array-select');
        if (!select) return;

        select.innerHTML = '';
        const arrays = this.context.getAllArrays();

        for (const array of arrays) {
            const option = document.createElement('option');
            option.value = array.id;
            option.textContent = array.name;
            select.appendChild(option);
        }

        if (this.selectedArrayId) {
            select.value = this.selectedArrayId;
        }
    }

    /**
     * Select an array and update UI controls
     * @private
     */
    _selectArray(arrayId) {
        const array = this.context.getArray(arrayId);
        if (!array) return;

        this.selectedArrayId = arrayId;

        // Update all controls
        document.getElementById('transmitters-slider').value = array.numElements;
        document.getElementById('transmitters-value').textContent = array.numElements;

        // Pitch is already in wavelengths
        document.getElementById('spacing-slider').value = array.pitch;
        document.getElementById('spacing-value').textContent = array.pitch.toFixed(1) + 'λ';

        document.getElementById('curvature-slider').value = array.curvatureRadius;
        document.getElementById('curvature-value').textContent = array.curvatureRadius.toFixed(1) + 'λ';

        // Frequency (normalized)
        const freqNormalized = array.frequency / 40000;
        document.getElementById('frequency-slider').value = freqNormalized;
        document.getElementById('frequency-value').textContent = freqNormalized.toFixed(1);

        document.getElementById('position-x').value = array.position.x.toFixed(1);
        document.getElementById('position-y').value = array.position.y.toFixed(1);

        document.getElementById('steering-slider').value = array.steeringAngle;
        document.getElementById('steering-value').textContent = array.steeringAngle + '°';

        document.getElementById('array-name').value = array.name;

        // Geometry radio
        if (array.geometry === 'curved') {
            document.getElementById('geometry-curved').checked = true;
            document.getElementById('curvature-group').style.display = 'block';
        } else {
            document.getElementById('geometry-linear').checked = true;
            document.getElementById('curvature-group').style.display = 'none';
        }

        // Update info panel
        this._updateInfoPanel();

        // Update dropdown selection
        const select = document.getElementById('array-select');
        if (select) select.value = arrayId;
    }

    /**
     * Save changes to current array
     * @private
     */
    _saveCurrentArray() {
        const array = this.context.getArray(this.selectedArrayId);
        if (!array) return;

        // Read values from controls
        array.numElements = parseInt(document.getElementById('transmitters-slider').value);

        // Pitch is directly in wavelengths
        array.pitch = parseFloat(document.getElementById('spacing-slider').value);

        array.curvatureRadius = parseFloat(document.getElementById('curvature-slider').value);

        const freqNormalized = parseFloat(document.getElementById('frequency-slider').value);
        array.frequency = freqNormalized * 40000;

        array.position = {
            x: parseFloat(document.getElementById('position-x').value),
            y: parseFloat(document.getElementById('position-y').value)
        };

        array.steeringAngle = parseInt(document.getElementById('steering-slider').value);
        array.name = document.getElementById('array-name').value;

        // Geometry
        array.geometry = document.querySelector('input[name="geometry"]:checked').value;

        // Update dropdown
        this._updateArrayDropdown();
        this._updateInfoPanel();
    }

    /**
     * Add a new array
     * @private
     */
    _addNewArray() {
        const arrays = this.context.getAllArrays();
        const newArray = new PhasedArray({
            name: `array ${arrays.length + 1}`,
            numElements: 16,
            pitch: 0.5,
            frequency: 40000,
            steeringAngle: 0,
            position: { x: 0, y: 0 },
            geometry: 'linear',
            curvatureRadius: 5,
            orientation: 0,
            focalDistance: Infinity,
            amplitude: 1.0,
            speedOfSound: this.context.globalSettings.speedOfSound
        });

        this.context.addArray(newArray);
        this._updateArrayDropdown();
        this._selectArray(newArray.id);
    }

    /**
     * Remove current array
     * @private
     */
    _removeCurrentArray() {
        if (!this.selectedArrayId) return;

        this.context.removeArray(this.selectedArrayId);
        this._updateArrayDropdown();

        const arrays = this.context.getAllArrays();
        if (arrays.length > 0) {
            this._selectArray(arrays[0].id);
        } else {
            this.selectedArrayId = null;
        }
    }

    /**
     * Update the receiver dropdown
     * @private
     */
    _updateReceiverDropdown() {
        const select = document.getElementById('receiver-select');
        if (!select) return;

        select.innerHTML = '';

        for (const [id, receiver] of this.receivers) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = receiver.name;
            select.appendChild(option);
        }

        if (this.selectedReceiverId) {
            select.value = this.selectedReceiverId;
        }
    }

    /**
     * Select a receiver
     * @private
     */
    _selectReceiver(receiverId) {
        const receiver = this.receivers.get(receiverId);
        if (!receiver) return;

        this.selectedReceiverId = receiverId;

        document.getElementById('receiver-x').value = receiver.x;
        document.getElementById('receiver-y').value = receiver.y;
        document.getElementById('receiver-name').value = receiver.name;
    }

    /**
     * Save current receiver
     * @private
     */
    _saveCurrentReceiver() {
        const receiver = this.receivers.get(this.selectedReceiverId);
        if (!receiver) return;

        receiver.x = parseFloat(document.getElementById('receiver-x').value);
        receiver.y = parseFloat(document.getElementById('receiver-y').value);
        receiver.name = document.getElementById('receiver-name').value;

        this._updateReceiverDropdown();
    }

    /**
     * Add new receiver
     * @private
     */
    _addNewReceiver() {
        this.receiverCounter++;
        const id = `receiver${this.receiverCounter}`;

        this.receivers.set(id, {
            id,
            name: `receiver${this.receiverCounter}`,
            x: 0,
            y: 5
        });

        this._updateReceiverDropdown();
        this._selectReceiver(id);
    }

    /**
     * Remove current receiver
     * @private
     */
    _removeCurrentReceiver() {
        if (this.receivers.size <= 1) return;

        this.receivers.delete(this.selectedReceiverId);
        this._updateReceiverDropdown();

        const firstKey = this.receivers.keys().next().value;
        this._selectReceiver(firstKey);
    }

    /**
     * Update the info panel
     * @private
     */
    _updateInfoPanel() {
        const array = this.context.getArray(this.selectedArrayId);
        if (!array) return;

        document.getElementById('info-array-name').textContent = array.name;
        document.getElementById('info-type').textContent = array.geometry === 'linear' ? 'Linear' : 'Curved';
        document.getElementById('info-transmitters').textContent = array.numElements;

        // Pitch is directly in wavelength units now
        document.getElementById('info-spacing').textContent = array.pitch.toFixed(1) + 'λ';

        const freqNorm = (array.frequency / 40000).toFixed(1);
        document.getElementById('info-frequency').textContent = freqNorm + 'Hz';

        document.getElementById('info-position').textContent =
            `${array.position.x.toFixed(0)}x ${array.position.y.toFixed(0)}y`;

        document.getElementById('info-steering').textContent = array.steeringAngle + '°';
        document.getElementById('info-wavelength').textContent = '1.0';

        // Update receiver info
        const receiver = this.receivers.get(this.selectedReceiverId);
        if (receiver) {
            document.getElementById('info-receiver-name').textContent = receiver.name;
            document.getElementById('info-receiver-pos').textContent =
                `${receiver.x.toFixed(0)}x ${receiver.y.toFixed(0)}y`;
        }
    }

    /**
     * Update statistics display
     * @private
     */
    _updateStats() {
        const elementCountEl = document.getElementById('element-count');
        if (elementCountEl) {
            elementCountEl.textContent = this.context.getTotalElementCount();
        }
    }

    /**
     * Render the overlay (elements, receivers, axes)
     * @private
     */
    _renderOverlay() {
        if (!this.overlayCtx || !this.overlayCanvas) return;

        const ctx = this.overlayCtx;
        const width = this.overlayCanvas.width;
        const height = this.overlayCanvas.height;
        const settings = this.context.globalSettings;

        ctx.clearRect(0, 0, width, height);

        // Transform functions
        const toCanvasX = (x) => {
            const normalizedX = (x - settings.fieldCenterX) / settings.fieldWidth + 0.5;
            return normalizedX * width;
        };

        const toCanvasY = (y) => {
            const normalizedY = (y - settings.fieldCenterY) / settings.fieldHeight + 0.5;
            return (1 - normalizedY) * height;
        };

        // Draw elements if enabled
        if (this.showElements) {
            const arrays = this.context.getAllArrays();
            const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444'];

            arrays.forEach((array, arrayIdx) => {
                if (!array.enabled) return;

                const elements = array.getElementData();
                const color = colors[arrayIdx % colors.length];

                elements.forEach(elem => {
                    const x = toCanvasX(elem.x);
                    const y = toCanvasY(elem.y);

                    ctx.beginPath();
                    ctx.arc(x, y, 4, 0, Math.PI * 2);
                    ctx.fillStyle = color;
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                });
            });
        }

        // Draw receivers
        for (const [id, receiver] of this.receivers) {
            const x = toCanvasX(receiver.x);
            const y = toCanvasY(receiver.y);

            // X marker
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
            const size = 8;
            ctx.beginPath();
            ctx.moveTo(x - size, y - size);
            ctx.lineTo(x + size, y + size);
            ctx.moveTo(x + size, y - size);
            ctx.lineTo(x - size, y + size);
            ctx.stroke();

            // Label
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText(receiver.name, x + 12, y + 4);

            // Calculate signal strength at receiver
            let signalStrength = 0;
            const arrays = this.context.getAllArrays();
            for (const array of arrays) {
                signalStrength += Math.abs(array.calculateFieldAt(receiver.x, receiver.y, this.time));
            }

            document.getElementById('info-signal-strength').textContent = signalStrength.toFixed(2);
        }
    }

    /**
     * Main animation loop
     * @private
     */
    _animate(currentTime) {
        requestAnimationFrame(this._animate);

        // Calculate delta time
        const deltaTime = (currentTime - this.lastFrameTime) / 1000;
        this.lastFrameTime = currentTime;

        // Update FPS counter
        this.frameCount++;
        if (currentTime - this.lastFpsUpdate >= this.fpsUpdateInterval) {
            this.fps = Math.round(this.frameCount * 1000 / (currentTime - this.lastFpsUpdate));
            this.frameCount = 0;
            this.lastFpsUpdate = currentTime;

            const fpsEl = document.getElementById('fps');
            if (fpsEl) fpsEl.textContent = this.fps;

            this._updateStats();
        }

        // Update simulation time
        if (this.animateWaves) {
            this.time += deltaTime * this.timeScale;
        }

        // Render heatmap
        if (this.heatmapRenderer) {
            this.heatmapRenderer.render(this.context, this.time);
        }

        // Render overlay
        this._renderOverlay();

        // Render beam pattern
        if (this.beamPatternRenderer) {
            this.beamPatternRenderer.render(this.context, this.selectedArrayId);
        }

        // Render array visualization
        if (this.arrayVisRenderer) {
            this.arrayVisRenderer.render(this.context, this.receivers, this.selectedReceiverId);
        }
    }

    /**
     * Cleanup resources
     */
    dispose() {
        window.removeEventListener('resize', this._onResize);
        if (this.heatmapRenderer) this.heatmapRenderer.dispose();
    }
}
