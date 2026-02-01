/**
 * Performance Manager Module Unit Tests
 * 
 * Comprehensive test suite for the PerformanceManagerModule
 * Tests all performance monitoring, optimization, and management functionality
 */

function runPerformanceManagerTests() {
    const testFramework = window.GraphTestFramework;
    
    testFramework.describe('PerformanceManagerModule', () => {
        let module;
        let mockDependencies;
        let testContainer;
        
        // Setup before each test
        function setup() {
            // Create test container
            testContainer = document.createElement('div');
            testContainer.id = 'performance-test-container';
            testContainer.style.width = '800px';
            testContainer.style.height = '600px';
            testContainer.style.position = 'absolute';
            testContainer.style.top = '-9999px'; // Hide offscreen
            document.body.appendChild(testContainer);
            
            // Create mock dependencies with enhanced Cytoscape mock
            mockDependencies = testFramework.createMockModule({
                cytoscape: {
                    ...testFramework.mockCytoscape,
                    container: () => testContainer,
                    width: () => 800,
                    height: () => 600,
                    on: (event, callback) => {
                        // Store callbacks for testing
                        if (!mockDependencies.cytoscape._callbacks) {
                            mockDependencies.cytoscape._callbacks = {};
                        }
                        if (!mockDependencies.cytoscape._callbacks[event]) {
                            mockDependencies.cytoscape._callbacks[event] = [];
                        }
                        mockDependencies.cytoscape._callbacks[event].push(callback);
                    },
                    nodes: () => ({
                        length: 1000,
                        forEach: (callback) => {
                            // Simulate nodes
                            for (let i = 0; i < 1000; i++) {
                                const mockNode = {
                                    style: () => {},
                                    data: (key) => key === 'size' ? '30px' : `node_${i}`
                                };
                                callback(mockNode);
                            }
                        }
                    }),
                    edges: () => ({
                        length: 2000,
                        forEach: (callback) => {
                            // Simulate edges
                            for (let i = 0; i < 2000; i++) {
                                const mockEdge = {
                                    style: () => {}
                                };
                                callback(mockEdge);
                            }
                        }
                    })
                }
            });
            
            // Create module instance
            module = new window.PerformanceManagerModule(mockDependencies);
        }
        
        // Cleanup after each test
        function cleanup() {
            if (module) {
                module.destroy();
                module = null;
            }
            
            if (testContainer && testContainer.parentNode) {
                testContainer.parentNode.removeChild(testContainer);
            }
        }
        
        testFramework.it('should initialize correctly', () => {
            setup();
            
            testFramework.expect(module).toBeInstanceOf(PerformanceManagerModule);
            testFramework.expect(typeof module.isWebGLEnabled).toBe('boolean');
            testFramework.expect(module.performanceMetrics).toBeInstanceOf(Object);
            testFramework.expect(module.config).toBeInstanceOf(Object);
            
            cleanup();
        });
        
        testFramework.it('should check WebGL support', () => {
            setup();
            
            const webglSupport = module.checkWebGLSupport();
            
            testFramework.expect(typeof webglSupport).toBe('boolean');
            testFramework.expect(module.isWebGLEnabled).toBe(webglSupport);
            
            cleanup();
        });
        
        testFramework.it('should setup performance monitoring', () => {
            setup();
            
            const result = module.setupPerformanceMonitoring();
            
            // Should not crash and should setup event listeners
            testFramework.expect(result).toBeTruthy(); // No explicit return, but should not crash
            
            // Check that event listeners were registered
            const callbacks = mockDependencies.cytoscape._callbacks;
            testFramework.expect(callbacks).toBeInstanceOf(Object);
            testFramework.expect(callbacks.render).toBeInstanceOf(Array);
            testFramework.expect(callbacks.render.length).toBeGreaterThan(0);
            
            cleanup();
        });
        
        testFramework.it('should update performance metrics', () => {
            setup();
            
            const renderTime = performance.now();
            module.updatePerformanceMetrics(renderTime);
            
            testFramework.expect(module.performanceMetrics.renderTime).toBe(renderTime);
            testFramework.expect(module.performanceMetrics.renderCount).toBeGreaterThan(0);
            testFramework.expect(module.performanceMetrics.averageRenderTime).toBeGreaterThan(0);
            
            cleanup();
        });
        
        testFramework.it('should check memory usage', () => {
            setup();
            
            const memoryInfo = module.checkMemoryUsage();
            
            if (performance.memory) {
                testFramework.expect(memoryInfo).toBeInstanceOf(Object);
                testFramework.expect(memoryInfo.used).toBeInstanceOf('number');
                testFramework.expect(memoryInfo.total).toBeInstanceOf('number');
                testFramework.expect(memoryInfo.limit).toBeInstanceOf('number');
            } else {
                testFramework.expect(memoryInfo).toBeFalsy();
            }
            
            cleanup();
        });
        
        testFramework.it('should optimize memory usage', () => {
            setup();
            
            const result = module.optimizeMemoryUsage();
            
            testFramework.expect(typeof result).toBe('boolean');
            
            // Check that LOD level might have been updated
            if (result) {
                testFramework.expect(module.performanceMetrics.lodLevel).toBeGreaterThan(0);
            }
            
            cleanup();
        });
        
        testFramework.it('should setup keep-alive tick', () => {
            setup();
            
            module.setupKeepAliveTick();
            
            testFramework.expect(module.keepAliveState.isActive).toBeTruthy();
            testFramework.expect(module.keepAliveState.interval).toBeTruthy();
            
            // Stop the tick to prevent interference with other tests
            module.stopKeepAliveTick();
            
            cleanup();
        });
        
        testFramework.it('should apply aggressive LOD', () => {
            setup();
            
            const result = module.applyAggressiveLOD();
            
            testFramework.expect(result).toBeTruthy();
            testFramework.expect(module.performanceMetrics.lodLevel).toBe(2);
            
            cleanup();
        });
        
        testFramework.it('should generate performance report', () => {
            setup();
            
            const report = module.getPerformanceReport();
            
            testFramework.expect(report).toBeInstanceOf(Object);
            testFramework.expect(report.timestamp).toBeTruthy();
            testFramework.expect(report.webgl).toBeInstanceOf(Object);
            testFramework.expect(report.metrics).toBeInstanceOf(Object);
            testFramework.expect(report.recommendations).toBeInstanceOf(Array);
            testFramework.expect(report.status).toBeTruthy();
            
            // Check status values
            const validStatuses = ['excellent', 'good', 'fair', 'poor'];
            testFramework.expect(validStatuses).toContain(report.status);
            
            cleanup();
        });
        
        testFramework.it('should reset optimizations', () => {
            setup();
            
            // First apply some optimizations
            module.applyAggressiveLOD();
            testFramework.expect(module.performanceMetrics.lodLevel).toBe(2);
            
            // Then reset them
            const result = module.resetOptimizations();
            
            testFramework.expect(result).toBeTruthy();
            testFramework.expect(module.performanceMetrics.lodLevel).toBe(0);
            
            cleanup();
        });
        
        testFramework.it('should stop keep-alive tick', () => {
            setup();
            
            // Start the tick first
            module.setupKeepAliveTick();
            testFramework.expect(module.keepAliveState.isActive).toBeTruthy();
            
            // Then stop it
            module.stopKeepAliveTick();
            
            testFramework.expect(module.keepAliveState.isActive).toBeFalsy();
            testFramework.expect(module.keepAliveState.interval).toBeFalsy();
            
            cleanup();
        });
        
        testFramework.it('should handle missing Cytoscape instance gracefully', () => {
            const mockDepsNoCy = testFramework.createMockModule({
                cytoscape: null
            });
            
            const moduleNoCy = new PerformanceManagerModule(mockDepsNoCy);
            
            testFramework.expect(moduleNoCy).toBeInstanceOf(PerformanceManagerModule);
            
            // Should not crash when calling methods
            const webglResult = moduleNoCy.checkWebGLSupport();
            testFramework.expect(typeof webglResult).toBe('boolean');
            
            const memoryResult = moduleNoCy.checkMemoryUsage();
            testFramework.expect(memoryResult === null || typeof memoryResult === 'object').toBeTruthy();
            
            const optimizeResult = moduleNoCy.optimizeMemoryUsage();
            testFramework.expect(optimizeResult).toBeFalsy();
            
            moduleNoCy.destroy();
        });
        
        testFramework.it('should track performance warnings', () => {
            setup();
            
            // Force a memory warning by temporarily modifying the threshold
            const originalThreshold = module.config.memoryWarningThreshold;
            module.config.memoryWarningThreshold = 0.01; // Very low threshold
            
            module.checkMemoryUsage();
            
            // Restore original threshold
            module.config.memoryWarningThreshold = originalThreshold;
            
            // Check if warnings were recorded (only if performance.memory is available)
            if (performance.memory) {
                testFramework.expect(module.performanceMetrics.warnings).toBeInstanceOf(Array);
            }
            
            cleanup();
        });
        
        testFramework.it('should handle configuration changes', () => {
            setup();
            
            const originalConfig = { ...module.config };
            
            // Modify configuration
            module.config.lowFPSThreshold = 10;
            module.config.enableAutoLOD = false;
            
            testFramework.expect(module.config.lowFPSThreshold).toBe(10);
            testFramework.expect(module.config.enableAutoLOD).toBeFalsy();
            
            // Restore configuration
            module.config = originalConfig;
            
            cleanup();
        });
        
        testFramework.it('should clean up properly on destroy', () => {
            setup();
            
            // Start keep-alive to test cleanup
            module.setupKeepAliveTick();
            testFramework.expect(module.keepAliveState.isActive).toBeTruthy();
            
            // Destroy module
            module.destroy();
            
            // Check that everything is cleaned up
            testFramework.expect(module.cy).toBeFalsy();
            testFramework.expect(module.keepAliveState.isActive).toBeFalsy();
            testFramework.expect(Object.keys(module.performanceMetrics || {})).toHaveLength(0);
            
            // Don't call cleanup since we've already destroyed
        });
    });
    
    // Performance tests
    testFramework.describe('PerformanceManagerModule Performance', () => {
        testFramework.it('should execute performance functions quickly', () => {
            const testContainer = document.createElement('div');
            testContainer.style.width = '800px';
            testContainer.style.height = '600px';
            document.body.appendChild(testContainer);
            
            const mockDeps = testFramework.createMockModule({
                cytoscape: {
                    ...testFramework.mockCytoscape,
                    container: () => testContainer,
                    nodes: () => ({ length: 100, forEach: () => {} }),
                    edges: () => ({ length: 200, forEach: () => {} })
                }
            });
            
            const benchmark = testFramework.benchmarkFunction(() => {
                const module = new PerformanceManagerModule(mockDeps);
                module.checkWebGLSupport();
                module.checkMemoryUsage();
                module.getPerformanceReport();
                module.destroy();
            }, 20);
            
            console.log('Performance manager benchmark:', benchmark);
            
            // Should execute performance functions quickly (less than 10ms average)
            testFramework.expect(benchmark.averageTime).toBeLessThan(10);
            
            document.body.removeChild(testContainer);
        });
        
        testFramework.it('should handle large datasets efficiently', () => {
            const testContainer = document.createElement('div');
            testContainer.style.width = '800px';
            testContainer.style.height = '600px';
            document.body.appendChild(testContainer);
            
            // Simulate large dataset
            const mockDeps = testFramework.createMockModule({
                cytoscape: {
                    ...testFramework.mockCytoscape,
                    container: () => testContainer,
                    nodes: () => ({ 
                        length: 10000, 
                        forEach: (callback) => {
                            // Don't actually iterate 10000 times for performance
                            for (let i = 0; i < 10; i++) {
                                callback({ style: () => {}, data: () => '30px' });
                            }
                        }
                    }),
                    edges: () => ({ 
                        length: 20000, 
                        forEach: (callback) => {
                            // Don't actually iterate 20000 times for performance
                            for (let i = 0; i < 10; i++) {
                                callback({ style: () => {} });
                            }
                        }
                    })
                }
            });
            
            const startTime = performance.now();
            const module = new PerformanceManagerModule(mockDeps);
            
            // Test optimization functions
            module.optimizeMemoryUsage();
            module.applyAggressiveLOD();
            const report = module.getPerformanceReport();
            
            const endTime = performance.now();
            const executionTime = endTime - startTime;
            
            // Should handle large datasets in reasonable time
            testFramework.expect(executionTime).toBeLessThan(100); // 100ms
            testFramework.expect(report.metrics.nodeCount).toBe(10000);
            testFramework.expect(report.metrics.edgeCount).toBe(20000);
            
            module.destroy();
            document.body.removeChild(testContainer);
        });
    });
}

// Auto-run tests if framework is available
if (typeof window !== 'undefined' && window.GraphTestFramework) {
    console.log('🧪 Running Performance Manager Module Tests...');
    runPerformanceManagerTests();
} else {
    console.log('📋 Performance Manager tests loaded, waiting for test framework...');
    
    // Try to run when framework becomes available
    let checkCount = 0;
    const checkInterval = setInterval(() => {
        if (window.GraphTestFramework || checkCount > 50) {
            clearInterval(checkInterval);
            if (window.GraphTestFramework) {
                runPerformanceManagerTests();
            }
        }
        checkCount++;
    }, 100);
}
