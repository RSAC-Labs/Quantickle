/**
 * Check Enhanced Functions Script
 * 
 * Simple diagnostic to see which enhanced functions are available
 */

function checkEnhancedFunctions() {
    console.log('🔍 Checking Enhanced Functions Availability...');
    console.log('=' .repeat(50));
    
    const enhancedFunctions = {
        'Background Grid': ['toggleBackgroundGrid', 'showBackgroundGrid', 'hideBackgroundGrid'],
        'Debug Tools': ['debugContainer', 'debugNodes', 'debugInfo', 'debugAll'],
        'Performance Manager': ['setupPerformanceMonitoring', 'checkMemoryUsage'],
        'Graph Styling': ['applyTheme'],
        'Graph Controls': ['getCurrentZoom', 'fitGraph', 'centerGraph'],
        'Selection Manager': ['selectAll', 'clearSelection', 'invertSelection'],
        'Graph Editor': ['addNode', 'deleteSelected', 'copyNodes', 'pasteNodes'],
        'Edge Creator': ['startEdgeCreation', 'getEdgeCreationStatus', 'cancelEdgeCreation'],
        'LOD Manager': ['determineLODLevel', 'applyAggressiveLOD', 'applyLODRendering'],
        'Progress Manager': ['showLoadingProgress', 'updateLoadingProgress', 'hideLoadingProgress'],
        '3D Rotation': ['getRotationInfo', 'set3DRotation', 'isAutoRotating', 'rotate3D']
    };
    
    let totalFunctions = 0;
    let availableFunctions = 0;
    
    for (const [moduleName, functions] of Object.entries(enhancedFunctions)) {
        console.log(`\n📋 ${moduleName}:`);
        
        for (const funcName of functions) {
            totalFunctions++;
            const isAvailable = typeof window[funcName] === 'function';
            if (isAvailable) {
                availableFunctions++;
                console.log(`  ✅ ${funcName}`);
            } else {
                console.log(`  ❌ ${funcName} (${typeof window[funcName]})`);
            }
        }
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log(`🎯 Results: ${availableFunctions}/${totalFunctions} enhanced functions available`);
    console.log(`📊 Availability: ${(availableFunctions/totalFunctions*100).toFixed(1)}%`);
    
    return { availableFunctions, totalFunctions };
}

function forceExposeAllEnhancedFunctions() {
    console.log('🚀 Force Exposing All Enhanced Functions...');
    
    const adapters = [
        'BackgroundGridAdapter', 'DebugToolsAdapter', 'PerformanceManagerModuleBootstrap',
        'GraphControlsModuleBootstrap', 'SelectionManagerAdapter', 'GraphEditorAdapter',
        'EdgeCreatorAdapter', 'LODManagerAdapter', 'ProgressManagerAdapter',
        'Rotation3DAdapter'
    ];
    
    adapters.forEach(adapterName => {
        const adapter = window[adapterName];
        if (adapterName === 'GraphControlsModuleBootstrap' || adapterName === 'PerformanceManagerModuleBootstrap') {
            if (adapter && typeof adapter.init === 'function') {
                adapter.init();
                adapter.exposeGlobalFunctions();
                console.log(`✅ ${adapterName}.init()`);
            } else {
                console.log(`❌ ${adapterName} - bootstrap not found`);
            }
            return;
        }
        if (adapter) {
            // Try different method names for exposing enhanced functions
            if (typeof adapter.exposeEnhancedFunctions === 'function') {
                adapter.exposeEnhancedFunctions();
                console.log(`✅ ${adapterName}.exposeEnhancedFunctions()`);
            } else if (typeof adapter.exposeModularGlobalFunctions === 'function') {
                adapter.exposeModularGlobalFunctions();
                console.log(`✅ ${adapterName}.exposeModularGlobalFunctions()`);
            } else if (typeof adapter.updateGlobalFunctions === 'function') {
                adapter.updateGlobalFunctions();
                console.log(`✅ ${adapterName}.updateGlobalFunctions()`);
            } else {
                console.log(`❌ ${adapterName} - no expose method found`);
            }
        } else {
            console.log(`❌ ${adapterName} - adapter not found`);
        }
    });

    if (!window.GraphStyling && typeof window.initGraphStylingModule === 'function') {
        const dependencies = {
            cytoscape: window.GraphRenderer ? window.GraphRenderer.cy : null,
            supportsShadowStyles: window.GraphRenderer
                ? window.GraphRenderer.supportsShadowStyles
                : true,
            notifications: {
                show: (message, type = 'info') => {
                    if (window.UI && window.UI.showNotification) {
                        window.UI.showNotification(message, type);
                    }
                }
            }
        };
        window.initGraphStylingModule(dependencies);
        console.log('✅ GraphStylingModule initialized');
    }

    if (window.GraphStyling && typeof window.exposeGraphStylingGlobals === 'function') {
        window.exposeGraphStylingGlobals(window.GraphStyling);
        console.log('✅ GraphStyling globals exposed');
    }
    
    console.log('\n🔍 Checking functions again after forced exposure...');
    return checkEnhancedFunctions();
}

// Global exposure
window.checkEnhancedFunctions = checkEnhancedFunctions;
window.forceExposeAllEnhancedFunctions = forceExposeAllEnhancedFunctions;

console.log('📋 Enhanced Functions Checker loaded!');
console.log('🔍 Run: window.checkEnhancedFunctions()');
console.log('🚀 Force: window.forceExposeAllEnhancedFunctions()');
