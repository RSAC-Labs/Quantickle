/**
 * 3D Rotation Manager Module for Quantickle
 * 
 * Handles 3D transformations, rotations, and auto-rotation of the graph container.
 * Provides manual and automatic rotation controls with smooth animations.
 * 
 * @author Quantickle Development Team
 * @version 1.0.0
 * @since 2024
 */

class Rotation3DModule {
    constructor(dependencies = {}) {
        // Dependencies
        this.cy = dependencies.cy || null;
        this.UI = dependencies.UI || window.UI;
        this.globeLayout = dependencies.globeLayout || window.GlobeLayout3D;
        
        // State management
        // Support multiple Cytoscape instances/containers by tracking
        // rotation state per container element
        this.containers = new Map(); // Map<HTMLElement, {currentRotation, autoRotationId, baseTransform}>
        this.isInitialized = false;
        
        // Animation settings
        this.animationDuration = 300; // ms for smooth transitions
        this.autoRotationSpeed = 1; // degrees per frame
        this.maxRotationSpeed = 10; // max degrees per step
        
        // Perspective settings
        this.perspectiveDistance = 1000; // px

        // Rotation behavior
        // Center is derived from the container dimensions
        if (this.cy && typeof this.cy.container === 'function') {
            const rect = this.cy.container().getBoundingClientRect();
            this.rotationCenter = {
                x: rect.width / 2,
                y: rect.height / 2,
                z: Math.min(rect.width, rect.height) / 2
            };
        } else {
            this.rotationCenter = { x: 0, y: 0, z: 0 };
        }
        // Register initial Cytoscape instance if provided
        if (this.cy) {
            this._ensureContainerState(this.cy);
        }
        this.isInitialized = true;
    }

    /**
     * Rotate the graph in 3D space along specified axis
     * @param {string} axis - 'x', 'y', or 'z'
     * @param {number} angle - Rotation angle in degrees
     * @param {boolean} animate - Whether to animate the rotation
     * @returns {boolean} Success status
     */
    rotate3D(axis, angle, animate = false, targetCy = this.cy) {
        if (!this.validateRotationInput(axis, angle)) {
            return false;
        }

        const info = this._getContainerInfo(targetCy);
        if (!info) {
            return false;
        }

        const { state, container } = info;

        try {
            // Clamp angle to reasonable values
            const clampedAngle = Math.max(-this.maxRotationSpeed, Math.min(this.maxRotationSpeed, angle));
            
            // Update current rotation
            state.currentRotation[axis] += clampedAngle;

            // Normalize rotation to 0-360 degrees
            state.currentRotation[axis] = this.normalizeAngle(state.currentRotation[axis]);

            // Apply 3D transformation to the container
            const success = this.applyTransformation(state, container, animate);

            if (success) {
                // Show notification
                this.showRotationNotification(axis, clampedAngle);
            }

            return success;
        } catch (error) {
            console.error('[3DRotation] Error during rotation:', error);
            return false;
        }
    }

    /**
     * Apply 3D transformation to the Cytoscape container
     * @param {boolean} animate - Whether to animate the transformation
     * @returns {boolean} Success status
     */
    applyTransformation(state, container, animate = false) {
        try {
            if (!container) {
                return false;
            }

            const layer = state.rotationLayer || container;

            // Capture original transform once per container
            if (state.baseTransform === null) {
                state.baseTransform = layer.style.transform || '';
            }

            // Build transformation string
            const transform = `${state.baseTransform} ${this.buildTransformString(state.currentRotation)}`.trim();

            // Apply transformation with optional animation
            if (animate) {
                layer.style.transition = `transform ${this.animationDuration}ms ease-in-out`;
            } else {
                layer.style.transition = 'none';
            }

            layer.style.transform = transform;
            layer.style.transformStyle = 'preserve-3d';
            container.style.perspective = `${this.perspectiveDistance}px`;

            const rc = state.rotationCenter || this.rotationCenter;
            const originX = typeof rc.x === 'number' ? `${rc.x}px` : rc.x;
            const originY = typeof rc.y === 'number' ? `${rc.y}px` : rc.y;
            const originZ = typeof rc.z === 'number' ? `${rc.z}px` : rc.z;
            layer.style.transformOrigin = `${originX} ${originY} ${originZ}`;

            if (state.lockedPosition) {
                container.style.left = state.lockedPosition.left;
                container.style.top = state.lockedPosition.top;
            }

            if (state.lockedRect) {
                // Reset to base transform before measuring drift
                container.style.transform = state.containerBaseTransform || '';
                const rect = container.getBoundingClientRect();
                const dx = rect.left - state.lockedRect.left;
                const dy = rect.top - state.lockedRect.top;
                const translate = `translate(${-dx}px, ${-dy}px)`;
                container.style.transform = `${translate} ${state.containerBaseTransform || ''}`.trim();
            }

            // Debugging: Track graph origin, transform origin, and container coordinates during rotation

            try {
                const rect = container.getBoundingClientRect();
                const graphOrigin = (window.DataManager && window.DataManager.plottingSpace
                    && window.DataManager.plottingSpace.origin)
                    ? window.DataManager.plottingSpace.origin
                    : state.rotationCenter || this.rotationCenter;

            } catch (debugError) {
            }

            return true;
        } catch (error) {
            console.error('[3DRotation] Error applying transformation:', error);
            return false;
        }
    }

    /**
     * Build CSS transform string from current rotation values
     * @returns {string} CSS transform string
     */
    buildTransformString(rotation) {
        const { x, y, z } = rotation;
        return `rotateX(${x}deg) rotateY(${y}deg) rotateZ(${z}deg)`;
    }

    /**
     * Start auto-rotation (delegates to 3D Globe layout if available)
     * @param {string} axis - Axis to rotate around ('x', 'y', or 'z')
     * @param {number} speed - Rotation speed in degrees per frame
     * @returns {boolean} Success status
     */
    startAutoRotation(axis = 'y', speed = this.autoRotationSpeed, targetCy = this.cy) {
        // First try to use the 3D Globe layout's auto-rotation
        if (this.globeLayout && this.globeLayout.isActive && targetCy === this.cy) {
            this.globeLayout.startAutoRotation();
            return true;
        }

        const info = this._getContainerInfo(targetCy);
        if (!info) {
            return false;
        }
        const { state } = info;

        // Fallback to our own auto-rotation implementation
        if (state.autoRotationId) {
            this.stopAutoRotation(targetCy);
        }

        const rotateStep = () => {
            if (this.rotate3D(axis, speed, false, targetCy)) {
                state.autoRotationId = requestAnimationFrame(rotateStep);
            } else {
                state.autoRotationId = null;
            }
        };

        state.autoRotationId = requestAnimationFrame(rotateStep);
        return true;
    }

    /**
     * Stop auto-rotation
     * @returns {boolean} Success status
     */
    stopAutoRotation(targetCy = this.cy) {
        // Stop Globe layout auto-rotation if active and targeting default cy
        if (this.globeLayout && targetCy === this.cy) {
            this.globeLayout.stopAutoRotation();
        }

        const info = this._getContainerInfo(targetCy);
        if (!info) {
            return false;
        }
        const { state } = info;

        // Stop our own auto-rotation
        if (state.autoRotationId) {
            cancelAnimationFrame(state.autoRotationId);
            state.autoRotationId = null;
            return true;
        }

        return false;
    }

    /**
     * Reset 3D rotation to default (0, 0, 0)
     * @param {boolean} animate - Whether to animate the reset
     * @returns {boolean} Success status
     */
    reset3DRotation(animate = true, targetCy = this.cy) {
        const info = this._getContainerInfo(targetCy);
        if (!info) {
            return false;
        }
        const { state, container } = info;

        try {

            // Stop any active auto-rotation
            this.stopAutoRotation(targetCy);

            // Reset rotation values
            state.currentRotation = { x: 0, y: 0, z: 0 };

            if (container) {
                if (animate) {
                    container.style.transition = `transform ${this.animationDuration}ms ease-in-out`;
                }

                container.style.transform = state.baseTransform || 'none';
                container.style.transformStyle = 'flat';
                container.style.perspective = 'none';
                container.style.transformOrigin = '';

                // Ensure future rotations use current base transform
                state.baseTransform = container.style.transform || '';

                if (animate) {
                    setTimeout(() => {
                        container.style.transition = 'none';
                    }, this.animationDuration);
                }
            }

            if (this.UI && this.UI.showNotification) {
                this.UI.showNotification('3D rotation reset', 'info');
            }

            return true;
        } catch (error) {
            console.error('[3DRotation] Error resetting rotation:', error);
            return false;
        }
    }

    /**
     * Get current 3D rotation values
     * @returns {Object} Current rotation values {x, y, z}
     */
    get3DRotation(targetCy = this.cy) {
        const info = this._getContainerInfo(targetCy);
        if (!info) return { x: 0, y: 0, z: 0 };
        return { ...info.state.currentRotation };
    }

    /**
     * Set specific rotation values
     * @param {Object} rotation - Rotation values {x?, y?, z?}
     * @param {boolean} animate - Whether to animate the change
     * @returns {boolean} Success status
     */
    set3DRotation(rotation, animate = false, targetCy = this.cy) {
        const info = this._getContainerInfo(targetCy);
        if (!info) {
            return false;
        }
        const { state, container } = info;

        try {
            if (typeof rotation.x === 'number') {
                state.currentRotation.x = this.normalizeAngle(rotation.x);
            }
            if (typeof rotation.y === 'number') {
                state.currentRotation.y = this.normalizeAngle(rotation.y);
            }
            if (typeof rotation.z === 'number') {
                state.currentRotation.z = this.normalizeAngle(rotation.z);
            }
            return this.applyTransformation(state, container, animate);
        } catch (error) {
            console.error('[3DRotation] Error setting rotation:', error);
            return false;
        }
    }

    /**
     * Check if auto-rotation is currently active
     * @returns {boolean} Auto-rotation status
     */
    isAutoRotating(targetCy = this.cy) {
        const info = this._getContainerInfo(targetCy);
        if (!info) return false;
        return info.state.autoRotationId !== null ||
               (this.globeLayout && targetCy === this.cy && this.globeLayout.isActive && this.globeLayout.isAutoRotating);
    }

    /**
     * Get rotation information and status
     * @returns {Object} Rotation info
     */
    getRotationInfo(targetCy = this.cy) {
        return {
            currentRotation: this.get3DRotation(targetCy),
            isAutoRotating: this.isAutoRotating(targetCy),
            animationDuration: this.animationDuration,
            autoRotationSpeed: this.autoRotationSpeed,
            perspectiveDistance: this.perspectiveDistance,
            isInitialized: this.isInitialized
        };
    }

    /**
     * Update rotation settings
     * @param {Object} settings - Settings to update
     * @returns {boolean} Success status
     */
    updateSettings(settings) {
        try {
            if (typeof settings.animationDuration === 'number') {
                this.animationDuration = Math.max(0, settings.animationDuration);
            }
            if (typeof settings.autoRotationSpeed === 'number') {
                this.autoRotationSpeed = Math.max(0.1, Math.min(10, settings.autoRotationSpeed));
            }
            if (typeof settings.maxRotationSpeed === 'number') {
                this.maxRotationSpeed = Math.max(1, Math.min(180, settings.maxRotationSpeed));
            }
            if (typeof settings.perspectiveDistance === 'number') {
                this.perspectiveDistance = Math.max(100, settings.perspectiveDistance);
            }
            return true;
        } catch (error) {
            console.error('[3DRotation] Error updating settings:', error);
            return false;
        }
    }

    // === HELPER METHODS ===

    /**
     * Validate rotation input parameters
     * @param {string} axis - Rotation axis
     * @param {number} angle - Rotation angle
     * @returns {boolean} Validation result
     */
    validateRotationInput(axis, angle) {
        if (!['x', 'y', 'z'].includes(axis)) {
            return false;
        }
        
        if (typeof angle !== 'number' || isNaN(angle)) {
            return false;
        }
        
        return true;
    }

    /**
     * Normalize angle to 0-360 degrees
     * @param {number} angle - Angle in degrees
     * @returns {number} Normalized angle
     */
    normalizeAngle(angle) {
        let normalized = angle % 360;
        if (normalized < 0) {
            normalized += 360;
        }
        return normalized;
    }

    /**
     * Show rotation notification
     * @param {string} axis - Rotation axis
     * @param {number} angle - Rotation angle
     */
    showRotationNotification(axis, angle) {
        if (this.UI && this.UI.showNotification) {
            this.UI.showNotification(`Rotated ${axis.toUpperCase()} by ${angle}°`, 'info');
        }
    }

    /**
     * Clean up resources and stop any ongoing operations
     */
    destroy() {

        // Stop auto-rotation and reset for all containers
        for (const [container, state] of this.containers.entries()) {
            if (state.autoRotationId) {
                cancelAnimationFrame(state.autoRotationId);
            }
            container.style.transform = state.baseTransform || 'none';
            container.style.transformStyle = 'flat';
            container.style.perspective = 'none';
            container.style.transformOrigin = '';
        }

        this.containers.clear();

        // Clear references
        this.cy = null;
        this.UI = null;
        this.globeLayout = null;
        this.isInitialized = false;
    }

    /**
     * Ensure container state exists for a given Cytoscape instance
     * @param {Object} cyInstance
     * @returns {Object|null} { state, container }
     */
    _getContainerInfo(cyInstance = this.cy) {
        if (!cyInstance || typeof cyInstance.container !== 'function') {
            return null;
        }

        const container = cyInstance.container();
        if (!container) {
            return null;
        }
        const rect = container.getBoundingClientRect();

        let state = this.containers.get(container);
        if (!state) {
            // Create a wrapper layer for rotation so the outer container's
            // bounding box remains fixed during transforms
            let rotationLayer = container.querySelector(':scope > .rotation-3d-layer');
            let lockedRect = null;
            let containerBaseTransform = container.style.transform || '';
            let lockedPosition = null;
            if (!rotationLayer) {
                rotationLayer = document.createElement('div');
                rotationLayer.className = 'rotation-3d-layer';
                rotationLayer.style.position = 'absolute';
                rotationLayer.style.top = '0';
                rotationLayer.style.left = '0';
                rotationLayer.style.width = '100%';
                rotationLayer.style.height = '100%';
                rotationLayer.style.transformStyle = 'preserve-3d';

                // Move existing Cytoscape layers into the rotation layer
                while (container.firstChild) {
                    rotationLayer.appendChild(container.firstChild);
                }
                container.appendChild(rotationLayer);

                // Clip rotated elements to the container bounds
                container.style.overflow = 'hidden';
                // Preserve existing positioning; only force relative when default is static
                const computedPosition = window.getComputedStyle(container).position;
                if (computedPosition === 'static') {
                    container.style.position = 'relative';
                } else if (computedPosition === 'absolute' || computedPosition === 'fixed') {
                    lockedPosition = {
                        left: `${container.offsetLeft}px`,
                        top: `${container.offsetTop}px`
                    };
                    container.style.left = lockedPosition.left;
                    container.style.top = lockedPosition.top;
                }
                lockedRect = { left: rect.left, top: rect.top };
            }

            state = {
                currentRotation: { x: 0, y: 0, z: 0 },
                autoRotationId: null,
                baseTransform: null,
                rotationLayer,
                lockedRect,
                containerBaseTransform,
                rotationCenter: {
                    x: rect.width / 2,
                    y: rect.height / 2,
                    z: Math.min(rect.width, rect.height) / 2
                },
                lockedPosition
            };
            this.containers.set(container, state);
        } else {
            state.rotationCenter = {
                x: rect.width / 2,
                y: rect.height / 2,
                z: Math.min(rect.width, rect.height) / 2
            };
        }

        return { state, container };
    }

    // Backward compatibility helper
    _ensureContainerState(cyInstance) {
        this._getContainerInfo(cyInstance);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Rotation3DModule;
} else {
    window.Rotation3DModule = Rotation3DModule;
}
