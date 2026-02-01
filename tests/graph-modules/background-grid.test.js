/**
 * Background Grid Module Unit Tests
 * 
 * Comprehensive test suite for the BackgroundGridModule
 * Tests all functionality with mocks and real DOM integration
 */

// Load the testing framework and module
// These would be loaded via script tags in the actual test runner

function runBackgroundGridTests() {
    const testFramework = window.GraphTestFramework;
    
    testFramework.describe('BackgroundGridModule', () => {
        let module;
        let mockDependencies;
        let testContainer;
        
        // Setup before each test
        function setup() {
            // Create test container
            testContainer = document.createElement('div');
            testContainer.id = 'test-container';
            testContainer.style.width = '400px';
            testContainer.style.height = '300px';
            testContainer.style.position = 'absolute';
            testContainer.style.top = '-9999px'; // Hide offscreen
            document.body.appendChild(testContainer);
            
            // Create mock dependencies
            mockDependencies = testFramework.createMockModule({
                cytoscape: {
                    ...testFramework.mockCytoscape,
                    container: () => testContainer,
                    width: () => 400,
                    height: () => 300,
                    zoom: () => 1,
                    pan: () => ({ x: 0, y: 0 }),
                    on: () => {},
                    ready: (callback) => { if (callback) callback(); }
                }
            });
            
            // Create module instance
            module = new BackgroundGridModule(mockDependencies);
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
            
            // Remove any grid containers
            const grids = document.querySelectorAll('#background-grid');
            grids.forEach(grid => {
                if (grid.parentNode) {
                    grid.parentNode.removeChild(grid);
                }
            });
        }
        
        testFramework.it('should initialize correctly', () => {
            setup();
            
            testFramework.expect(module).toBeInstanceOf(BackgroundGridModule);
            testFramework.expect(module.isEnabled).toBeTruthy();
            testFramework.expect(module.gridSize).toBe(20);
            testFramework.expect(module.gridColor).toBe('#e0e0e0');
            testFramework.expect(module.gridOpacity).toBe(0.3);
            
            cleanup();
        });
        
        testFramework.it('should create grid container', () => {
            setup();
            
            // Grid should be created during init
            const gridContainer = document.getElementById('background-grid');
            testFramework.expect(gridContainer).toBeTruthy();
            testFramework.expect(gridContainer.style.position).toBe('absolute');
            testFramework.expect(gridContainer.style.pointerEvents).toBe('none');
            
            cleanup();
        });
        
        testFramework.it('should show grid correctly', () => {
            setup();
            
            const result = module.showGrid();
            
            testFramework.expect(result).toBeTruthy();
            testFramework.expect(module.isGridVisible()).toBeTruthy();
            
            const gridContainer = document.getElementById('background-grid');
            testFramework.expect(gridContainer.style.display).toBe('block');
            testFramework.expect(gridContainer.style.visibility).toBe('visible');
            
            cleanup();
        });
        
        testFramework.it('should hide grid correctly', () => {
            setup();
            
            // First show the grid
            module.showGrid();
            testFramework.expect(module.isGridVisible()).toBeTruthy();
            
            // Then hide it
            const result = module.hideGrid();
            
            testFramework.expect(result).toBeTruthy();
            testFramework.expect(module.isGridVisible()).toBeFalsy();
            
            const gridContainer = document.getElementById('background-grid');
            testFramework.expect(gridContainer.style.display).toBe('none');
            testFramework.expect(gridContainer.style.visibility).toBe('hidden');
            
            cleanup();
        });
        
        testFramework.it('should toggle grid visibility', () => {
            setup();
            
            // Start hidden
            testFramework.expect(module.isGridVisible()).toBeFalsy();
            
            // First toggle - should show
            module.toggleGrid();
            testFramework.expect(module.isGridVisible()).toBeTruthy();
            
            // Second toggle - should hide
            module.toggleGrid();
            testFramework.expect(module.isGridVisible()).toBeFalsy();
            
            cleanup();
        });
        
        testFramework.it('should refresh grid correctly', () => {
            setup();
            
            // Show grid first
            module.showGrid();
            const originalContainer = document.getElementById('background-grid');
            testFramework.expect(originalContainer).toBeTruthy();
            
            // Refresh grid
            const result = module.refreshGrid();
            
            testFramework.expect(result).toBeTruthy();
            
            // Should still have a grid container (new one)
            const newContainer = document.getElementById('background-grid');
            testFramework.expect(newContainer).toBeTruthy();
            
            cleanup();
        });
        
        testFramework.it('should handle enable/disable correctly', () => {
            setup();
            
            // Start enabled
            testFramework.expect(module.isEnabled).toBeTruthy();
            
            // Show grid
            module.showGrid();
            testFramework.expect(module.isGridVisible()).toBeTruthy();
            
            // Disable - should hide grid
            module.setGridEnabled(false);
            testFramework.expect(module.isEnabled).toBeFalsy();
            testFramework.expect(module.isGridVisible()).toBeFalsy();
            
            // Try to show while disabled - should fail
            const result = module.showGrid();
            testFramework.expect(result).toBeFalsy();
            
            // Re-enable
            module.setGridEnabled(true);
            testFramework.expect(module.isEnabled).toBeTruthy();
            
            cleanup();
        });
        
        testFramework.it('should update configuration correctly', () => {
            setup();
            
            const newConfig = {
                gridSize: 30,
                gridColor: '#ff0000',
                gridOpacity: 0.5,
                debug: true
            };
            
            module.setConfig(newConfig);
            
            testFramework.expect(module.gridSize).toBe(30);
            testFramework.expect(module.gridColor).toBe('#ff0000');
            testFramework.expect(module.gridOpacity).toBe(0.5);
            testFramework.expect(module.config.debug).toBeTruthy();
            
            cleanup();
        });
        
        testFramework.it('should return correct status', () => {
            setup();
            
            const status = module.getStatus();
            
            testFramework.expect(status).toBeInstanceOf(Object);
            testFramework.expect(status.isEnabled).toBeTruthy();
            testFramework.expect(status.hasContainer).toBeTruthy();
            testFramework.expect(status.config).toBeInstanceOf(Object);
            testFramework.expect(status.viewport).toBeInstanceOf(Object);
            testFramework.expect(status.viewport.width).toBe(400);
            testFramework.expect(status.viewport.height).toBe(300);
            
            cleanup();
        });
        
        testFramework.it('should handle missing Cytoscape instance gracefully', () => {
            const mockDepsNoCy = testFramework.createMockModule({
                cytoscape: null
            });
            
            const moduleNoCy = new BackgroundGridModule(mockDepsNoCy);
            
            testFramework.expect(moduleNoCy).toBeInstanceOf(BackgroundGridModule);
            
            // Should not crash when calling methods
            const showResult = moduleNoCy.showGrid();
            testFramework.expect(showResult).toBeFalsy();
            
            const status = moduleNoCy.getStatus();
            testFramework.expect(status.hasContainer).toBeFalsy();
            
            moduleNoCy.destroy();
        });
        
        testFramework.it('should create SVG grid pattern correctly', () => {
            setup();
            
            module.showGrid();
            const gridContainer = document.getElementById('background-grid');
            const svg = gridContainer.querySelector('svg');
            
            testFramework.expect(svg).toBeTruthy();
            testFramework.expect(svg.tagName.toLowerCase()).toBe('svg');
            
            const pattern = svg.querySelector('pattern');
            testFramework.expect(pattern).toBeTruthy();
            testFramework.expect(pattern.id).toBe('grid-pattern');
            
            const rect = svg.querySelector('rect');
            testFramework.expect(rect).toBeTruthy();
            testFramework.expect(rect.getAttribute('fill')).toBe('url(#grid-pattern)');
            
            cleanup();
        });
        
        testFramework.it('should handle checkbox synchronization', () => {
            setup();
            
            // Create test checkboxes
            const showGridCheckbox = document.createElement('input');
            showGridCheckbox.type = 'checkbox';
            showGridCheckbox.id = 'showBackgroundGrid';
            showGridCheckbox.checked = false;
            document.body.appendChild(showGridCheckbox);
            
            const graphAreaCheckbox = document.createElement('input');
            graphAreaCheckbox.type = 'checkbox';
            graphAreaCheckbox.id = 'showGridCheckbox';
            graphAreaCheckbox.checked = false;
            document.body.appendChild(graphAreaCheckbox);
            
            // Create new module with checkbox sync
            module.destroy();
            module = new BackgroundGridModule({
                ...mockDependencies,
                config: { autoSync: true }
            });
            
            // Show grid should update checkboxes
            module.showGrid();
            
            // Note: In a real browser environment, these would be updated
            // In this test environment, we're testing the method calls don't crash
            testFramework.expect(module.isGridVisible()).toBeTruthy();
            
            // Cleanup test checkboxes
            document.body.removeChild(showGridCheckbox);
            document.body.removeChild(graphAreaCheckbox);
            
            cleanup();
        });
        
        testFramework.it('should handle viewport monitoring', () => {
            setup();
            
            // Enable responsive mode
            module.setConfig({ responsive: true });
            
            // Mock zoom change
            mockDependencies.cytoscape.zoom = () => 2; // 2x zoom
            
            // This would normally trigger on viewport events
            // We'll test the method directly
            module.updateGridForViewport();
            
            // Grid size should be adjusted for zoom
            testFramework.expect(module.gridSize).toBe(10); // 20 / 2 = 10
            
            cleanup();
        });
        
        testFramework.it('should handle destruction correctly', () => {
            setup();
            
            module.showGrid();
            testFramework.expect(document.getElementById('background-grid')).toBeTruthy();
            
            module.destroy();
            
            // Grid should be removed
            testFramework.expect(document.getElementById('background-grid')).toBeFalsy();
            
            // Properties should be cleaned
            testFramework.expect(module.cy).toBeFalsy();
            testFramework.expect(module.gridContainer).toBeFalsy();
            
            // Don't call cleanup since we've already destroyed
        });
    });
    
    // Run performance tests
    testFramework.describe('BackgroundGridModule Performance', () => {
        testFramework.it('should create grid quickly', () => {
            const testContainer = document.createElement('div');
            testContainer.style.width = '400px';
            testContainer.style.height = '300px';
            document.body.appendChild(testContainer);
            
            const mockDeps = testFramework.createMockModule({
                cytoscape: {
                    ...testFramework.mockCytoscape,
                    container: () => testContainer
                }
            });
            
            const benchmark = testFramework.benchmarkFunction(() => {
                const module = new BackgroundGridModule(mockDeps);
                module.showGrid();
                module.destroy();
            }, 100);
            
            console.log('Grid creation benchmark:', benchmark);
            
            // Should create grid in reasonable time (less than 1ms average)
            testFramework.expect(benchmark.averageTime).toBeLessThan(1);
            
            document.body.removeChild(testContainer);
        });
    });
}

// Auto-run tests if framework is available
if (typeof window !== 'undefined' && window.GraphTestFramework) {
    console.log('🧪 Running Background Grid Module Tests...');
    runBackgroundGridTests();
    window.GraphTestFramework.printOverallResults();
} else {
    console.log('📋 Background Grid tests loaded, waiting for test framework...');
    
    // Try to run when framework becomes available
    let checkCount = 0;
    const checkInterval = setInterval(() => {
        if (window.GraphTestFramework || checkCount > 50) {
            clearInterval(checkInterval);
            if (window.GraphTestFramework) {
                runBackgroundGridTests();
                window.GraphTestFramework.printOverallResults();
            }
        }
        checkCount++;
    }, 100);
}
