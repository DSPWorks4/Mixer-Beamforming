export const fragmentShaderSource = `
precision highp float;
varying vec2 v_texCoord;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_fieldSize;
uniform vec2 u_fieldCenter;

uniform vec4 u_elementPositions[64];
uniform int u_elementCount;
uniform float u_frequency;
uniform float u_wavelength; 

const float PI = 3.141592653589793;

void main() {
    // Map pixel to physics coordinates (Meters)
    vec2 uv = v_texCoord - 0.5;
    float aspect = u_resolution.x / u_resolution.y;
    uv.x *= aspect;
    vec2 pos = uv * u_fieldSize + u_fieldCenter;
    
    float fieldSum = 0.0;
    
    // Physics Loop
    for (int i = 0; i < 64; i++) {
        if (i >= u_elementCount) break;
        
        vec4 elem = u_elementPositions[i];
        // elem.xy is in meters
        float dist = distance(pos, elem.xy);
        
        // spread factor
        float spread = 1.0 / sqrt(dist + 0.1); 
        
        // k = 2PI / lambda
        // phase = k * dist
        float k = 2.0 * PI / u_wavelength;
        
        // elem.z is the phase offset (phi) from PhasedArray
        // u_time * 2.0 * PI * u_frequency is the temporal component (omega * t)
        float totalPhase = k * dist - u_time * 2.0 * PI * u_frequency - elem.z;
        fieldSum += sin(totalPhase) * spread * elem.w;
    }
    
    // Normalize
    float intensity = fieldSum / (sqrt(float(u_elementCount)) + 0.1);
    intensity = clamp(intensity, -1.0, 1.0);
    
    // High-Contrast Coloring (Black-Blue-Red)
    vec3 color = vec3(0.0);
    if (intensity > 0.0) {
        color = mix(vec3(0.0), vec3(1.0, 0.0, 0.0), intensity); // Red for +
        if(intensity > 0.8) color = mix(vec3(1,0,0), vec3(1,1,0), (intensity-0.8)*5.0);
    } else {
        color = mix(vec3(0.0), vec3(0.0, 0.0, 1.0), abs(intensity)); // Blue for -
        if(abs(intensity) > 0.8) color = mix(vec3(0,0,1), vec3(0,1,1), (abs(intensity)-0.8)*5.0);
    }

    gl_FragColor = vec4(color, 1.0);
}
`;
