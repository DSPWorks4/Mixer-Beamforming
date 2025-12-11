/**
 * Scenarios.js - Preset Configurations for Beamforming Simulator
 * 
 * All units are in wavelengths for easier visualization
 * - 5G MIMO: Linear array, far-field steering
 * - Ultrasound: Curved convex array, near-field focusing
 * - Tumor Ablation: Two arrays focused on a single point
 */

export const Scenarios = {
    /**
     * 5G MIMO Scenario
     * Linear phased array for beam steering demonstration
     */
    '5G_MIMO': {
        name: '5G MIMO',
        description: 'Linear phased array demonstrating far-field beam steering.',
        arrays: [
            {
                name: 'array 1',
                numElements: 11,
                pitch: 0.5,              // 0.5λ spacing
                frequency: 40000,
                steeringAngle: 0,
                position: { x: 0, y: 0 },
                geometry: 'linear',
                curvatureRadius: 5,
                orientation: 0,
                focalDistance: Infinity,
                amplitude: 1.0,
                enabled: true
            }
        ],
        globalSettings: {
            speedOfSound: 343,
            fieldWidth: 40,              // 40 wavelengths
            fieldHeight: 40,             // 40 wavelengths  
            fieldCenterX: 0,
            fieldCenterY: 20,            // Center at y=20λ
            displayMode: 0,              // Instantaneous
            dynamicRange: 40,
            profileDepth: 20
        }
    },

    /**
     * Ultrasound Imaging Scenario
     * Curved convex array for medical ultrasound
     */
    'Ultrasound': {
        name: 'Ultrasound Imaging',
        description: 'Curved convex array demonstrating near-field focusing.',
        arrays: [
            {
                name: 'Convex Probe',
                numElements: 32,
                pitch: 0.5,
                frequency: 40000,
                steeringAngle: 0,
                position: { x: 0, y: 0 },
                geometry: 'curved',
                curvatureRadius: 8,
                orientation: 0,
                focalDistance: 15,
                amplitude: 1.0,
                enabled: true
            }
        ],
        globalSettings: {
            speedOfSound: 343,
            fieldWidth: 30,
            fieldHeight: 35,
            fieldCenterX: 0,
            fieldCenterY: 15,
            displayMode: 0,
            dynamicRange: 50,
            profileDepth: 15
        }
    },

    /**
     * Tumor Ablation Scenario
     * Two arrays focusing on a single point
     */
    'Tumor_Ablation': {
        name: 'Tumor Ablation (HIFU)',
        description: 'Two arrays creating constructive interference at target.',
        arrays: [
            {
                name: 'Left Array',
                numElements: 16,
                pitch: 0.5,
                frequency: 40000,
                steeringAngle: 30,
                position: { x: -8, y: 0 },
                geometry: 'curved',
                curvatureRadius: 10,
                orientation: -25,
                focalDistance: 15,
                amplitude: 1.0,
                enabled: true
            },
            {
                name: 'Right Array',
                numElements: 16,
                pitch: 0.5,
                frequency: 40000,
                steeringAngle: -30,
                position: { x: 8, y: 0 },
                geometry: 'curved',
                curvatureRadius: 10,
                orientation: 25,
                focalDistance: 15,
                amplitude: 1.0,
                enabled: true
            }
        ],
        globalSettings: {
            speedOfSound: 343,
            fieldWidth: 35,
            fieldHeight: 35,
            fieldCenterX: 0,
            fieldCenterY: 12,
            displayMode: 0,
            dynamicRange: 45,
            profileDepth: 12
        }
    },

    /**
     * Multi-Beam Scenario
     * Multiple simultaneous beams
     */
    'Multi_Beam': {
        name: 'Multi-Beam Array',
        description: 'Multiple steered beams from separate arrays.',
        arrays: [
            {
                name: 'Beam Left',
                numElements: 8,
                pitch: 0.5,
                frequency: 40000,
                steeringAngle: -30,
                position: { x: -6, y: 0 },
                geometry: 'linear',
                curvatureRadius: 5,
                orientation: 0,
                focalDistance: Infinity,
                amplitude: 1.0,
                enabled: true
            },
            {
                name: 'Beam Center',
                numElements: 8,
                pitch: 0.5,
                frequency: 40000,
                steeringAngle: 0,
                position: { x: 0, y: 0 },
                geometry: 'linear',
                curvatureRadius: 5,
                orientation: 0,
                focalDistance: Infinity,
                amplitude: 1.0,
                enabled: true
            },
            {
                name: 'Beam Right',
                numElements: 8,
                pitch: 0.5,
                frequency: 40000,
                steeringAngle: 30,
                position: { x: 6, y: 0 },
                geometry: 'linear',
                curvatureRadius: 5,
                orientation: 0,
                focalDistance: Infinity,
                amplitude: 1.0,
                enabled: true
            }
        ],
        globalSettings: {
            speedOfSound: 343,
            fieldWidth: 40,
            fieldHeight: 40,
            fieldCenterX: 0,
            fieldCenterY: 18,
            displayMode: 0,
            dynamicRange: 40,
            profileDepth: 20
        }
    },

    /**
     * Custom Scenario
     * Starting point for user customization
     */
    'Custom': {
        name: 'Custom Setup',
        description: 'Empty canvas for custom configurations.',
        arrays: [
            {
                name: 'array 1',
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
                enabled: true
            }
        ],
        globalSettings: {
            speedOfSound: 343,
            fieldWidth: 40,
            fieldHeight: 40,
            fieldCenterX: 0,
            fieldCenterY: 20,
            displayMode: 0,
            dynamicRange: 40,
            profileDepth: 20
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
