/**
 * Graph Module Testing Framework
 * 
 * Provides unit testing utilities specifically designed for testing graph modules
 * with Cytoscape.js integration and mock capabilities.
 */

class GraphModuleTestFramework {
    constructor() {
        this.testResults = [];
        this.currentSuite = null;
        this.mockCytoscape = null;
        this.setupMocks();
    }
    
    /**
     * Setup mock Cytoscape instance for testing
     */
    setupMocks() {
        this.mockCytoscape = {
            // Core Cytoscape methods
            nodes: () => ({ length: 0, forEach: () => {}, map: () => [] }),
            edges: () => ({ length: 0, forEach: () => {}, map: () => [] }),
            elements: () => ({ length: 0, forEach: () => {}, remove: () => {} }),
            add: () => ({ id: () => 'mock-element' }),
            remove: () => {},
            
            // Rendering methods
            fit: () => {},
            center: () => {},
            resize: () => {},
            width: () => 800,
            height: () => 600,
            zoom: () => 1,
            pan: () => ({ x: 0, y: 0 }),
            
            // Event methods
            on: () => {},
            off: () => {},
            emit: () => {},
            
            // Style methods
            style: () => ({ update: () => {} }),
            
            // Container methods
            container: () => document.createElement('div'),
            
            // State methods
            ready: (callback) => { if (callback) callback(); },
            
            // Mock data for testing
            _testData: {
                nodeCount: 0,
                edgeCount: 0,
                events: []
            }
        };
    }
    
    /**
     * Create a test suite
     */
    describe(suiteName, testFunction) {
        console.log(`\n🧪 Testing Suite: ${suiteName}`);
        this.currentSuite = {
            name: suiteName,
            tests: [],
            passed: 0,
            failed: 0,
            startTime: performance.now()
        };
        
        try {
            testFunction();
            this.currentSuite.endTime = performance.now();
            this.currentSuite.duration = this.currentSuite.endTime - this.currentSuite.startTime;
            this.testResults.push(this.currentSuite);
            this.printSuiteResults();
        } catch (error) {
            console.error(`❌ Suite ${suiteName} failed with error:`, error);
            this.currentSuite.error = error;
            this.testResults.push(this.currentSuite);
        }
    }
    
    /**
     * Create a test case
     */
    it(testName, testFunction) {
        const test = {
            name: testName,
            passed: false,
            error: null,
            startTime: performance.now()
        };
        
        try {
            testFunction();
            test.passed = true;
            test.endTime = performance.now();
            test.duration = test.endTime - test.startTime;
            console.log(`  ✅ ${testName} (${test.duration.toFixed(2)}ms)`);
            this.currentSuite.passed++;
        } catch (error) {
            test.passed = false;
            test.error = error;
            test.endTime = performance.now();
            test.duration = test.endTime - test.startTime;
            console.log(`  ❌ ${testName} - ${error.message} (${test.duration.toFixed(2)}ms)`);
            this.currentSuite.failed++;
        }
        
        this.currentSuite.tests.push(test);
    }
    
    /**
     * Assertion methods
     */
    expect(actual) {
        return {
            toBe: (expected) => {
                if (actual !== expected) {
                    throw new Error(`Expected ${actual} to be ${expected}`);
                }
            },
            toEqual: (expected) => {
                if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                    throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
                }
            },
            toBeTruthy: () => {
                if (!actual) {
                    throw new Error(`Expected ${actual} to be truthy`);
                }
            },
            toBeFalsy: () => {
                if (actual) {
                    throw new Error(`Expected ${actual} to be falsy`);
                }
            },
            toBeInstanceOf: (expectedClass) => {
                if (!(actual instanceof expectedClass)) {
                    throw new Error(`Expected ${actual} to be instance of ${expectedClass.name}`);
                }
            },
            toContain: (expected) => {
                if (!actual.includes(expected)) {
                    throw new Error(`Expected ${actual} to contain ${expected}`);
                }
            },
            toHaveLength: (expectedLength) => {
                if (actual.length !== expectedLength) {
                    throw new Error(`Expected length ${actual.length} to be ${expectedLength}`);
                }
            },
            toThrow: () => {
                let thrown = false;
                try {
                    actual();
                } catch (e) {
                    thrown = true;
                }
                if (!thrown) {
                    throw new Error('Expected function to throw an error');
                }
            }
        };
    }
    
    /**
     * Mock utilities
     */
    createMockModule(dependencies = {}) {
        return {
            cy: this.mockCytoscape,
            notifications: {
                show: (message, type) => console.log(`[${type}] ${message}`)
            },
            ...dependencies
        };
    }

    /**
     * Create a mock container element with Cytoscape-like API
     */
    createMockContainer(children = []) {
        return {
            id: () => 'mock-container',
            hasClass: (cls) => cls === 'container',
            children: () => children,
            position: () => ({ x: 0, y: 0 }),
            data: (key) => ({ width: 100, height: 100 }[key]),
            boundingBox: () => ({ w: 100, h: 100 })
        };
    }
    
    /**
     * Performance testing utilities
     */
    benchmarkFunction(fn, iterations = 1000) {
        const startTime = performance.now();
        for (let i = 0; i < iterations; i++) {
            fn();
        }
        const endTime = performance.now();
        return {
            totalTime: endTime - startTime,
            averageTime: (endTime - startTime) / iterations,
            iterations
        };
    }
    
    /**
     * Memory testing utilities
     */
    checkMemoryUsage() {
        if (performance.memory) {
            return {
                used: performance.memory.usedJSHeapSize / 1024 / 1024, // MB
                total: performance.memory.totalJSHeapSize / 1024 / 1024, // MB
                limit: performance.memory.jsHeapSizeLimit / 1024 / 1024 // MB
            };
        }
        return null;
    }
    
    /**
     * Print test suite results
     */
    printSuiteResults() {
        const suite = this.currentSuite;
        if (!suite) {
            console.log('No test suite to report');
            return;
        }
        
        const totalTests = suite.passed + suite.failed;
        const passRate = totalTests > 0 ? (suite.passed / totalTests * 100).toFixed(1) : 0;
        
        console.log(`\n📊 Suite Results: ${suite.name}`);
        console.log(`   ✅ Passed: ${suite.passed}`);
        console.log(`   ❌ Failed: ${suite.failed}`);
        console.log(`   📈 Pass Rate: ${passRate}%`);
        console.log(`   ⏱️  Duration: ${suite.duration ? suite.duration.toFixed(2) : 0}ms`);
        
        if (suite.failed > 0 && suite.tests) {
            console.log(`\n🔍 Failed Tests:`);
            suite.tests.filter(t => !t.passed).forEach(test => {
                console.log(`   • ${test.name}: ${test.error ? test.error.message : 'Unknown error'}`);
            });
        }
    }
    
    /**
     * Print overall test results
     */
    printOverallResults() {
        const totalSuites = this.testResults.length;
        const totalTests = this.testResults.reduce((sum, suite) => sum + suite.passed + suite.failed, 0);
        const totalPassed = this.testResults.reduce((sum, suite) => sum + suite.passed, 0);
        const totalFailed = this.testResults.reduce((sum, suite) => sum + suite.failed, 0);
        const overallPassRate = totalTests > 0 ? (totalPassed / totalTests * 100).toFixed(1) : 0;
        const totalDuration = this.testResults.reduce((sum, suite) => sum + suite.duration, 0);
        
        console.log(`\n🏆 OVERALL TEST RESULTS`);
        console.log(`=====================================`);
        console.log(`📦 Test Suites: ${totalSuites}`);
        console.log(`🧪 Total Tests: ${totalTests}`);
        console.log(`✅ Passed: ${totalPassed}`);
        console.log(`❌ Failed: ${totalFailed}`);
        console.log(`📈 Overall Pass Rate: ${overallPassRate}%`);
        console.log(`⏱️  Total Duration: ${totalDuration.toFixed(2)}ms`);
        console.log(`=====================================`);
        
        if (totalFailed === 0) {
            console.log(`🎉 ALL TESTS PASSED! 🎉`);
        } else {
            console.log(`⚠️  ${totalFailed} tests need attention`);
        }
        
        return {
            suites: totalSuites,
            tests: totalTests,
            passed: totalPassed,
            failed: totalFailed,
            passRate: parseFloat(overallPassRate),
            duration: totalDuration
        };
    }
    
    /**
     * Integration test helpers
     */
    createRealCytoscapeInstance(containerId = 'test-cy-container') {
        // Create test container if it doesn't exist
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            container.style.width = '400px';
            container.style.height = '300px';
            container.style.position = 'absolute';
            container.style.top = '-9999px'; // Hide offscreen
            document.body.appendChild(container);
        }
        
        // Create real Cytoscape instance for integration tests
        if (typeof cytoscape !== 'undefined') {
            return cytoscape({
                container: container,
                elements: [],
                style: [
                    {
                        selector: 'node',
                        style: {
                            'background-color': '#666',
                            'width': 20,
                            'height': 20
                        }
                    }
                ]
            });
        } else {
            console.warn('Cytoscape.js not available for integration tests');
            return this.mockCytoscape;
        }
    }
    
    /**
     * Cleanup test resources
     */
    cleanup() {
        // Remove test containers
        const testContainers = document.querySelectorAll('[id^="test-cy-container"]');
        testContainers.forEach(container => {
            if (container.parentNode) {
                container.parentNode.removeChild(container);
            }
        });
    }
}

// Global test framework instance
window.GraphTestFramework = new GraphModuleTestFramework();

// Convenient global methods
window.describe = (name, fn) => window.GraphTestFramework.describe(name, fn);
window.it = (name, fn) => window.GraphTestFramework.it(name, fn);
window.expect = (actual) => window.GraphTestFramework.expect(actual);

console.log('📋 Graph Module Testing Framework loaded');
console.log('Usage: describe("Test Suite", () => { it("should work", () => { expect(true).toBeTruthy(); }); });');
