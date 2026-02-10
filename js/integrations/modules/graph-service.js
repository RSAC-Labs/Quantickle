(function() {
    const createGraphService = () => {
        const getCy = () => window.GraphRenderer?.cy || null;

        const getGraphData = () => {
            if (window.DataManager?.getGraphData) {
                return window.DataManager.getGraphData();
            }
            return window.DataManager?.graphData || null;
        };

        const setGraphData = (graphData, options) => {
            if (window.DataManager?.setGraphData) {
                window.DataManager.setGraphData(graphData, options);
                return true;
            }
            return false;
        };

        const setGraphName = (name, options) => {
            if (window.DataManager?.setGraphName) {
                window.DataManager.setGraphName(name, options);
                return true;
            }
            if (window.DataManager) {
                window.DataManager.currentGraphName = name;
                return true;
            }
            return false;
        };

        const renderGraph = () => {
            if (window.GraphRenderer?.renderGraph) {
                window.GraphRenderer.renderGraph();
                return true;
            }
            return false;
        };

        const updateGraphUI = () => {
            if (window.GraphManager?.updateGraphUI) {
                window.GraphManager.updateGraphUI();
                return true;
            }
            return false;
        };

        const applyLayout = () => {
            if (window.LayoutManager?.applyLayout) {
                window.LayoutManager.applyLayout();
                return true;
            }
            return false;
        };

        return {
            getCy,
            getGraphData,
            setGraphData,
            setGraphName,
            renderGraph,
            updateGraphUI,
            applyLayout
        };
    };

    window.GraphServiceAdapter = {
        create: createGraphService
    };
})();
