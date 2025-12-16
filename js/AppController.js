import { PhasedArray, SimulationContext } from './PhasedArray.js';
import { HeatmapRenderer, BeamPatternRenderer, ArrayVisualizationRenderer } from './Renderers.js';
import { getScenario, getScenarioList } from './Scenarios.js';

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
        this.currentScenarioKey = null;

        this.physicsState = {
            baseFrequency: 40000,
            speedOfSound: 343,
            baseWavelength: 343 / 40000,
            scaleFactor: 1.0 / (343 / 40000)
        };

        // Stores { target: val, current: val } for properties
        this.targets = new Map();
    }

    init() {
        // Scenario Dropdown
        const scenarioSelect = document.getElementById('scenario-select');
        if (scenarioSelect) {
            scenarioSelect.innerHTML = '';
            getScenarioList().forEach(sc => {
                const opt = document.createElement('option');
                opt.value = sc.key;
                opt.innerText = sc.name;
                scenarioSelect.appendChild(opt);
            });
            scenarioSelect.value = '5G_MIMO';
        }

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
        // Scenario Loading 
        const applyBtn = document.getElementById('apply-scenario');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.loadScenario(document.getElementById('scenario-select').value);
            });
        }

        //  Array Management 
        const addArrayBtn = document.getElementById('add-array');
        if (addArrayBtn) addArrayBtn.addEventListener('click', () => this._addNewArray());

        const removeArrayBtn = document.getElementById('remove-array');
        if (removeArrayBtn) removeArrayBtn.addEventListener('click', () => this._removeSelectedArray());

        const arraySelect = document.getElementById('array-select');
        if (arraySelect) arraySelect.addEventListener('change', (e) => this._selectArray(parseInt(e.target.value)));

        // Array Properties 

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
        bindSlider('sld-freq', 'frequency', v => this._formatFrequency(v), true);
        bindSlider('sld-steer', 'steeringAngle', v => v + '°', true);

        // Focal Distance Controls
        const sldFocus = document.getElementById('sld-focus');
        const chkFocusInf = document.getElementById('chk-focus-inf');
        const valFocus = document.getElementById('val-focus');

        if (sldFocus && chkFocusInf) {
            // Slider Change
            sldFocus.addEventListener('input', (e) => {
                if (chkFocusInf.checked) return;
                const val = parseFloat(e.target.value);
                if (valFocus) valFocus.innerText = val + 'λ';

                // Apply immediately
                const array = this.context.getArray(this.selectedArrayId);
                if (array) {
                    array.focalDistance = val;
                    this._updateInfoPanel(array);
                }
            });

            // Checkbox (Infinity) Toggle
            chkFocusInf.addEventListener('change', (e) => {
                const isInf = e.target.checked;
                sldFocus.disabled = isInf;
                sldFocus.style.opacity = isInf ? '0.5' : '1';

                const array = this.context.getArray(this.selectedArrayId);
                if (!array) return;

                if (isInf) {
                    array.focalDistance = Infinity;
                    if (valFocus) valFocus.innerText = 'Infinity';
                } else {
                    // Revert to slider value
                    const val = parseFloat(sldFocus.value);
                    array.focalDistance = val;
                    if (valFocus) valFocus.innerText = val + 'λ';
                }
                this._updateInfoPanel(array);
            });
        }

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

        // Text Inputs (Name)
        ['array-name'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this._updateArrayFromInputs());
        });

        //  Interaction (Drag & Drop) 
        this._bindInteractionEvents();

        //  Receiver Management 
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

        const speedSld = document.getElementById('sld-speed');
        if (speedSld) {
            speedSld.addEventListener('input', (e) => {
                this.context.globalSettings.timeScale = parseFloat(e.target.value);
            });
        }

        window.addEventListener('resize', () => this._onResize());
    }

    _bindInteractionEvents() {
        const canvas = document.getElementById('overlay-canvas');
        if (!canvas) return;

        let isDragging = false;
        let dragTarget = null; // { type: 'array'|'receiver', id: string }

        const getMousePos = (e) => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        };

        const screenToPhysics = (sx, sy) => {
            const rect = canvas.getBoundingClientRect();
            const settings = this.context.globalSettings;
            const aspect = rect.width / rect.height;

            // Inverse of mapX/mapY
            // mapX = ((x - cx) / w / aspect + 0.5) * cw
            // x = ((sx / cw - 0.5) * aspect * w) + cx

            const x = ((sx / rect.width - 0.5) * aspect * settings.fieldWidth) + settings.fieldCenterX;
            const y = settings.fieldCenterY - ((sy / rect.height - 0.5) * settings.fieldHeight);

            return { x, y };
        };

        canvas.addEventListener('mousedown', (e) => {
            const m = getMousePos(e);
            const p = screenToPhysics(m.x, m.y);

            // Check Receivers
            for (const [id, rx] of this.receivers) {
                const dx = p.x - rx.x;
                const dy = p.y - rx.y;
                const hitRadius = this.context.globalSettings.fieldWidth * 0.05;

                if (Math.sqrt(dx * dx + dy * dy) < hitRadius) {
                    isDragging = true;
                    dragTarget = { type: 'receiver', id: id };
                    this._selectReceiver(id);
                    return;
                }
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!isDragging || !dragTarget) {
                // Hover cursor logic could go here
                return;
            }

            const m = getMousePos(e);
            const p = screenToPhysics(m.x, m.y);

            if (dragTarget.type === 'receiver') {
                const rx = this.receivers.get(dragTarget.id);
                if (rx) {
                    rx.x = p.x;
                    rx.y = p.y;
                }
            }
        });

        canvas.addEventListener('mouseup', () => {
            isDragging = false;
            dragTarget = null;
        });

        canvas.addEventListener('mouseleave', () => {
            isDragging = false;
            dragTarget = null;
        });
    }

    _setTargetProperty(prop, value) {
        if (!this.selectedArrayId) return;
        const key = `${this.selectedArrayId}_${prop}`;
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

    _formatFrequency(val) {
        if (!this.physicsState) return val.toFixed(1) + 'x';
        const realHz = val * this.physicsState.baseFrequency;

        if (realHz >= 1e9) return (realHz / 1e9).toFixed(2) + ' GHz';
        if (realHz >= 1e6) return (realHz / 1e6).toFixed(2) + ' MHz';
        if (realHz >= 1e3) return (realHz / 1e3).toFixed(2) + ' kHz';
        return Math.round(realHz) + ' Hz';
    }

    _updateArrayFromInputs() {
        const array = this.context.getArray(this.selectedArrayId);
        if (!array) return;

        const nameInput = document.getElementById('array-name');

        if (nameInput) {
            array.name = nameInput.value;
            const option = document.querySelector(`#array-select option[value="${array.id}"]`);
            if (option) option.text = array.name;
        }
    }

    loadScenario(key) {
        const scenario = getScenario(key);
        if (!scenario) return;

        this.currentScenarioKey = key;
        this.context.clearArrays();
        this.targets.clear(); // Clear smoothing targets

        // 1. Determine Physics Basis
        // Default to 40kHz / 343m/s if not specified
        let baseFreq = 40000;
        let speedOfSound = 343;

        if (scenario.globalSettings && scenario.globalSettings.speedOfSound) {
            speedOfSound = scenario.globalSettings.speedOfSound;
        }

        // Find the first array's frequency to use as base
        if (scenario.arrays && scenario.arrays.length > 0) {
            baseFreq = scenario.arrays[0].frequency;
        }

        const baseWavelength = speedOfSound / baseFreq;
        const scaleFactor = 1.0 / baseWavelength; // Convert Meters -> Wavelengths

        this.physicsState = {
            baseFrequency: baseFreq,
            speedOfSound: speedOfSound,
            baseWavelength: baseWavelength,
            scaleFactor: scaleFactor
        };

        // 2. Configure Global Settings (Normalized)
        this.context.globalSettings = {
            ...this.context.globalSettings,
            speedOfSound: 1.0, // Normalized c=1
            timeScale: 1.0
        };

        if (scenario.globalSettings) {
            if (scenario.globalSettings.fieldWidth)
                this.context.globalSettings.fieldWidth = scenario.globalSettings.fieldWidth * scaleFactor;
            if (scenario.globalSettings.fieldHeight)
                this.context.globalSettings.fieldHeight = scenario.globalSettings.fieldHeight * scaleFactor;
            if (scenario.globalSettings.fieldCenterX !== undefined)
                this.context.globalSettings.fieldCenterX = scenario.globalSettings.fieldCenterX * scaleFactor;
            if (scenario.globalSettings.fieldCenterY !== undefined)
                this.context.globalSettings.fieldCenterY = scenario.globalSettings.fieldCenterY * scaleFactor;
        }

        // 3. Configure Arrays (Normalized)
        if (scenario.arrays) {
            scenario.arrays.forEach(conf => {
                // Clone config to avoid mutating the original scenario
                const normConf = { ...conf };

                // Normalize Spatial Properties
                if (normConf.pitch) normConf.pitch *= scaleFactor;
                if (normConf.position) {
                    normConf.position = {
                        x: normConf.position.x * scaleFactor,
                        y: normConf.position.y * scaleFactor
                    };
                }
                if (normConf.curvatureRadius) normConf.curvatureRadius *= scaleFactor;
                if (normConf.focalDistance && normConf.focalDistance !== Infinity) {
                    normConf.focalDistance *= scaleFactor;
                }

                // Normalize Frequency/Speed
                // If the array freq matches base, it becomes 1.0
                // If it's different (e.g. 2x base), it becomes 2.0
                normConf.frequency = conf.frequency / baseFreq;
                normConf.speedOfSound = 1.0;

                const arr = new PhasedArray(normConf);
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

        // Update Focus Controls 
        const sldFocus = document.getElementById('sld-focus');
        const chkFocusInf = document.getElementById('chk-focus-inf');
        const valFocus = document.getElementById('val-focus');

        if (sldFocus && chkFocusInf) {
            if (array.focalDistance === Infinity || array.focalDistance > 1000) {
                chkFocusInf.checked = true;
                sldFocus.disabled = true;
                sldFocus.style.opacity = '0.5';
                if (valFocus) valFocus.innerText = 'Infinity';
                sldFocus.value = 20;
            } else {
                chkFocusInf.checked = false;
                sldFocus.disabled = false;
                sldFocus.style.opacity = '1';
                sldFocus.value = array.focalDistance;
                if (valFocus) valFocus.innerText = array.focalDistance.toFixed(0) + 'λ';
            }
        }

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
        // We want it to match the current scenario's scale
        let freq = 1.0;
        let pitch = 0.5; // Default to half-wavelength

        // If we have a physics state, ensure we align with it
        if (this.physicsState) {
            // In normalized physics, base frequency is always 1.0
            freq = 1.0;
            // Pitch of 0.5 is 0.5 * lambda, which is standard
            pitch = 0.5;
        }

        // Offset the new array slightly so it doesn't overlap perfectly
        const count = this.context.getAllArrays().length;
        const offset = (count % 2 === 0) ? 5.0 : -5.0;

        const arr = new PhasedArray({
            name: `Array ${count + 1}`,
            numElements: 16,
            pitch: pitch,
            frequency: freq,
            speedOfSound: 1.0,
            curvatureRadius: 10.0, // Reasonable default in wavelengths
            position: { x: offset * Math.ceil(count / 2), y: 0 }
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

        // 0. ADAPTIVE TRACKING (MVDR Scenario)
        if (this.currentScenarioKey === 'MVDR') {
            const rx = this.receivers.get(this.selectedReceiverId);
            if (rx) {
                this.context.getAllArrays().forEach(arr => {
                    if (!arr.enabled) return;

                    // Calculate angle to receiver
                    // atan2(dx, dy) gives angle from +Y axis (0 deg)
                    // +X is +90 deg, -X is -90 deg
                    const dx = rx.x - arr.position.x;
                    const dy = rx.y - arr.position.y;

                    // Convert to degrees
                    let targetAngle = Math.atan2(dx, dy) * 180 / Math.PI;

                    // Clamp to -90 to 90
                    targetAngle = Math.max(-90, Math.min(90, targetAngle));

                    // Apply directly (bypass smoothing for responsiveness)
                    arr.steeringAngle = targetAngle;

                    if (arr.id === this.selectedArrayId) {
                        const sld = document.getElementById('sld-steer');
                        const val = document.getElementById('val-steer');
                        if (sld) sld.value = targetAngle;
                        if (val) val.innerText = targetAngle.toFixed(1) + '°';
                    }
                });
            }
        }

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