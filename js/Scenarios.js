/**
 * Scenarios.js - Preset Configurations 
 * 
 * All values use real-world physical units:
 * - frequency: Hz
 * - speedOfSound: m/s
 * - pitch: meters (element spacing)
 * - position: meters
 * - curvatureRadius: meters
 * - focalDistance: meters
 * - fieldWidth/Height: meters
 */

export const Scenarios = {
    /**
     * 5G MIMO Base Station
     * 
     * 28 GHz mmWave 5G
     * - λ = c/f = 3e8 / 28e9 ≈ 10.7mm
     * - Typical array: 16 elements, 0.5λ spacing ≈ 5.35mm
     * - Far-field beam steering for mobile users
     */
    '5G_MIMO': {
        name: '5G MIMO Station',
        description: '28 GHz mmWave linear array for mobile beam steering.',
        arrays: [
            {
                name: '5G Linear Array',
                numElements: 16,
                pitch: 0.00535,          // 5.35mm = 0.5λ at 28 GHz
                frequency: 28e9,
                steeringAngle: 0,
                position: { x: 0, y: 0 },
                geometry: 'linear',
                curvatureRadius: 0.05,
                orientation: 0,
                focalDistance: Infinity, // Far-field
                amplitude: 1.0,
                enabled: true
            }
        ],
        globalSettings: {
            speedOfSound: 3e8,           // Speed of light (EM waves)
            fieldWidth: 0.5,             // 500mm viewing area
            fieldHeight: 0.5,
            fieldCenterX: 0,
            fieldCenterY: 0.25,          // Center 250mm ahead
            displayMode: 0,
            dynamicRange: 40,
            profileDepth: 0.25
        }
    },

    /**
     * Medical Ultrasound Imaging
     * 
     * 3.5 MHz abdominal convex probe
     * - λ = 1540 / 3.5e6 ≈ 0.44mm in tissue
     * - Convex probe radius: ~40mm
     * - Imaging depth: 15-20cm
     * - Element pitch: ~0.3mm
     */
    'Ultrasound': {
        name: 'Medical Ultrasound',
        description: '3.5 MHz convex probe for abdominal imaging.',
        arrays: [
            {
                name: 'Convex Probe',
                numElements: 48,
                pitch: 0.0003,           // 0.3mm pitch
                frequency: 3.5e6,        // 3.5 MHz
                steeringAngle: 0,
                position: { x: 0, y: 0 },
                geometry: 'curved',
                curvatureRadius: 0.04,   // 40mm radius
                orientation: 0,
                focalDistance: 0.08,     // Focus at 80mm depth
                amplitude: 1.0,
                enabled: true
            }
        ],
        globalSettings: {
            speedOfSound: 1540,          // Speed in soft tissue (m/s)
            fieldWidth: 0.15,            // 150mm width
            fieldHeight: 0.18,           // 180mm depth
            fieldCenterX: 0,
            fieldCenterY: 0.08,          // Center at 80mm
            displayMode: 0,
            dynamicRange: 50,
            profileDepth: 0.08
        }
    },

    /**
     * HIFU Tumor Ablation
     * 
     * 1 MHz High-Intensity Focused Ultrasound
     * - λ = 1540 / 1e6 ≈ 1.54mm in tissue
     * - Dual transducers for focused energy delivery
     * - Focal depth: ~100mm
     */
    'Tumor_Ablation': {
        name: 'HIFU Tumor Ablation',
        description: 'Dual 1 MHz focused transducers for thermal therapy.',
        arrays: [
            {
                name: 'Left Transducer',
                numElements: 24,
                pitch: 0.00077,          // 0.77mm ≈ 0.5λ at 1 MHz
                frequency: 1e6,          // 1 MHz
                steeringAngle: 25,
                position: { x: -0.05, y: 0 },  // 50mm left
                geometry: 'curved',
                curvatureRadius: 0.06,   // 60mm radius
                orientation: 25,
                focalDistance: 0.08,     // 80mm focal depth
                amplitude: 1.0,
                enabled: true
            },
            {
                name: 'Right Transducer',
                numElements: 24,
                pitch: 0.00077,
                frequency: 1e6,
                steeringAngle: -25,
                position: { x: 0.05, y: 0 },   // 50mm right
                geometry: 'curved',
                curvatureRadius: 0.06,
                orientation: -25,
                focalDistance: 0.08,
                amplitude: 1.0,
                enabled: true
            }
        ],
        globalSettings: {
            speedOfSound: 1540,
            fieldWidth: 0.2,             // 200mm
            fieldHeight: 0.2,
            fieldCenterX: 0,
            fieldCenterY: 0.07,          // Target region
            displayMode: 0,
            dynamicRange: 45,
            profileDepth: 0.07
        }
    },

    /**
     * Underwater SONAR
     * 
     * 50 kHz side-scan sonar
     * - λ = 1500 / 50e3 = 30mm in water
     * - Multiple beams for wide coverage
     */
    'Multi_Beam': {
        name: 'Multi-Beam SONAR',
        description: '50 kHz multi-beam sonar for underwater scanning.',
        arrays: [
            {
                name: 'Port Beam',
                numElements: 12,
                pitch: 0.015,            // 15mm ≈ 0.5λ at 50 kHz
                frequency: 50e3,         // 50 kHz
                steeringAngle: -30,
                position: { x: -0.2, y: 0 },
                geometry: 'linear',
                curvatureRadius: 0.1,
                orientation: 0,
                focalDistance: Infinity,
                amplitude: 1.0,
                enabled: true
            },
            {
                name: 'Center Beam',
                numElements: 12,
                pitch: 0.015,
                frequency: 50e3,
                steeringAngle: 0,
                position: { x: 0, y: 0 },
                geometry: 'linear',
                curvatureRadius: 0.1,
                orientation: 0,
                focalDistance: Infinity,
                amplitude: 1.0,
                enabled: true
            },
            {
                name: 'Starboard Beam',
                numElements: 12,
                pitch: 0.015,
                frequency: 50e3,
                steeringAngle: 30,
                position: { x: 0.2, y: 0 },
                geometry: 'linear',
                curvatureRadius: 0.1,
                orientation: 0,
                focalDistance: Infinity,
                amplitude: 1.0,
                enabled: true
            }
        ],
        globalSettings: {
            speedOfSound: 1500,          // Speed in water (m/s)
            fieldWidth: 1.5,             // 1.5m viewing area
            fieldHeight: 1.5,
            fieldCenterX: 0,
            fieldCenterY: 0.6,
            displayMode: 0,
            dynamicRange: 40,
            profileDepth: 0.6
        }
    },

    /**
     * Custom Setup
     * 
     * Default: 40 kHz ultrasonic in air
     * - λ = 343 / 40000 ≈ 8.6mm
     * - Good for demonstration and experimentation
     */
    'Custom': {
        name: 'Custom Setup',
        description: '40 kHz ultrasonic array in air for experimentation.',
        arrays: [
            {
                name: 'Custom Array',
                numElements: 16,
                pitch: 0.0043,           // 4.3mm ≈ 0.5λ at 40 kHz
                frequency: 40e3,         // 40 kHz
                steeringAngle: 0,
                position: { x: 0, y: 0 },
                geometry: 'linear',
                curvatureRadius: 0.05,
                orientation: 0,
                focalDistance: Infinity,
                amplitude: 1.0,
                enabled: true
            }
        ],
        globalSettings: {
            speedOfSound: 343,           // Speed in air (m/s)
            fieldWidth: 0.4,             // 400mm
            fieldHeight: 0.4,
            fieldCenterX: 0,
            fieldCenterY: 0.2,
            displayMode: 0,
            dynamicRange: 40,
            profileDepth: 0.2
        }
    },

    /**
     * MVDR / Adaptive Tracking
     * 
     * Demonstrates adaptive beamforming where arrays automatically
     * steer towards the signal source (Receiver/Probe).
     */
    'MVDR': {
        name: 'MVDR (Adaptive Tracking)',
        description: 'Arrays automatically steer to maximize signal at the probe position.',
        arrays: [
            {
                name: 'Tracking Array 1',
                numElements: 16,
                pitch: 0.0043,
                frequency: 40e3,
                steeringAngle: 0,
                position: { x: -0.1, y: 0 },
                geometry: 'linear',
                curvatureRadius: 0.05,
                orientation: 0,
                focalDistance: Infinity,
                amplitude: 1.0,
                enabled: true
            },
            {
                name: 'Tracking Array 2',
                numElements: 16,
                pitch: 0.0043,
                frequency: 40e3,
                steeringAngle: 0,
                position: { x: 0.1, y: 0 },
                geometry: 'linear',
                curvatureRadius: 0.05,
                orientation: 0,
                focalDistance: Infinity,
                amplitude: 1.0,
                enabled: true
            }
        ],
        globalSettings: {
            speedOfSound: 343,
            fieldWidth: 0.4,
            fieldHeight: 0.4,
            fieldCenterX: 0,
            fieldCenterY: 0.2,
            displayMode: 0,
            dynamicRange: 40,
            profileDepth: 0.2
        }
    }
};


/**
 * Get list of available scenario names
 */
export function getScenarioNames() {
    return Object.keys(Scenarios);
}


/**
 * Get scenario by key
 */
export function getScenario(key) {
    return Scenarios[key] || null;
}


/**
 * Get scenario display info
 */
export function getScenarioList() {
    return Object.entries(Scenarios).map(([key, scenario]) => ({
        key,
        name: scenario.name,
        description: scenario.description
    }));
}
