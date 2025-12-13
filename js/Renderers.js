/**
 * Renderers.js - Visualization Renderers 
 * * Contains:
 * - HeatmapRenderer: WebGL-based field intensity visualization
 * - BeamPatternRenderer: Polar plot beam pattern
 * - ArrayVisualizationRenderer: Array elements and receiver visualization
 */

import { vertexShaderSource } from './shaders/vertexShader.js';
import { fragmentShaderSource } from './shaders/fragmentShader.js';

/**
 * HeatmapRenderer - WebGL-accelerated wave field visualization
 * Handles all WebGL setup, shader compilation, and rendering
 */
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
        const vsSrc = vertexShaderSource;
        const fsSrc = fragmentShaderSource;

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

        // Determine average frequency from active arrays
        const activeArrays = context.getAllArrays().filter(arr => arr.enabled);
        if (activeArrays.length > 0) {
            avgFreq = activeArrays[0].frequency;
        }

        context.getAllArrays().forEach(arr => {
            if (arr.enabled) {
                const elements = arr.getElementData();
                elements.forEach(el => {
                    allElements.push(el.x, el.y, el.phase, el.amplitude);
                });
            }
        });
        totalCount = allElements.length / 4;

        // --- DYNAMIC WAVELENGTH CALCULATION ---
        // Use the global speed of sound 
        const speedOfSound = context.globalSettings.speedOfSound;
        const safeFreq = Math.max(0.1, avgFreq);
        const wavelength = speedOfSound / safeFreq;

        const u = (name) => gl.getUniformLocation(this.program, name);

        //passing argument for drawing
        gl.uniform1f(u("u_time"), time);
        gl.uniform2f(u("u_resolution"), cvs.width, cvs.height);
        gl.uniform2f(u("u_fieldSize"), context.globalSettings.fieldWidth, context.globalSettings.fieldHeight);
        gl.uniform2f(u("u_fieldCenter"), context.globalSettings.fieldCenterX, context.globalSettings.fieldCenterY);
        gl.uniform1i(u("u_elementCount"), totalCount);

        gl.uniform1f(u("u_frequency"), safeFreq);
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

        // Calculate radius to fit EITHER width or height, with padding
        const padding = 25;
        const availH = h - padding;
        const availW = w / 2 - padding;
        const radius = Math.min(availW, availH);

        const cx = w / 2;
        const cy = h - 15;

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

        // Draw Angles
        for (let steerAngle = -90; steerAngle <= 90; steerAngle += 30) {
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


        const arrays = context.getAllArrays().filter(a => a.enabled);
        if (arrays.length === 0) return;

        // Calculate max possible amplitude for normalization
        let totalMaxAmp = 0;
        arrays.forEach(arr => {
            totalMaxAmp += arr.numElements * arr.amplitude;
        });
        if (totalMaxAmp === 0) totalMaxAmp = 1;
        const maxIntensity = totalMaxAmp * totalMaxAmp;

        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let steerAngle = -90; steerAngle <= 90; steerAngle++) {
            let realSum = 0;
            let imagSum = 0;

            arrays.forEach(arr => {
                const response = arr.calculateComplexResponse(steerAngle);
                realSum += response.real;
                imagSum += response.imag;
            });

            const intensity = (realSum * realSum + imagSum * imagSum) / maxIntensity;

            const db = 10 * Math.log10(intensity + 0.00001);
            const minDb = -40;
            let norm = (db - minDb) / (0 - minDb);
            if (norm < 0) norm = 0;

            const r = norm * radius;

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

        const paddingFactor = 1.2;
        const scaleX = w / (context.globalSettings.fieldWidth * paddingFactor);
        const scaleY = h / (context.globalSettings.fieldHeight * paddingFactor);
        const aspect = w / h;

        const toScreen = (x, y) => {
            const normX = (x - context.globalSettings.fieldCenterX) / context.globalSettings.fieldWidth;
            const normY = (y - context.globalSettings.fieldCenterY) / context.globalSettings.fieldHeight;
            const screenX = (normX / paddingFactor / aspect + 0.5) * w;
            const screenY = (0.5 - normY / paddingFactor) * h;
            return { x: screenX, y: screenY };
        };

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