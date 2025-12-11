/**
 * Renderers.js - Visualization Renderers for Beamforming Simulator
 * 
 * Contains:
 * - HeatmapRenderer: WebGL-based field intensity visualization
 * - BeamPatternRenderer: Polar plot beam pattern
 * - ArrayVisualizationRenderer: Array elements and receiver visualization
 */

/**
 * HeatmapRenderer - WebGL-accelerated wave field visualization
 * Handles all WebGL setup, shader compilation, and rendering
 */
export class HeatmapRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = null;
        this.program = null;
        this.uniforms = {};
        this.buffers = {};
        this.isInitialized = false;

        this._init();
    }

    _init() {
        this.gl = this.canvas.getContext('webgl', {
            antialias: false,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance'
        });

        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }

        const gl = this.gl;

        const vertexShaderSource = document.getElementById('vertex-shader').textContent;
        const fragmentShaderSource = document.getElementById('fragment-shader').textContent;

        const vertexShader = this._compileShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this._compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

        if (!vertexShader || !fragmentShader) {
            console.error('Shader compilation failed');
            return;
        }

        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(this.program));
            return;
        }

        this._setupUniforms();
        this._setupBuffers();
        this.isInitialized = true;
    }

    _compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    _setupUniforms() {
        const gl = this.gl;
        const program = this.program;

        this.uniforms = {
            time: gl.getUniformLocation(program, 'u_time'),
            resolution: gl.getUniformLocation(program, 'u_resolution'),
            fieldSize: gl.getUniformLocation(program, 'u_fieldSize'),
            fieldCenter: gl.getUniformLocation(program, 'u_fieldCenter'),
            elementCount: gl.getUniformLocation(program, 'u_elementCount'),
            frequency: gl.getUniformLocation(program, 'u_frequency'),
            wavelength: gl.getUniformLocation(program, 'u_wavelength'),
            speedOfSound: gl.getUniformLocation(program, 'u_speedOfSound'),
            displayMode: gl.getUniformLocation(program, 'u_displayMode'),
            dynamicRange: gl.getUniformLocation(program, 'u_dynamicRange'),
            elementPositions: []
        };

        for (let i = 0; i < 64; i++) {
            this.uniforms.elementPositions.push(
                gl.getUniformLocation(program, `u_elementPositions[${i}]`)
            );
        }
    }

    _setupBuffers() {
        const gl = this.gl;

        const vertices = new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            1, 1
        ]);

        this.buffers.vertices = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.vertices);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const positionLocation = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    }

    resize() {
        const canvas = this.canvas;
        const dpr = window.devicePixelRatio || 1;
        const displayWidth = Math.floor(canvas.clientWidth * dpr);
        const displayHeight = Math.floor(canvas.clientHeight * dpr);

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;

            if (this.gl) {
                this.gl.viewport(0, 0, displayWidth, displayHeight);
            }
        }
    }

    render(context, time) {
        if (!this.isInitialized) return;

        const gl = this.gl;
        const settings = context.globalSettings;

        gl.useProgram(this.program);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.vertices);
        const positionLocation = gl.getAttribLocation(this.program, 'a_position');
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        gl.uniform1f(this.uniforms.time, time);
        gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        gl.uniform2f(this.uniforms.fieldSize, settings.fieldWidth, settings.fieldHeight);
        gl.uniform2f(this.uniforms.fieldCenter, settings.fieldCenterX, settings.fieldCenterY);
        gl.uniform1f(this.uniforms.displayMode, settings.displayMode);
        gl.uniform1f(this.uniforms.dynamicRange, settings.dynamicRange);
        gl.uniform1f(this.uniforms.speedOfSound, settings.speedOfSound);

        const elements = context.getAllElementData();
        const elementCount = Math.min(elements.length, 64);

        gl.uniform1i(this.uniforms.elementCount, elementCount);

        let avgFrequency = 40000;
        const arrays = context.getAllArrays();
        if (arrays.length > 0) {
            avgFrequency = arrays.reduce((sum, arr) => sum + arr.frequency, 0) / arrays.length;
        }
        const wavelength = settings.speedOfSound / avgFrequency;

        gl.uniform1f(this.uniforms.frequency, avgFrequency);
        gl.uniform1f(this.uniforms.wavelength, wavelength);

        for (let i = 0; i < 64; i++) {
            if (i < elementCount) {
                const elem = elements[i];
                gl.uniform4f(
                    this.uniforms.elementPositions[i],
                    elem.x,
                    elem.y,
                    elem.phase,
                    elem.amplitude
                );
            } else {
                gl.uniform4f(this.uniforms.elementPositions[i], 0, 0, 0, 0);
            }
        }

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    dispose() {
        if (this.gl && this.program) {
            this.gl.deleteProgram(this.program);
        }
    }
}


/**
 * BeamPatternRenderer - Polar plot beam pattern visualization
 */
export class BeamPatternRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas?.getContext('2d');
        this.numAngles = 360;
    }

    resize() {
        if (!this.canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const displayWidth = Math.floor(this.canvas.clientWidth * dpr);
        const displayHeight = Math.floor(this.canvas.clientHeight * dpr);

        if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
            this.canvas.width = displayWidth;
            this.canvas.height = displayHeight;
        }
    }

    render(context, selectedArrayId) {
        if (!this.ctx) return;

        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Clear
        ctx.fillStyle = '#12122a';
        ctx.fillRect(0, 0, width, height);

        const centerX = width / 2;
        const centerY = height * 0.95;
        const maxRadius = Math.min(width, height) * 0.85;

        // Draw polar grid
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)';
        ctx.lineWidth = 1;

        // Concentric circles (dB levels)
        const dbLevels = [0, -5, -10, -15, -20, -25, -30];
        dbLevels.forEach(db => {
            const radius = maxRadius * (1 + db / 30);
            if (radius > 0) {
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, Math.PI, 2 * Math.PI);
                ctx.stroke();
            }
        });

        // Radial lines (angles)
        const angleLines = [-90, -60, -30, 0, 30, 60, 90];
        ctx.fillStyle = '#888';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';

        angleLines.forEach(angle => {
            const rad = (angle - 90) * Math.PI / 180;
            const x1 = centerX;
            const y1 = centerY;
            const x2 = centerX + maxRadius * Math.cos(rad);
            const y2 = centerY + maxRadius * Math.sin(rad);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            // Angle labels
            const labelRadius = maxRadius + 15;
            const lx = centerX + labelRadius * Math.cos(rad);
            const ly = centerY + labelRadius * Math.sin(rad);
            ctx.fillText(angle + '°', lx, ly + 4);
        });

        // Calculate beam pattern
        const arrays = context.getAllArrays();
        if (arrays.length === 0) return;

        // Use all arrays combined or selected array
        const beamData = [];

        for (let i = 0; i <= 180; i++) {
            const angle = i - 90; // -90 to 90
            let totalIntensity = 0;

            for (const array of arrays) {
                if (!array.enabled) continue;
                totalIntensity += array.calculateBeamPattern(angle);
            }

            beamData.push({
                angle: angle,
                intensity: totalIntensity
            });
        }

        // Normalize
        const maxIntensity = Math.max(...beamData.map(d => d.intensity));

        // Draw beam pattern
        ctx.beginPath();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;

        beamData.forEach((d, i) => {
            const normalizedDb = maxIntensity > 0
                ? 10 * Math.log10(d.intensity / maxIntensity + 1e-10)
                : -30;

            const radius = maxRadius * Math.max(0, (1 + normalizedDb / 30));
            const rad = (d.angle - 90) * Math.PI / 180;
            const x = centerX + radius * Math.cos(rad);
            const y = centerY + radius * Math.sin(rad);

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        // Fill with gradient
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#f97316';
        ctx.lineTo(centerX, centerY);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}


/**
 * ArrayVisualizationRenderer - Shows array elements and receivers in 2D space
 */
export class ArrayVisualizationRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas?.getContext('2d');
    }

    resize() {
        if (!this.canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const displayWidth = Math.floor(this.canvas.clientWidth * dpr);
        const displayHeight = Math.floor(this.canvas.clientHeight * dpr);

        if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
            this.canvas.width = displayWidth;
            this.canvas.height = displayHeight;
        }
    }

    render(context, receivers, selectedReceiverId) {
        if (!this.ctx) return;

        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Clear
        ctx.fillStyle = '#12122a';
        ctx.fillRect(0, 0, width, height);

        const margin = 40;
        const plotWidth = width - margin * 2;
        const plotHeight = height - margin * 2;

        // Calculate bounds
        let minX = -3, maxX = 3, minY = -0.5, maxY = 5;

        // Adjust bounds based on elements and receivers
        const arrays = context.getAllArrays();
        for (const array of arrays) {
            const elements = array.getElementData();
            for (const elem of elements) {
                minX = Math.min(minX, elem.x - 0.5);
                maxX = Math.max(maxX, elem.x + 0.5);
                minY = Math.min(minY, elem.y - 0.5);
                maxY = Math.max(maxY, elem.y + 0.5);
            }
        }

        for (const [id, receiver] of receivers) {
            minX = Math.min(minX, receiver.x - 0.5);
            maxX = Math.max(maxX, receiver.x + 0.5);
            minY = Math.min(minY, receiver.y - 0.5);
            maxY = Math.max(maxY, receiver.y + 0.5);
        }

        // Transform functions
        const toCanvasX = (x) => margin + ((x - minX) / (maxX - minX)) * plotWidth;
        const toCanvasY = (y) => height - margin - ((y - minY) / (maxY - minY)) * plotHeight;

        // Draw grid
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
        ctx.lineWidth = 1;

        const gridStepX = 1;
        const gridStepY = 1;

        for (let x = Math.ceil(minX); x <= maxX; x += gridStepX) {
            const px = toCanvasX(x);
            ctx.beginPath();
            ctx.moveTo(px, margin);
            ctx.lineTo(px, height - margin);
            ctx.stroke();
        }

        for (let y = Math.ceil(minY); y <= maxY; y += gridStepY) {
            const py = toCanvasY(y);
            ctx.beginPath();
            ctx.moveTo(margin, py);
            ctx.lineTo(width - margin, py);
            ctx.stroke();
        }

        // Draw axes
        ctx.strokeStyle = '#4a4a8a';
        ctx.lineWidth = 1;

        // X axis
        const y0 = toCanvasY(0);
        if (y0 >= margin && y0 <= height - margin) {
            ctx.beginPath();
            ctx.moveTo(margin, y0);
            ctx.lineTo(width - margin, y0);
            ctx.stroke();
        }

        // Y axis
        const x0 = toCanvasX(0);
        if (x0 >= margin && x0 <= width - margin) {
            ctx.beginPath();
            ctx.moveTo(x0, margin);
            ctx.lineTo(x0, height - margin);
            ctx.stroke();
        }

        // Axis labels
        ctx.fillStyle = '#888';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';

        for (let x = Math.ceil(minX); x <= maxX; x += gridStepX) {
            const px = toCanvasX(x);
            ctx.fillText(x.toString(), px, height - margin + 15);
        }

        ctx.textAlign = 'right';
        for (let y = Math.ceil(minY); y <= maxY; y += gridStepY) {
            const py = toCanvasY(y);
            ctx.fillText(y.toString(), margin - 8, py + 4);
        }

        // Draw array elements
        const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899'];

        arrays.forEach((array, arrayIdx) => {
            if (!array.enabled) return;

            const elements = array.getElementData();
            const color = colors[arrayIdx % colors.length];

            elements.forEach(elem => {
                const x = toCanvasX(elem.x);
                const y = toCanvasY(elem.y);

                // Draw element
                ctx.beginPath();
                ctx.arc(x, y, 6, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Draw phase indicator (small line showing direction)
                const phaseAngle = elem.phase;
                const lineLen = 10;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(
                    x + Math.sin(phaseAngle) * lineLen,
                    y - Math.cos(phaseAngle) * lineLen
                );
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            });
        });

        // Draw receivers
        for (const [id, receiver] of receivers) {
            const x = toCanvasX(receiver.x);
            const y = toCanvasY(receiver.y);

            // X marker
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
            const size = 10;
            ctx.beginPath();
            ctx.moveTo(x - size, y - size);
            ctx.lineTo(x + size, y + size);
            ctx.moveTo(x + size, y - size);
            ctx.lineTo(x - size, y + size);
            ctx.stroke();

            // Highlight if selected
            if (id === selectedReceiverId) {
                ctx.beginPath();
                ctx.arc(x, y, 15, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Label
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(receiver.name, x + 15, y + 4);
        }
    }
}
