export class HeatmapRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl');
        this._initShaders();
        this._initBuffers();
    }

    _initShaders() {
        const gl = this.gl;
        if (!gl) return;
        const vsSrc = document.getElementById('vertex-shader').text;
        const fsSrc = document.getElementById('fragment-shader').text;

        const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
        const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, fsSrc); gl.compileShader(fs);

        this.program = gl.createProgram();
        gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program);
    }

    _initBuffers() {
        const gl = this.gl;
        if (!gl) return;
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(this.program, "a_position");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }

    render(context, time) {
        const gl = this.gl;
        if (!gl || !this.program) return;
        const cvs = this.canvas;

        // Ensure accurate resize
        if (cvs.width !== cvs.clientWidth || cvs.height !== cvs.clientHeight) {
            cvs.width = cvs.clientWidth;
            cvs.height = cvs.clientHeight;
            gl.viewport(0, 0, cvs.width, cvs.height);
        }

        gl.useProgram(this.program);

        const allElements = [];
        let totalCount = 0;
        let avgFreq = 1.0;

        context.getAllArrays().forEach(arr => {
            if (arr.enabled) {
                const elements = arr.getElementData();
                elements.forEach(el => {
                    allElements.push(el.x, el.y, el.phase, el.amplitude);
                });
                avgFreq = arr.frequency;
            }
        });
        totalCount = allElements.length / 4;

        // --- SYNC FIX ---
        // Force visual wavelength to 1.0 unit. 
        // This assumes the physics engine is normalized such that positions/pitch are in wavelengths.
        // If pitch is 0.5 (meaning 0.5λ), then wavelength must be 1.0 for the math to hold visually.
        const wavelength = 1.0;

        const u = (name) => gl.getUniformLocation(this.program, name);
        gl.uniform1f(u("u_time"), time);
        gl.uniform2f(u("u_resolution"), cvs.width, cvs.height);
        gl.uniform2f(u("u_fieldSize"), context.globalSettings.fieldWidth, context.globalSettings.fieldHeight);
        gl.uniform2f(u("u_fieldCenter"), context.globalSettings.fieldCenterX, context.globalSettings.fieldCenterY);
        gl.uniform1i(u("u_elementCount"), totalCount);

        // Use normalized frequency for animation speed, but spatial k uses wavelength=1.0
        gl.uniform1f(u("u_frequency"), 1.0);
        gl.uniform1f(u("u_wavelength"), wavelength);

        if (totalCount > 0) {
            if (allElements.length > 256) allElements.length = 256;
            const data = new Float32Array(256);
            data.set(allElements);
            gl.uniform4fv(u("u_elementPositions[0]"), data);
        }

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    resize() { }
}


export class BeamPatternRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    }

    resize() {
        if (this.canvas.width !== this.canvas.parentElement.clientWidth) {
            this.canvas.width = this.canvas.parentElement.clientWidth;
            this.canvas.height = this.canvas.parentElement.clientHeight;
        }
    }

    render(context, selectedArrayId) {
        this.resize();

        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // --- TRUNCATION FIX ---
        // Calculate radius to fit EITHER width or height, with padding
        const padding = 25; // Space for labels
        const availH = h - padding;
        const availW = w / 2 - padding; // Since it's a semi-circle, we need w/2
        const radius = Math.min(availW, availH);

        const cx = w / 2;
        const cy = h - 15; // Bottom anchor

        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1;

        for (let r = 0.2; r <= 1.0; r += 0.2) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius * r, Math.PI, 0);
            ctx.stroke();
        }

        ctx.fillStyle = "#666";
        ctx.textAlign = "center";
        ctx.font = "10px monospace";

        // Draw Angles: -90° on left, 0° at center (top), +90° on right
        // Canvas angle 180° (left) = -90° steering
        // Canvas angle 90° (up/center) = 0° steering  
        // Canvas angle 0° (right) = +90° steering
        for (let steerAngle = -90; steerAngle <= 90; steerAngle += 30) {
            // Convert steering angle to canvas angle
            // steerAngle -90 -> canvas 180° (left)
            // steerAngle 0 -> canvas 90° (up)
            // steerAngle +90 -> canvas 0° (right)
            const canvasAngle = (90 - steerAngle) * (Math.PI / 180);

            const x = cx + radius * Math.cos(canvasAngle);
            const y = cy - radius * Math.sin(canvasAngle);

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(x, y);
            ctx.stroke();

            const lx = cx + (radius + 15) * Math.cos(canvasAngle);
            const ly = cy - (radius + 15) * Math.sin(canvasAngle);
            ctx.fillText(steerAngle + "°", lx, ly);
        }

        const array = context.getArray(selectedArrayId);
        if (!array) return;

        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2;
        ctx.beginPath();

        // Plot beam pattern from -90° to +90° steering angle
        for (let steerAngle = -90; steerAngle <= 90; steerAngle++) {
            // Calculate beam intensity at this steering angle
            const intensity = array.calculateBeamPattern(steerAngle);

            const db = 10 * Math.log10(intensity + 0.00001);
            const minDb = -40;
            let norm = (db - minDb) / (0 - minDb);
            if (norm < 0) norm = 0;

            const r = norm * radius;

            // Convert steering angle to canvas coordinates
            const canvasAngle = (90 - steerAngle) * (Math.PI / 180);
            const px = cx + r * Math.cos(canvasAngle);
            const py = cy - r * Math.sin(canvasAngle);

            if (steerAngle === -90) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();

        ctx.fillStyle = "rgba(250, 204, 21, 0.2)";
        ctx.lineTo(cx, cy);
        ctx.closePath();
        ctx.fill();
    }
}

export class ArrayVisualizationRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    }

    resize() {
        if (this.canvas.width !== this.canvas.parentElement.clientWidth) {
            this.canvas.width = this.canvas.parentElement.clientWidth;
            this.canvas.height = this.canvas.parentElement.clientHeight;
        }
    }

    render(context, receivers, selectedRxId) {
        this.resize();

        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        ctx.fillStyle = "#0a0a12";
        ctx.fillRect(0, 0, w, h);

        const showElements = document.getElementById('chk-elements');
        if (showElements && !showElements.checked) return;

        // --- PADDING FIX ---
        // Add 20% padding to field size so elements at the edge aren't cut off
        const paddingFactor = 1.2;
        const scaleX = w / (context.globalSettings.fieldWidth * paddingFactor);
        const scaleY = h / (context.globalSettings.fieldHeight * paddingFactor);
        const aspect = w / h;

        const toScreen = (x, y) => {
            const normX = (x - context.globalSettings.fieldCenterX) / context.globalSettings.fieldWidth;
            const normY = (y - context.globalSettings.fieldCenterY) / context.globalSettings.fieldHeight;
            // Apply padding factor to normalization
            const screenX = (normX / paddingFactor / aspect + 0.5) * w;
            const screenY = (0.5 - normY / paddingFactor) * h;
            return { x: screenX, y: screenY };
        };

        // Draw Elements
        context.getAllArrays().forEach(arr => {
            ctx.fillStyle = "#6366f1";
            const elements = arr.getElementData();
            elements.forEach(el => {
                const p = toScreen(el.x, el.y);
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                ctx.fill();
            });
        });

        // Draw Receivers
        receivers.forEach(rx => {
            const p = toScreen(rx.x, rx.y);
            const isSel = rx.id === selectedRxId;
            ctx.strokeStyle = isSel ? "#fff" : "#ef4444";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p.x - 4, p.y - 4); ctx.lineTo(p.x + 4, p.y + 4);
            ctx.moveTo(p.x + 4, p.y - 4); ctx.lineTo(p.x - 4, p.y + 4);
            ctx.stroke();
            ctx.fillStyle = "#ef4444";
            ctx.font = "10px sans-serif";
            ctx.fillText(rx.name, p.x + 6, p.y);
        });
    }
}