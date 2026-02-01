/**
 * 3D Rotation Manager Bootstrap
 * Creates the Rotation3DModule instance and exposes global helpers.
 */

window.Rotation3DModuleBootstrap = {
    instance: null,

    init() {
        if (this.instance) {
            return this.instance;
        }

        try {
            const mockCy = {
                container: () => ({
                    style: {
                        transform: '',
                        transformStyle: '',
                        perspective: '',
                        transformOrigin: '',
                        transition: ''
                    }
                }),
                nodes: () => [],
                edges: () => [],
                getElementById: () => null
            };

            this.instance = new Rotation3DModule({
                cy: window.cy || mockCy,
                UI: window.UI,
                globeLayout: window.GlobeLayout3D
            });

            this.exposeGlobalFunctions();
        } catch (error) {
            console.error('[Rotation3DModuleBootstrap] Initialization failed:', error);
        }

        return this.instance;
    },

    exposeGlobalFunctions() {
        const instance = this.instance;
        if (!instance) {
            return;
        }

        try {
            window.rotate3D = (axis, angle, animate = false, cyInstance = window.cy) => {
                return instance.rotate3D(axis, angle, animate, cyInstance);
            };

            window.startAutoRotation = (axis = 'y', speed = 1, cyInstance = window.cy) => {
                return instance.startAutoRotation(axis, speed, cyInstance);
            };

            window.stopAutoRotation = (cyInstance = window.cy) => {
                return instance.stopAutoRotation(cyInstance);
            };

            window.reset3DRotation = (animate = true, cyInstance = window.cy) => {
                return instance.reset3DRotation(animate, cyInstance);
            };

            window.get3DRotation = (cyInstance = window.cy) => {
                return instance.get3DRotation(cyInstance);
            };

            // Additional enhanced functions
            window.set3DRotation = (rotation, animate = false, cyInstance = window.cy) => {
                return instance.set3DRotation(rotation, animate, cyInstance);
            };

            window.isAutoRotating = (cyInstance = window.cy) => {
                return instance.isAutoRotating(cyInstance);
            };

            window.getRotationInfo = (cyInstance = window.cy) => {
                return instance.getRotationInfo(cyInstance);
            };

            window.updateRotationSettings = (settings) => {
                return instance.updateSettings(settings);
            };

            window.applyRotationMode = (mode, options = {}) => {
                return instance.applyRotationMode(mode, options);
            };
        } catch (error) {
            console.error('[Rotation3DModuleBootstrap] Error exposing global functions:', error);
        }
    }
};

window.Rotation3DModuleBootstrap.init();
