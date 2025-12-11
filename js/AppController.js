import { PhasedArray, SimulationContext } from './PhasedArray.js';
import { HeatmapRenderer, BeamPatternRenderer, ArrayVisualizationRenderer } from './Renderers.js';
import { getScenario } from './Scenarios.js';

export class AppController {
    constructor() {
        this.context = new SimulationContext();

        // Renderers
        this.heatmapRenderer = null;
        this.beamPatternRenderer = null;
        this.arrayVisRenderer = null;

        // State
        this.selectedArrayId = null;
        this.receivers = new Map();
        this.selectedReceiverId = 'rx1';
        this.time = 0;
        this.lastTime = performance.now();

        // SMOOTHING STATE
        // Stores { target: val, current: val } for properties
        this.targets = new Map();
    }

    init() {
        // Enforce Normalized Physics (Units = Wavelengths)
        this.context.globalSettings.speedOfSound = 1.0;

        // 1. Initialize Renderers
        const heatmapCanvas = document.getElementById('heatmap-canvas');
        const beamCanvas = document.getElementById('beam-pattern-canvas');
        const visCanvas = document.getElementById('array-vis-canvas');

        if (heatmapCanvas) this.heatmapRenderer = new HeatmapRenderer(heatmapCanvas);
        if (beamCanvas) this.beamPatternRenderer = new BeamPatternRenderer(beamCanvas);
        if (visCanvas) this.arrayVisRenderer = new ArrayVisualizationRenderer(visCanvas);

        this.overlayCanvas = document.getElementById('overlay-canvas');
        if (this.overlayCanvas) this.overlayCtx = this.overlayCanvas.getContext('2d');

        // 2. Initialize Default Receiver
        this._addReceiver();

        // 3. Bind UI Events
        this._bindEvents();

        // 4. Load Initial Scenario
        this.loadScenario('5G_MIMO');

        // 5. Start Loop
        this._animate();
    }

    _bindEvents() {
        // --- Scenario Loading ---
        const applyBtn = document.getElementById('apply-scenario');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.loadScenario(document.getElementById('scenario-select').value);
            });
        }

        // --- Array Management ---
        const addArrayBtn = document.getElementById('add-array');
        if (addArrayBtn) addArrayBtn.addEventListener('click', () => this._addNewArray());

        const removeArrayBtn = document.getElementById('remove-array');
        if (removeArrayBtn) removeArrayBtn.addEventListener('click', () => this._removeSelectedArray());

        const arraySelect = document.getElementById('array-select');
        if (arraySelect) arraySelect.addEventListener('change', (e) => this._selectArray(parseInt(e.target.value)));

        // --- Array Properties (SMOOTH Updates) ---

        const bindSlider = (id, prop, fmt, immediate = false) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                // Update label text immediately
                const labelEl = document.getElementById(id.replace('sld', 'val'));
                if (labelEl && fmt) labelEl.innerText = fmt(val);

                if (immediate) {
                    // Apply immediately for responsive controls
                    const array = this.context.getArray(this.selectedArrayId);
                    if (array) array[prop] = val;
                } else {
                    // Set TARGET for smoothing
                    this._setTargetProperty(prop, val);
                }

                // Handle pitch slider enable/disable based on element count
                if (prop === 'numElements') {
                    this._updatePitchSliderState(Math.round(val));
                }
            });
        };

        // numElements, steeringAngle apply immediately; pitch/freq can smooth
        bindSlider('sld-elem', 'numElements', v => Math.round(v), true);
        bindSlider('sld-pitch', 'pitch', v => v.toFixed(1) + 'λ', true);
        bindSlider('sld-curve', 'curvatureRadius', v => v + 'λ', true);
        bindSlider('sld-freq', 'frequency', v => v.toFixed(1) + 'x', true);
        bindSlider('sld-steer', 'steeringAngle', v => v + '°', true);

        // Geometry Radios (Immediate)
        document.querySelectorAll('input[name="geometry"]').forEach(r => {
            r.addEventListener('change', (e) => {
                const grpCurve = document.getElementById('grp-curve');
                if (grpCurve) grpCurve.style.display = (e.target.value === 'curved') ? 'block' : 'none';

                // Geometry changes are structural, apply immediately
                const array = this.context.getArray(this.selectedArrayId);
                if (array) {
                    array.geometry = e.target.value;
                    // Reset targets to prevent jumps
                    this.targets.clear();
                }
            });
        });

        // Text Inputs (Name, Position)
        ['pos-x', 'pos-y', 'array-name'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this._updateArrayFromInputs());
        });

        // --- Receiver Management ---
        const addRxBtn = document.getElementById('add-receiver');
        if (addRxBtn) addRxBtn.addEventListener('click', () => this._addReceiver());

        const removeRxBtn = document.getElementById('remove-receiver');
        if (removeRxBtn) removeRxBtn.addEventListener('click', () => this._removeReceiver());

        const rxSelect = document.getElementById('receiver-select');
        if (rxSelect) {
            rxSelect.addEventListener('change', (e) => {
                this._selectReceiver(e.target.value);
                this._updateInfoPanel(this.context.getArray(this.selectedArrayId));
            });
        }

        // Receiver Position Inputs
        ['rx-x', 'rx-y'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    const rx = this.receivers.get(this.selectedReceiverId);
                    if (rx) {
                        rx.x = parseFloat(document.getElementById('rx-x').value) || 0;
                        rx.y = parseFloat(document.getElementById('rx-y').value) || 0;
                    }
                });
            }
        });

        const speedSld = document.getElementById('sld-speed');
        if (speedSld) {
            speedSld.addEventListener('input', (e) => {
                this.context.globalSettings.timeScale = parseFloat(e.target.value);
            });
        }

        window.addEventListener('resize', () => this._onResize());
    }

    _setTargetProperty(prop, value) {
        if (!this.selectedArrayId) return;
        const key = `${this.selectedArrayId}_${prop}`;

        // Handle Freq scaling: UI 1.0 -> Physics 1.0 (Normalized)
        // If prop is frequency, we map slider 1.0 to 1.0 Hz in normalized physics
        // so no multiplication needed if we stick to normalized units.

        this.targets.set(key, value);
    }

    _smoothUpdate() {
        const array = this.context.getArray(this.selectedArrayId);
        if (!array) return;

        // Interpolation factor (0.1 = smooth, 0.5 = fast)
        const lerp = (start, end, amt) => (1 - amt) * start + amt * end;
        const alpha = 0.15;

        this.targets.forEach((targetVal, key) => {
            // Split only at first underscore to handle property names correctly
            const underscoreIdx = key.indexOf('_');
            if (underscoreIdx === -1) return;
            const id = key.substring(0, underscoreIdx);
            const prop = key.substring(underscoreIdx + 1);

            if (id != this.selectedArrayId) return;

            let currentVal = array[prop];
            if (currentVal === undefined) return;

            // Check threshold to stop updating
            if (Math.abs(targetVal - currentVal) < 0.01) {
                array[prop] = targetVal;
                this.targets.delete(key);
            } else {
                array[prop] = lerp(currentVal, targetVal, alpha);
            }
        });
    }

    _updatePitchSliderState(numElements) {
        const pitchSlider = document.getElementById('sld-pitch');
        const pitchLabel = document.querySelector('.control-group:has(#sld-pitch) .control-label');

        if (pitchSlider) {
            if (numElements <= 1) {
                pitchSlider.disabled = true;
                pitchSlider.style.opacity = '0.4';
                pitchSlider.style.cursor = 'not-allowed';
            } else {
                pitchSlider.disabled = false;
                pitchSlider.style.opacity = '1';
                pitchSlider.style.cursor = 'pointer';
            }
        }
    }

    _updateArrayFromInputs() {
        const array = this.context.getArray(this.selectedArrayId);
        if (!array) return;

        const posX = document.getElementById('pos-x');
        const posY = document.getElementById('pos-y');
        const nameInput = document.getElementById('array-name');

        if (posX && posY) {
            array.position = {
                x: parseFloat(posX.value) || 0,
                y: parseFloat(posY.value) || 0
            };
        }

        if (nameInput) {
            array.name = nameInput.value;
            const option = document.querySelector(`#array-select option[value="${array.id}"]`);
            if (option) option.text = array.name;
        }
    }

    loadScenario(key) {
        const scenario = getScenario(key);
        if (!scenario) return;

        this.context.clearArrays();
        this.targets.clear(); // Clear smoothing targets

        if (scenario.globalSettings) {
            this.context.globalSettings = { ...this.context.globalSettings, ...scenario.globalSettings };
            // FORCE NORMALIZED SPEED
            this.context.globalSettings.speedOfSound = 1.0;
        }

        if (scenario.arrays) {
            scenario.arrays.forEach(conf => {
                // Ensure array config matches normalized physics
                conf.speedOfSound = 1.0;
                // Scenario file might have 40000 Hz, map to 1.0
                if (conf.frequency > 100) conf.frequency = 1.0;

                const arr = new PhasedArray(conf);
                this.context.addArray(arr);
            });
        }

        this._refreshArrayDropdown();
        const allArrays = this.context.getAllArrays();
        if (allArrays.length > 0) {
            this._selectArray(allArrays[0].id);
        }
    }

    _refreshArrayDropdown() {
        const sel = document.getElementById('array-select');
        if (!sel) return;

        sel.innerHTML = '';
        this.context.getAllArrays().forEach(arr => {
            const opt = document.createElement('option');
            opt.value = arr.id;
            opt.text = arr.name;
            sel.appendChild(opt);
        });
    }

    _selectArray(id) {
        if (!id) return;
        this.selectedArrayId = id;
        const array = this.context.getArray(id);
        if (!array) return;

        // Clear smoothing targets on swap
        this.targets.clear();

        const arrSel = document.getElementById('array-select');
        if (arrSel) arrSel.value = id;

        const nameInput = document.getElementById('array-name');
        if (nameInput) nameInput.value = array.name;

        const posX = document.getElementById('pos-x');
        const posY = document.getElementById('pos-y');
        if (posX) posX.value = array.position.x;
        if (posY) posY.value = array.position.y;

        const setSlider = (id, val, textId, fmt) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
            const txt = document.getElementById(textId);
            if (txt) txt.innerText = fmt(val);
        };

        setSlider('sld-elem', array.numElements, 'val-elem', v => v);
        setSlider('sld-pitch', array.pitch, 'val-pitch', v => v.toFixed(1) + 'λ');
        setSlider('sld-curve', array.curvatureRadius, 'val-curve', v => v + 'λ');
        setSlider('sld-freq', array.frequency, 'val-freq', v => v.toFixed(1) + 'x');
        setSlider('sld-steer', array.steeringAngle, 'val-steer', v => v + '°');

        // Update pitch slider state based on element count
        this._updatePitchSliderState(array.numElements);

        const radLin = document.getElementById('geo-lin');
        const radCur = document.getElementById('geo-cur');
        if (radLin && radCur) {
            if (array.geometry === 'curved') radCur.checked = true;
            else radLin.checked = true;
        }

        const grpCurve = document.getElementById('grp-curve');
        if (grpCurve) grpCurve.style.display = array.geometry === 'curved' ? 'flex' : 'none';

        this._updateInfoPanel(array);
    }

    _addNewArray() {
        // Default new array uses normalized physics
        const arr = new PhasedArray({
            name: 'New Array',
            numElements: 16,
            frequency: 1.0,
            speedOfSound: 1.0
        });
        this.context.addArray(arr);
        this._refreshArrayDropdown();
        this._selectArray(arr.id);
    }

    _removeSelectedArray() {
        if (this.context.getAllArrays().length <= 1) {
            alert("Cannot remove the last array.");
            return;
        }
        this.context.removeArray(this.selectedArrayId);
        this._refreshArrayDropdown();
        const first = this.context.getAllArrays()[0];
        if (first) this._selectArray(first.id);
    }

    _addReceiver() {
        const id = 'rx' + (this.receivers.size + 1 + Math.floor(Math.random() * 1000));
        this.receivers.set(id, { id, name: 'Probe ' + (this.receivers.size + 1), x: 0, y: 10 });
        this._refreshRxDropdown();
        this._selectReceiver(id);
    }

    _refreshRxDropdown() {
        const sel = document.getElementById('receiver-select');
        if (!sel) return;
        sel.innerHTML = '';
        this.receivers.forEach(rx => {
            const opt = document.createElement('option');
            opt.value = rx.id;
            opt.text = rx.name;
            sel.appendChild(opt);
        });
    }

    _selectReceiver(id) {
        this.selectedReceiverId = id;
        const rx = this.receivers.get(id);
        const rxX = document.getElementById('rx-x');
        const rxY = document.getElementById('rx-y');

        if (rx) {
            if (rxX) rxX.value = rx.x;
            if (rxY) rxY.value = rx.y;
            const nameLabel = document.getElementById('info-rx-name');
            if (nameLabel) nameLabel.innerText = rx.name;
        }
    }

    _removeReceiver() {
        if (this.receivers.size <= 1) return;
        this.receivers.delete(this.selectedReceiverId);
        this._refreshRxDropdown();
        const nextRx = this.receivers.keys().next().value;
        this._selectReceiver(nextRx);
    }

    _animate() {
        requestAnimationFrame(() => this._animate());

        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // 1. APPLY SMOOTHING
        this._smoothUpdate();

        // 2. TIME STEP
        const chkWaves = document.getElementById('chk-waves');
        if (!chkWaves || chkWaves.checked) {
            this.time += dt * this.context.globalSettings.timeScale;
        }

        // 3. RENDER
        if (this.heatmapRenderer) this.heatmapRenderer.render(this.context, this.time);
        if (this.beamPatternRenderer) this.beamPatternRenderer.render(this.context, this.selectedArrayId);
        if (this.arrayVisRenderer) this.arrayVisRenderer.render(this.context, this.receivers, this.selectedReceiverId);

        this._renderOverlay();
        this._updateStats();
        this._updateInfoPanel(this.context.getArray(this.selectedArrayId));
    }

    _renderOverlay() {
        if (!this.overlayCtx || !this.overlayCanvas) return;

        const cvs = this.overlayCanvas;
        const ctx = this.overlayCtx;

        if (cvs.width !== cvs.parentElement.clientWidth || cvs.height !== cvs.parentElement.clientHeight) {
            cvs.width = cvs.parentElement.clientWidth;
            cvs.height = cvs.parentElement.clientHeight;
        }

        ctx.clearRect(0, 0, cvs.width, cvs.height);

        const settings = this.context.globalSettings;
        const aspect = cvs.width / cvs.height;
        const mapX = (x) => ((x - settings.fieldCenterX) / settings.fieldWidth / aspect + 0.5) * cvs.width;
        const mapY = (y) => (0.5 - (y - settings.fieldCenterY) / settings.fieldHeight) * cvs.height;

        this.receivers.forEach(rx => {
            const x = mapX(rx.x);
            const y = mapY(rx.y);

            ctx.strokeStyle = (rx.id === this.selectedReceiverId) ? '#fff' : 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y);
            ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10);
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.font = '10px monospace';
            ctx.fillText(rx.name, x + 12, y - 12);
        });
    }

    _updateStats() {
        const fpsEl = document.getElementById('fps-counter');
        if (fpsEl) fpsEl.innerText = '60';
    }

    _updateInfoPanel(array) {
        if (!array) return;
        const elType = document.getElementById('info-type');
        if (elType) elType.innerText = array.geometry.toUpperCase();

        const elAp = document.getElementById('info-aperture');
        if (elAp) elAp.innerText = array.getAperture().toFixed(1) + 'λ';

        const elAng = document.getElementById('info-angle');
        if (elAng) elAng.innerText = array.steeringAngle.toFixed(1) + '°'; // Show smoothed value

        const elFoc = document.getElementById('info-focus');
        if (elFoc) elFoc.innerText = (array.focalDistance < 1000) ? array.focalDistance + 'λ' : 'Infinity';

        const rx = this.receivers.get(this.selectedReceiverId);
        if (rx) {
            const rxPos = document.getElementById('info-rx-pos');
            if (rxPos) rxPos.innerText = `${rx.x.toFixed(1)}, ${rx.y.toFixed(1)}`;

            let signal = 0;
            this.context.getAllArrays().forEach(arr => {
                if (arr.enabled) signal += arr.calculateFieldAt(rx.x, rx.y, this.time);
            });

            const db = 20 * Math.log10(Math.abs(signal) + 0.0001);
            const elSig = document.getElementById('info-signal');
            if (elSig) elSig.innerText = db.toFixed(1) + ' dB';
        }
    }

    _onResize() {
        if (this.heatmapRenderer) this.heatmapRenderer.render(this.context, this.time);
        if (this.beamPatternRenderer) this.beamPatternRenderer.resize();
        if (this.arrayVisRenderer) this.arrayVisRenderer.resize();
    }
}