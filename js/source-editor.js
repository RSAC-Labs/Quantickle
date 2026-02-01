(function() {
    const SourceEditor = {
        editor: null,
        suppressChange: false,
        applyBtn: null,
        hasPendingChanges: false,

        init() {
            const textarea = document.getElementById('jsonSource');
            this.applyBtn = document.getElementById('applyJsonSource');
            if (!textarea || typeof CodeMirror === 'undefined') {
                return;
            }

            this.editor = CodeMirror.fromTextArea(textarea, {
                lineNumbers: true,
                mode: { name: 'javascript', json: true },
                theme: 'default'
            });

            if (this.applyBtn) {
                this.applyBtn.addEventListener('click', () => this.applyChanges());
            }

            this.refresh();

            this.editor.on('change', () => {
                if (this.suppressChange) {
                    return;
                }
                this.hasPendingChanges = true;
                if (this.applyBtn) {
                    this.applyBtn.style.display = 'inline-block';
                }
            });
        },

        applyChanges() {
            if (!this.editor) {
                return;
            }
            try {
                const data = JSON.parse(this.editor.getValue());
                if (window.DataManager && typeof window.DataManager.setGraphData === 'function') {
                    window.DataManager.setGraphData(data);
                }
                if (window.GraphRenderer && typeof window.GraphRenderer.renderGraph === 'function') {
                    window.GraphRenderer.renderGraph();
                }
                this.hasPendingChanges = false;
                if (this.applyBtn) {
                    this.applyBtn.style.display = 'none';
                }
            } catch (e) {
                alert('Invalid JSON: ' + e.message);
            }
        },

        refresh() {
            if (this.editor && window.DataManager && typeof window.DataManager.getGraphData === 'function') {
                const data = window.DataManager.getGraphData();
                this.suppressChange = true;
                this.editor.setValue(JSON.stringify(data, null, 2));
                this.editor.refresh();
                this.suppressChange = false;
                this.hasPendingChanges = false;
                if (this.applyBtn) {
                    this.applyBtn.style.display = 'none';
                }
            }
        }
    };

    window.SourceEditor = SourceEditor;

    document.addEventListener('DOMContentLoaded', () => {
        SourceEditor.init();
    });
})();

